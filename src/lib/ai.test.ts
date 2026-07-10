import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const executeToolMock = vi.fn(async () => "RISULTATO_STRUMENTO");
// Controls the DB-aware confirmation gate: whether a recent booking exists.
const hasRecentBookingMock = vi.fn(async () => false);
// The escalation safety net (model claims a handoff without calling the tool).
const escalateAndNotifyMock = vi.fn(async () => ({ ok: true, message: "ok" }));

vi.mock("openai", () => ({
  default: class {
    chat = { completions: { create: (...a: unknown[]) => createMock(...(a as [])) } };
  },
}));

vi.mock("@/lib/tools", () => ({
  TOOL_DEFINITIONS: [],
  executeTool: (...a: unknown[]) => executeToolMock(...(a as [])),
}));

// getAIResponse now reads business hours to inject into the prompt; stub it so
// this suite stays focused on the tool loop (and never touches supabase).
vi.mock("@/lib/booking", () => ({
  formatBusinessHours: async () => "Aperto:\n- martedì: 09:00–19:00\nChiuso: domenica, lunedì.",
  hasRecentBooking: (...a: unknown[]) => hasRecentBookingMock(...(a as [])),
}));

vi.mock("@/lib/escalation", () => ({
  escalateAndNotify: (...a: unknown[]) => escalateAndNotifyMock(...(a as [])),
}));

import { getAIResponse } from "@/lib/ai";

const ctx = {
  customerPhone: "393330000000",
  customerName: null,
  conversationId: "c1",
  now: new Date("2025-07-15T10:00:00Z"),
};

beforeEach(() => {
  createMock.mockReset();
  executeToolMock.mockClear();
  hasRecentBookingMock.mockReset();
  hasRecentBookingMock.mockResolvedValue(false);
  escalateAndNotifyMock.mockClear();
  escalateAndNotifyMock.mockResolvedValue({ ok: true, message: "ok" });
});

describe("getAIResponse", () => {
  it("returns the reply directly when the model uses no tools", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Buongiorno!", tool_calls: [] } }],
    });

    const reply = await getAIResponse([{ role: "user", content: "Ciao" }], ctx);

    expect(reply).toBe("Buongiorno!");
    expect(executeToolMock).not.toHaveBeenCalled();
  });

  it("runs a tool call, feeds the result back, then returns the final answer", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: null,
              tool_calls: [
                {
                  id: "call_1",
                  type: "function",
                  function: { name: "list_services", arguments: "{}" },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Ecco i nostri servizi.", tool_calls: [] } }],
      });

    const reply = await getAIResponse([{ role: "user", content: "Che servizi avete?" }], ctx);

    expect(executeToolMock).toHaveBeenCalledWith("list_services", {}, ctx, expect.any(Function));
    expect(reply).toBe("Ecco i nostri servizi.");
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it("falls back to a final text-only completion after exhausting tool rounds", async () => {
    // Always ask for a tool -> never terminates on its own within the loop.
    createMock.mockResolvedValue({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: "call_x",
                type: "function",
                function: { name: "list_services", arguments: "{}" },
              },
            ],
          },
        },
      ],
    });

    const reply = await getAIResponse([{ role: "user", content: "..." }], ctx);

    // 5 tool rounds + 1 final text-only call = 6 completions.
    expect(createMock).toHaveBeenCalledTimes(6);
    expect(typeof reply).toBe("string");
    expect(reply.length).toBeGreaterThan(0);
  });

  it("blocks a fake confirmation when book_appointment failed", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [
          { id: "b1", type: "function", function: { name: "book_appointment", arguments: "{}" } },
        ] } }],
      })
      // Model wrongly claims success despite the failed tool result.
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Prenotazione confermata! Ci vediamo domani 😊", tool_calls: [] } }],
      });
    // executeTool reports a FAILED booking through the track callback.
    executeToolMock.mockImplementationOnce(async (...a: unknown[]) => {
      const track = a[3] as (o: { name: string; ok: boolean; message: string }) => void;
      track?.({ name: "book_appointment", ok: false, message: "Quell'orario non è più disponibile." });
      return "Quell'orario non è più disponibile.";
    });

    const reply = await getAIResponse([{ role: "user", content: "Prenota le 17:30" }], ctx);
    // The false "confermata" is replaced with the real failure message.
    expect(reply).toBe("Quell'orario non è più disponibile.");
  });

  it("allows the confirmation when book_appointment succeeded", async () => {
    createMock
      .mockResolvedValueOnce({
        choices: [{ message: { content: null, tool_calls: [
          { id: "b1", type: "function", function: { name: "book_appointment", arguments: "{}" } },
        ] } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: "Prenotazione confermata! A domani 😊", tool_calls: [] } }],
      });
    executeToolMock.mockImplementationOnce(async (...a: unknown[]) => {
      const track = a[3] as (o: { name: string; ok: boolean; message: string }) => void;
      track?.({ name: "book_appointment", ok: true, message: "Prenotazione confermata: Taglio donna." });
      return "Prenotazione confermata: Taglio donna.";
    });

    const reply = await getAIResponse([{ role: "user", content: "Prenota le 10:00" }], ctx);
    expect(reply).toBe("Prenotazione confermata! A domani 😊");
  });

  it("blocks a confirmation when no tool ran this turn AND no recent booking exists in the DB", async () => {
    hasRecentBookingMock.mockResolvedValue(false);
    // Model claims a booking with no tool call at all (pure hallucination).
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Prenotazione confermata! A presto 😊", tool_calls: [] } }],
    });

    const reply = await getAIResponse([{ role: "user", content: "confermi?" }], ctx);
    expect(reply).toContain("non sono riuscito a completare la prenotazione");
    expect(hasRecentBookingMock).toHaveBeenCalledWith(ctx.customerPhone, ctx.now);
  });

  it("allows a confirmation echo when the booking really happened in a previous turn (split-message case)", async () => {
    // Reproduces the WhatsApp bug: turn 1 booked ("...alle 16... Maria Paola"),
    // then a second message ("Con Genny") makes the model re-confirm WITHOUT
    // calling book_appointment again. The DB check must let it through.
    hasRecentBookingMock.mockResolvedValue(true);
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Perfetto! Appuntamento confermato per le 16:00 con Genny 😊", tool_calls: [] } }],
    });

    const reply = await getAIResponse([{ role: "user", content: "Con Genny" }], ctx);
    expect(reply).toBe("Perfetto! Appuntamento confermato per le 16:00 con Genny 😊");
    expect(hasRecentBookingMock).toHaveBeenCalledWith(ctx.customerPhone, ctx.now);
  });

  it("enforces escalation when the model claims a handoff without calling the tool", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Certo, ho inoltrato la tua richiesta a un operatore che ti ricontatterà a breve.", tool_calls: [] } }],
    });

    const reply = await getAIResponse([{ role: "user", content: "voglio un operatore" }], ctx);
    expect(reply).toContain("operatore");
    // The narrated-but-not-called handoff is made real by the safety net.
    expect(escalateAndNotifyMock).toHaveBeenCalledTimes(1);
    expect(escalateAndNotifyMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "c1", customerPhone: ctx.customerPhone })
    );
  });

  it("does NOT trigger the escalation net for an ordinary reply", async () => {
    createMock.mockResolvedValueOnce({
      choices: [{ message: { content: "Certo! Che servizio ti interessa?", tool_calls: [] } }],
    });
    await getAIResponse([{ role: "user", content: "Ciao" }], ctx);
    expect(escalateAndNotifyMock).not.toHaveBeenCalled();
  });
});
