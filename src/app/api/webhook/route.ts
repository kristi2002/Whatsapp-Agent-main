import { NextRequest } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { getAIResponse } from "@/lib/ai";

// Persistent Node server (Coolify) — keep this route on the Node runtime so we
// can process the message after responding 200.
export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Webhook verification (Meta calls GET once when you set up the webhook).
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge, { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

/** Verify Meta's X-Hub-Signature-256 header against the raw request body. */
function verifySignature(rawBody: string, signature: string | null): boolean {
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

// ---------------------------------------------------------------------------
// Incoming messages. We validate + respond 200 fast, then process in the
// background so Meta doesn't retry (its timeout is ~5s) and cause duplicates.
// ---------------------------------------------------------------------------
export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return Response.json({ status: "bad_json" });
  }

  // Fire-and-forget: process without blocking the 200 response.
  processEvent(body).catch((err) => console.error("processEvent error:", err));

  return Response.json({ status: "received" });
}

/* eslint-disable @typescript-eslint/no-explicit-any */
async function processEvent(body: any): Promise<void> {
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

  // Conversation history for context (last 20 messages).
  const { data: history } = await supabase
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: true })
    .limit(20);

  const aiResponse = await getAIResponse(
    (history || []).map((m) => ({
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
