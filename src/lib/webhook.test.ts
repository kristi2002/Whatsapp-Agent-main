import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

// --- Mocked dependencies (hoisted so vi.mock can see them) ---------------
const h = vi.hoisted(() => {
  const state: { queue: unknown[] } = { queue: [] };
  // A chainable, thenable Supabase query-builder stub. Every awaited chain
  // shifts one pre-seeded result off `state.queue`.
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "in", "lt", "gt", "gte", "order", "limit", "single",
  ];
  for (const m of methods) builder[m] = () => builder;
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown
  ) => {
    const next = state.queue.length ? state.queue.shift() : { data: null, error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  const supabase = { from: () => builder };
  return { state, supabase };
});

const aiMock = vi.fn(async () => "Ciao! Come posso aiutarti?");
const sendMock = vi.fn(async () => ({ ok: true }));

vi.mock("@/lib/supabase", () => ({ supabase: h.supabase, getSupabase: () => h.supabase }));
vi.mock("@/lib/ai", () => ({ getAIResponse: (...a: unknown[]) => aiMock(...(a as [])) }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsAppMessage: (...a: unknown[]) => sendMock(...(a as [])) }));

import { verifySignature, processEvent } from "@/lib/webhook";

function textPayload(body: string, name = "Mario") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              contacts: [{ profile: { name } }],
              messages: [
                { from: "393330000000", id: "wamid.1", type: "text", text: { body } },
              ],
            },
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  h.state.queue = [];
  aiMock.mockClear();
  sendMock.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("verifySignature", () => {
  const body = '{"hello":"world"}';

  it("accepts a correct HMAC-SHA256 signature", () => {
    const sig =
      "sha256=" +
      crypto.createHmac("sha256", "test-app-secret").update(body).digest("hex");
    expect(verifySignature(body, sig)).toBe(true);
  });

  it("rejects a wrong signature", () => {
    expect(verifySignature(body, "sha256=deadbeef")).toBe(false);
  });

  it("rejects a missing signature when a secret is configured", () => {
    expect(verifySignature(body, null)).toBe(false);
  });

  it("skips verification (returns true) when no secret is configured", () => {
    vi.stubEnv("WHATSAPP_APP_SECRET", "");
    expect(verifySignature(body, null)).toBe(true);
  });
});

describe("processEvent", () => {
  it("ignores non-WhatsApp payloads", async () => {
    await processEvent({ object: "page" });
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("ignores non-text messages", async () => {
    const p = textPayload("x");
    p.entry[0].changes[0].value.messages[0].type = "image";
    await processEvent(p);
    expect(aiMock).not.toHaveBeenCalled();
  });

  it("creates a conversation, generates a reply, and sends it (agent mode)", async () => {
    h.state.queue = [
      { data: null }, // select conversation -> not found
      { data: { id: "c1", mode: "agent", name: "Mario" } }, // insert conversation
      { error: null }, // insert user message
      {}, // update conversation timestamp
      { data: [] }, // select history
      // trailing insert(assistant) + update default to {data:null}
    ];
    await processEvent(textPayload("Ciao"));
    expect(aiMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith("393330000000", "Ciao! Come posso aiutarti?");
  });

  it("does not auto-reply in human mode", async () => {
    h.state.queue = [
      { data: { id: "c1", mode: "human", name: "Mario" } }, // existing conversation
      { error: null }, // insert user message
      {}, // update timestamp
    ];
    await processEvent(textPayload("Ciao"));
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops duplicate deliveries (unique-violation) without replying", async () => {
    h.state.queue = [
      { data: { id: "c1", mode: "agent", name: "Mario" } }, // existing conversation
      { error: { code: "23505" } }, // insert user message -> duplicate
    ];
    await processEvent(textPayload("Ciao"));
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
