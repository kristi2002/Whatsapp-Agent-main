import OpenAI from "openai";
import { buildSalonSystemPrompt } from "@/lib/system-prompt";
import { formatBusinessHours } from "@/lib/booking";
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
  // Read the salon's real opening hours so the assistant never offers a closed
  // day or an out-of-hours slot. Non-fatal: fall back to tool-only guidance.
  let hoursLabel: string | null = null;
  try {
    hoursLabel = await formatBusinessHours();
  } catch (err) {
    console.error("formatBusinessHours failed:", err);
  }

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: buildSalonSystemPrompt(ctx.now, ctx.customerName, hoursLabel) },
    ...history,
  ];

  // Track the REAL outcome of booking-mutating tools this turn, so we never let
  // the model send a "prenotazione confermata" that isn't backed by a DB write.
  let bookingOk = false;       // a book/reschedule actually succeeded
  let bookingFailed = false;   // a book/reschedule was attempted but failed
  let lastFailureMsg = "";     // the real failure message to relay instead
  const logPrefix = `[ai convo=${ctx.conversationId ?? "?"}]`;
  const track = (o: { name: string; ok: boolean; message: string }) => {
    if (o.name === "book_appointment" || o.name === "reschedule_appointment") {
      if (o.ok) bookingOk = true;
      else { bookingFailed = true; lastFailureMsg = o.message; }
    }
    console.log(`${logPrefix} tool result ${o.name} ok=${o.ok}`);
  };

  // A reply that claims a NEW booking was just made (not a reschedule, which
  // says "spostato", nor a listing from get_my_appointments).
  const CONFIRMATION_RE =
    /prenotazione\s+conferm|ho\s+prenotat|appuntamento[^.!?\n]{0,30}(?:conferm|prenotat)|ti\s+ho\s+(?:prenotat|fissat)|fissat\w*\s+l['’]appuntamento/i;

  /**
   * Final safety gate: if the model claims a fresh booking but no booking
   * actually succeeded this turn, don't send the false confirmation — relay the
   * real failure (or a safe retry prompt) instead. Never blocks a real booking,
   * because a successful book_appointment sets bookingOk=true.
   */
  const finalize = (text: string | null | undefined): string => {
    const reply = text || "Scusa, non sono riuscito a rispondere. Riprova.";
    if (!bookingOk && CONFIRMATION_RE.test(reply)) {
      console.warn(
        `${logPrefix} BLOCKED a booking confirmation with no successful booking ` +
          `(bookingFailed=${bookingFailed}). Model said: ${reply.slice(0, 160)}`
      );
      return (
        lastFailureMsg ||
        "Scusa, non sono riuscito a completare la prenotazione in questo momento. " +
          "Puoi ripetermi servizio, giorno e orario così ricontrollo la disponibilità? " +
          "In alternativa puoi chiamare il salone."
      );
    }
    return reply;
  };

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
      return finalize(choice.content);
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
      console.log(`${logPrefix} tool call ${call.function.name} ${call.function.arguments || "{}"}`);
      const result = await executeTool(call.function.name, args, ctx, track);
      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: result,
      });
    }
  }

  // Ran out of tool rounds — ask the model for a final text-only answer.
  console.warn(`${logPrefix} tool rounds (${MAX_TOOL_ROUNDS}) exhausted; forcing a final text answer`);
  const finalMsg = await getOpenAI().chat.completions.create({ model: MODEL, messages });
  return finalize(finalMsg.choices[0]?.message?.content);
}
