import { NextRequest } from "next/server";
import { verifySignature, processEvent } from "@/lib/webhook";

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
