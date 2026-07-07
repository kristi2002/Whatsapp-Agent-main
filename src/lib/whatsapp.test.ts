import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendWhatsAppMessage } from "@/lib/whatsapp";

beforeEach(() => {
  vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "PN123");
  vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "tok_abc");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendWhatsAppMessage", () => {
  it("POSTs the correct Graph API request and returns the parsed JSON", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify({ messages: [{ id: "wamid.out" }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const result = await sendWhatsAppMessage("393330000000", "Ciao!");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v22.0/PN123/messages");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok_abc");
    expect(JSON.parse(init?.body as string)).toEqual({
      messaging_product: "whatsapp",
      to: "393330000000",
      type: "text",
      text: { body: "Ciao!" },
    });
    expect(result).toEqual({ messages: [{ id: "wamid.out" }] });
  });

  it("throws when Meta returns a non-2xx response (e.g. expired token)", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "Error validating access token" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    );
    await expect(sendWhatsAppMessage("393330000000", "Ciao!")).rejects.toThrow(/WhatsApp send failed \(401\)/);
  });
});
