/**
 * Webhook logic, extracted from the route handler so it can be unit-tested
 * without spinning up Next.js. The route in
 * `src/app/api/webhook/route.ts` is a thin wrapper around these functions.
 */

import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, sendTypingIndicator } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

/** Verify Meta's X-Hub-Signature-256 header against the raw request body. */
export function verifySignature(
  rawBody: string,
  signature: string | null
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) return true; // not configured — skip (set it in production!)
  if (!signature) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const AI_FALLBACK =
  "Scusa, sto avendo un problema tecnico in questo momento. Riprova tra poco, oppure chiama il salone. 🙏";
const NON_TEXT_REPLY =
  "Al momento riesco a leggere solo messaggi di testo. Scrivimi pure a parole cosa ti serve (es. “vorrei prenotare un taglio venerdì”) 😊";

/**
 * Serialize async tasks per key (phone number) so two webhook deliveries for
 * the same customer can't interleave (which could double-book or corrupt the
 * conversation). In-memory: correct for a single persistent Node instance.
 */
const phoneChains = new Map<string, Promise<unknown>>();
export function runSerial<T>(key: string, task: () => Promise<T>): Promise<T> {
  const prev = phoneChains.get(key) ?? Promise.resolve();
  const run = prev.catch(() => {}).then(() => task());
  phoneChains.set(key, run);
  run.finally(() => { if (phoneChains.get(key) === run) phoneChains.delete(key); });
  return run;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Process an inbound Meta webhook payload. Iterates EVERY message in the batch
 * (Meta can deliver several at once) and handles each independently so one bad
 * message can't drop the others. Safe to call fire-and-forget.
 */
export async function processEvent(body: any): Promise<void> {
  if (body?.object !== "whatsapp_business_account") return;
  for (const entry of body.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value;
      for (const message of value?.messages ?? []) {
        const phone: string | undefined = message?.from;
        const task = () =>
          processMessage(value, message).catch((err) => console.error("processMessage error:", err));
        if (phone) await runSerial(phone, task);
        else await task();
      }
    }
  }
}

/** Handle a single inbound message. */
async function processMessage(value: any, message: any): Promise<void> {
  const phone: string | undefined = message?.from;
  if (!phone) return;
  const name: string | null = value?.contacts?.[0]?.profile?.name || null;
  const whatsappMsgId: string | undefined = message?.id;

  // Find or create the conversation.
  let { data: conversation } = await supabase
    .from("conversations")
    .select("*")
    .eq("phone", phone)
    .single();

  if (!conversation) {
    const { data: newConvo } = await supabase
      .from("conversations")
      .insert({ phone, name })
      .select()
      .single();
    conversation = newConvo;
  } else if (name && name !== conversation.name) {
    await supabase.from("conversations").update({ name }).eq("id", conversation.id);
  }
  if (!conversation) return;

  // Non-text (voice, image, location, …): acknowledge once, don't run the AI.
  if (message.type !== "text") {
    if (conversation.mode !== "human") {
      try { await sendWhatsAppMessage(phone, NON_TEXT_REPLY); } catch (err) { console.error("send failed:", err); }
    }
    return;
  }

  const text: string = message.text?.body ?? "";

  // Store the user message (ignore duplicate deliveries).
  const { error: insertError } = await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "user",
    content: text,
    whatsapp_msg_id: whatsappMsgId,
  });
  if (insertError?.code === "23505") return; // duplicate

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);

  // Human mode — staff will reply from the gestionale; don't auto-answer.
  if (conversation.mode === "human") return;

  // Show a native "typing…" indicator while the AI works through its tool loop
  // (up to 5 rounds of model + DB calls can take several seconds). Best-effort:
  // fire-and-forget so it never delays or blocks the actual reply.
  if (whatsappMsgId) void sendTypingIndicator(whatsappMsgId);

  // Conversation history: the MOST RECENT 20 messages, chronological order.
  const { data: recent } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (recent || []).slice().reverse();

  // Generate the reply; NEVER leave the customer without an answer.
  let aiResponse: string;
  try {
    aiResponse = await getAIResponse(
      history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        customerPhone: phone,
        customerName: name ?? conversation.name ?? null,
        conversationId: conversation.id,
        now: new Date(),
      }
    );
  } catch (err) {
    console.error("getAIResponse failed:", err);
    aiResponse = AI_FALLBACK;
  }

  try {
    await sendWhatsAppMessage(phone, aiResponse);
  } catch (err) {
    console.error("sendWhatsAppMessage failed:", err);
  }

  await supabase.from("messages").insert({
    conversation_id: conversation.id,
    role: "assistant",
    content: aiResponse,
  });

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversation.id);
}
