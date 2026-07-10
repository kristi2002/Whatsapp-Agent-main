/**
 * Send a WhatsApp text message via the Meta Graph API.
 * Throws on a non-2xx response so delivery failures (expired token, blocked
 * recipient, etc.) surface to the caller and land in the logs instead of being
 * silently swallowed.
 */
export async function sendWhatsAppMessage(to: string, body: string) {
  const res = await fetch(
    `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = (data as { error?: { message?: string } })?.error?.message || res.statusText;
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }
  return data;
}

/**
 * Send an internal alert to the salon's staff WhatsApp number (STAFF_NOTIFY_NUMBER)
 * — e.g. a customer asked for a human, or the AI is failing. Best-effort: no-op
 * if the number isn't configured, and never throws (a failed alert must not
 * break the customer-facing flow).
 *
 * NOTE: like all outbound messages, plain text only reaches the staff number
 * inside Meta's 24h service window; use an approved template for cold sends.
 */
export async function notifyStaff(body: string): Promise<void> {
  const to = process.env.STAFF_NOTIFY_NUMBER;
  if (!to) return; // not configured — silently skip
  try {
    await sendWhatsAppMessage(to, body);
  } catch (err) {
    console.error("notifyStaff failed (non-fatal):", err);
  }
}

/**
 * Show a native "typing…" indicator in the customer's chat (and mark their
 * message read) via Meta's typing-indicator API. It lasts up to 25s or until we
 * send the reply — whichever comes first — so it covers the latency of the
 * multi-round AI tool loop without sending a chatty placeholder message.
 *
 * Best-effort: never throws. A failure here must not stop us from answering, so
 * the caller fires it and ignores the result.
 */
export async function sendTypingIndicator(messageId: string): Promise<void> {
  if (!messageId) return;
  try {
    await fetch(
      `https://graph.facebook.com/v22.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          status: "read",
          message_id: messageId,
          typing_indicator: { type: "text" },
        }),
      }
    );
  } catch (err) {
    console.error("sendTypingIndicator failed (non-fatal):", err);
  }
}
