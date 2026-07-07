import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();
const executeToolMock = vi.fn(async () => "RISULTATO_STRUMENTO");

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
});
