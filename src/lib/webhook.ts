/**
 * Webhook logic, extracted from the route handler so it can be unit-tested
 * without spinning up Next.js. The route in
 * `src/app/api/webhook/route.ts` is a thin wrapper around these functions.
 */

import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage, sendTypingIndicator, notifyStaff } from "@/lib/whatsapp";
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

// The AI failing (e.g. an expired/over-limit OpenRouter key) previously showed
// the customer the fallback while staff had no idea the assistant was down. We
// now alert the staff number, rate-limited so one outage doesn't spam it.
let lastAiFailureAlertAt = 0;
const AI_FAILURE_ALERT_COOLDOWN_MS = 15 * 60_000; // at most one alert / 15 min
function alertStaffAiDown(phone: string, err: unknown): void {
  const now = Date.now();
  if (now - lastAiFailureAlertAt < AI_FAILURE_ALERT_COOLDOWN_MS) return;
  lastAiFailureAlertAt = now;
  const detail = String((err as Error)?.message ?? err).slice(0, 200);
  void notifyStaff(
    `⚠️ L'assistente AI non è riuscito a rispondere a un cliente (${phone}) e ha inviato il messaggio di errore. ` +
      `Dettaglio: ${detail}. Controlla il credito/chiave OpenRouter (AI_MODEL / OPENROUTER_API_KEY).`
  );
}
const NON_TEXT_REPLY =
  "Al momento riesco a leggere solo messaggi di testo. Scrivimi pure a parole cosa ti serve (es. “vorrei prenotare un taglio venerdì”) 😊";
const EMPTY_TEXT_REPLY =
  "Scusa, non ho ricevuto nessun testo nel messaggio. Puoi riscrivermi cosa ti serve? 😊";

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
 * Coalescing window (ms). People type on WhatsApp in bursts ("...alle 16... a
 * nome di Maria Paola" then "Con Genny"). Without coalescing each message is a
 * separate AI turn, which double-processes one intent — the agent booked on the
 * first, then produced a second (un-backed) confirmation the safety gate turned
 * into a confusing "Scusa, non sono riuscito…". We ingest every message
 * immediately (so nothing is dropped) but debounce the REPLY: each new message
 * resets the timer, and the agent answers once over the full history.
 */
function coalesceWindowMs(): number {
  const v = Number(process.env.COALESCE_WINDOW_MS);
  return Number.isFinite(v) && v >= 0 ? v : 2500;
}

/** Pending reply timer per phone (single persistent Node instance). */
const replyTimers = new Map<string, ReturnType<typeof setTimeout>>();

type ReplySnapshot = { phone: string; conversationId: string; name: string | null };

/**
 * (Re)schedule the debounced reply for a phone. Called on every ingested
 * text message in agent mode; the last message in a burst wins.
 */
function scheduleReply(snap: ReplySnapshot): void {
  const existing = replyTimers.get(snap.phone);
  if (existing) clearTimeout(existing);
  const timer = setTimeout(() => {
    replyTimers.delete(snap.phone);
    // Serialize the reply per phone so two bursts can't produce overlapping
    // answers, and so it runs after any in-flight ingest for this phone.
    void runSerial(snap.phone, () =>
      generateAndSendReply(snap).catch((err) => console.error("generateAndSendReply error:", err))
    );
  }, coalesceWindowMs());
  replyTimers.set(snap.phone, timer);
}

/**
 * Process an inbound Meta webhook payload. Iterates EVERY message in the batch
 * (Meta can deliver several at once) and ingests each independently so one bad
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
          ingestMessage(value, message).catch((err) => console.error("ingestMessage error:", err));
        // Ingest is serialized per phone so concurrent deliveries can't race on
        // conversation creation or interleave message order.
        if (phone) await runSerial(phone, task);
        else await task();
      }
    }
  }
}

/**
 * Ingest a single inbound message: store it, dedupe, handle non-text/human
 * mode, and (in agent mode) schedule the debounced reply. Fast — never runs
 * the AI itself, so a burst of messages is stored in order before any reply.
 */
async function ingestMessage(value: any, message: any): Promise<void> {
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

  // Blank / whitespace-only text: don't store it (an empty message poisons the
  // AI history — the model API rejects empty content) and don't run the AI.
  // Just ask the customer to rephrase.
  if (!text.trim()) {
    if (conversation.mode !== "human") {
      try { await sendWhatsAppMessage(phone, EMPTY_TEXT_REPLY); } catch (err) { console.error("send failed:", err); }
    }
    return;
  }

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

  // Show a native "typing…" indicator immediately (covers the coalescing window
  // plus the AI tool loop) and mark the message read. Best-effort, never throws.
  if (whatsappMsgId) void sendTypingIndicator(whatsappMsgId);

  // Debounce the reply: a follow-up message within the window answers together.
  scheduleReply({ phone, conversationId: conversation.id, name: name ?? conversation.name ?? null });
}

/**
 * Generate and send the agent reply for a conversation, over the FULL recent
 * history (so a coalesced burst is answered as one turn). Runs after the
 * debounce window; never leaves the customer without an answer.
 */
async function generateAndSendReply(snap: ReplySnapshot): Promise<void> {
  const { phone, conversationId, name } = snap;

  // Conversation history: the MOST RECENT 20 messages, chronological order.
  const { data: recent } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (recent || []).slice().reverse();

  let aiResponse: string;
  try {
    aiResponse = await getAIResponse(
      history.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      {
        customerPhone: phone,
        customerName: name,
        conversationId,
        now: new Date(),
      }
    );
  } catch (err) {
    console.error("getAIResponse failed:", err);
    aiResponse = AI_FALLBACK;
    alertStaffAiDown(phone, err); // let staff know the assistant is down
  }

  try {
    await sendWhatsAppMessage(phone, aiResponse);
  } catch (err) {
    console.error("sendWhatsAppMessage failed:", err);
  }

  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: aiResponse,
  });

  await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
}
