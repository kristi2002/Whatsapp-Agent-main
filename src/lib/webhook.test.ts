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
const sendMock = vi.fn(async (_phone: string, _msg: string) => ({ ok: true }));
const typingMock = vi.fn(async (_id: string) => {});

vi.mock("@/lib/supabase", () => ({ supabase: h.supabase, getSupabase: () => h.supabase }));
vi.mock("@/lib/ai", () => ({ getAIResponse: (...a: unknown[]) => aiMock(...(a as [])) }));
const notifyStaffMock = vi.fn(async (_msg: string) => {});
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppMessage: (...a: unknown[]) => sendMock(...(a as [string, string])),
  sendTypingIndicator: (...a: unknown[]) => typingMock(...(a as [string])),
  notifyStaff: (...a: unknown[]) => notifyStaffMock(...(a as [string])),
}));

import { verifySignature, processEvent, runSerial } from "@/lib/webhook";

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
  typingMock.mockClear();
  notifyStaffMock.mockClear();
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
  // The reply is debounced (coalescing window). Use fake timers and advance
  // past the default window to flush the scheduled reply.
  const WINDOW = 3000;
  const flushReply = () => vi.advanceTimersByTimeAsync(WINDOW);

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("ignores non-WhatsApp payloads", async () => {
    await processEvent({ object: "page" });
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("ignores non-text messages", async () => {
    const p = textPayload("x");
    p.entry[0].changes[0].value.messages[0].type = "image";
    await processEvent(p);
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
  });

  it("creates a conversation, generates a reply, and sends it (agent mode)", async () => {
    h.state.queue = [
      { data: null }, // select conversation -> not found
      { data: { id: "c1", mode: "agent", name: "Mario" } }, // insert conversation
      { error: null }, // insert user message
      {}, // update conversation timestamp (ingest)
      { data: [] }, // select history (reply)
      // trailing insert(assistant) + update default to {data:null}
    ];
    await processEvent(textPayload("Ciao"));
    // A typing indicator is fired at ingest, before the debounced reply runs.
    expect(typingMock).toHaveBeenCalledWith("wamid.1");
    expect(aiMock).not.toHaveBeenCalled(); // reply is still debounced
    await flushReply();
    expect(aiMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledWith("393330000000", "Ciao! Come posso aiutarti?");
  });

  it("asks to rephrase on a blank/whitespace-only message (no AI, not stored)", async () => {
    h.state.queue = [{ data: { id: "c1", mode: "agent", name: "Mario" } }]; // existing conversation
    await processEvent(textPayload("   "));
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][1]).toContain("non ho ricevuto nessun testo");
  });

  it("does not auto-reply in human mode", async () => {
    h.state.queue = [
      { data: { id: "c1", mode: "human", name: "Mario" } }, // existing conversation
      { error: null }, // insert user message
      {}, // update timestamp
    ];
    await processEvent(textPayload("Ciao"));
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("drops duplicate deliveries (unique-violation) without replying", async () => {
    h.state.queue = [
      { data: { id: "c1", mode: "agent", name: "Mario" } }, // existing conversation
      { error: { code: "23505" } }, // insert user message -> duplicate
    ];
    await processEvent(textPayload("Ciao"));
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("sends a fallback reply when the AI call throws (no silent failure)", async () => {
    aiMock.mockRejectedValueOnce(new Error("openrouter down"));
    h.state.queue = [
      { data: { id: "c1", mode: "agent", name: "Mario" } }, // existing conversation
      { error: null }, // insert user message
      {}, // update timestamp
      { data: [] }, // history
    ];
    await processEvent(textPayload("Ciao"));
    await flushReply();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][1]).toContain("problema tecnico");
    // Staff are alerted that the assistant is down (not a silent failure).
    expect(notifyStaffMock).toHaveBeenCalledTimes(1);
  });

  it("acknowledges a non-text message with a text-only note (agent mode)", async () => {
    const p = textPayload("x");
    p.entry[0].changes[0].value.messages[0].type = "audio";
    h.state.queue = [{ data: { id: "c1", mode: "agent", name: "Mario" } }]; // existing conversation
    await processEvent(p);
    await flushReply();
    expect(aiMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sendMock.mock.calls[0][1]).toContain("solo messaggi di testo");
  });

  it("stores every message in a burst but COALESCES them into a single reply", async () => {
    const batch = {
      object: "whatsapp_business_account",
      entry: [{ changes: [{ value: {
        contacts: [{ profile: { name: "Mario" } }],
        messages: [
          { from: "393330000000", id: "wamid.1", type: "text", text: { body: "uno" } },
          { from: "393330000000", id: "wamid.2", type: "text", text: { body: "due" } },
        ],
      } }] }],
    };
    // Two ingests (select, insertUser, updateTs each) then ONE reply
    // (history, insertAssistant, updateTs).
    const conv = { data: { id: "c1", mode: "agent", name: "Mario" } };
    h.state.queue = [
      conv, { error: null }, {},
      conv, { error: null }, {},
      { data: [] }, {}, {},
    ];
    await processEvent(batch);
    // Both messages were ingested (typing fired for each).
    expect(typingMock).toHaveBeenCalledTimes(2);
    await flushReply();
    // ...but the agent answers the burst as a single turn.
    expect(aiMock).toHaveBeenCalledTimes(1);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });
});

describe("runSerial", () => {
  it("serializes tasks with the same key, runs different keys in parallel", async () => {
    const events: string[] = [];
    const mk = (id: string, ms: number) => async () => {
      events.push(`${id}:start`);
      await new Promise((r) => setTimeout(r, ms));
      events.push(`${id}:end`);
    };
    const p1 = runSerial("A", mk("1", 25));
    const p2 = runSerial("A", mk("2", 1)); // same key -> must wait for task 1
    const p3 = runSerial("B", mk("3", 1)); // different key -> independent
    await Promise.all([p1, p2, p3]);
    expect(events.indexOf("2:start")).toBeGreaterThan(events.indexOf("1:end"));
  });
});
