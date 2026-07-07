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
