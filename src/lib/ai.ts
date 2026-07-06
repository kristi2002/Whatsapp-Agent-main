import OpenAI from "openai";
import { buildSalonSystemPrompt } from "@/lib/system-prompt";
import { TOOL_DEFINITIONS, executeTool, type ToolContext } from "@/lib/tools";

// Lazily construct the client so importing this module (e.g. during
// `next build` page-data collection) doesn't require the API key to exist.
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({
      baseURL: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
    });
  }
  return _openai;
}

const MODEL = process.env.AI_MODEL || "anthropic/claude-sonnet-4-20250514";
const MAX_TOOL_ROUNDS = 5;

/**
 * Generate an assistant reply, running a tool-calling loop so the model can
 * check real availability and create/cancel bookings before answering.
 */
export async function getAIResponse(
  history: { role: "user" | "assistant"; content: string }[],
  ctx: ToolContext
): Promise<string> {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSalonSystemPrompt(ctx.now, ctx.customerName) },
    ...history,
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const completion = await getOpenAI().chat.completions.create({
      model: MODEL,
      messages,
      tools: TOOL_DEFINITIONS,
      tool_choice: "auto",
    });

    const choice = completion.choices[0]?.message;
    if (!choice) break;

    const toolCalls = choice.tool_calls ?? [];
    if (toolCalls.length === 0) {
      return choice.content || "Scusa, non sono riuscito a rispondere. Riprova.";
    }

    // Record the assistant turn that requested the tools.
    messages.push(choice);

    // Execute each requested tool and feed results back.
    for (const call of toolCalls) {
      if (call.type !== "function") continue;
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.function.arguments || "{}");
      } catch {
        args = {};
      }
      const result = await executeTool(call.function.name, args, ctx);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  // Ran out of tool rounds — ask the model for a final text-only answer.
  const finalMsg = await getOpenAI().chat.completions.create({ model: MODEL, messages });
  return (
    finalMsg.choices[0]?.message?.content ||
    "Scusa, qualcosa è andato storto. Puoi chiamare il salone per assistenza."
  );
}
