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

    expect(executeToolMock).toHaveBeenCalledWith("list_services", {}, ctx);
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
});
