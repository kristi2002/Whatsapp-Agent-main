/**
 * Webhook logic, extracted from the route handler so it can be unit-tested
 * without spinning up Next.js. The route in
 * `src/app/api/webhook/route.ts` is a thin wrapper around these functions.
 */

import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
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

/**
 * Process an inbound Meta webhook payload: persist the message, and (in agent
 * mode) generate + send an AI reply. Safe to call fire-and-forget.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function processEvent(body: any): Promise<void> {
  if (body?.object !== "whatsapp_business_account") return;

  const value = body.entry?.[0]?.changes?.[0]?.value;
  const message = value?.messages?.[0];
  if (!message) return; // status update, not a message
  if (message.type !== "text") return;

  const phone: string = message.from;
  const text: string = message.text.body;
  const name: string | null = value.contacts?.[0]?.profile?.name || null;
  const whatsappMsgId: string = message.id;

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

  // Conversation history for context: the MOST RECENT 20 messages, in
  // chronological order. Fetch descending + limit (to get the latest, not the
  // oldest) then reverse so the model reads them oldest -> newest.
  const { data: recent } = await supabase
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(20);
  const history = (recent || []).slice().reverse();

  const aiResponse = await getAIResponse(
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

  await sendWhatsAppMessage(phone, aiResponse);

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
