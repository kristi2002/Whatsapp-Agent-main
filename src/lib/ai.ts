import OpenAI from "openai";
import { buildSalonSystemPrompt } from "@/lib/system-prompt";
import { formatBusinessHours, hasRecentBooking, listActiveServices, formatServiceList } from "@/lib/booking";
import { escalateAndNotify } from "@/lib/escalation";
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
  let escalated = false;       // escalate_to_human actually ran this turn
  const logPrefix = `[ai convo=${ctx.conversationId ?? "?"}]`;
  const track = (o: { name: string; ok: boolean; message: string }) => {
    if (o.name === "book_appointment" || o.name === "reschedule_appointment") {
      if (o.ok) bookingOk = true;
      else { bookingFailed = true; lastFailureMsg = o.message; }
    }
    if (o.name === "escalate_to_human" && o.ok) escalated = true;
    console.log(`${logPrefix} tool result ${o.name} ok=${o.ok}`);
  };

  // A reply that CLAIMS the conversation was handed to a human operator. Used to
  // enforce the action if the model narrated it without calling the tool.
  const ESCALATION_RE =
    /(inoltrat\w+|passat\w+|segnalat\w+|avvisat\w+|allertat\w+)[^.!?\n]{0,40}operator|un\s+operator\w+[^.!?\n]{0,30}(ti\s+)?(ricontatt|rispond)/i;

  // A reply that PROMISES to show the service list ("ecco i nostri servizi",
  // "ti elenco i servizi"). Tool output isn't shown to the customer, so if the
  // model says this without actually listing anything, we append the real list.
  const SERVICES_PROMISE_RE =
    /(ecco|questi sono|ti (elenco|mostro)|di seguito|trovi qui)[^.!?\n]{0,25}\bserviz/i;

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
  const finalize = async (text: string | null | undefined): Promise<string> => {
    const reply = text || "Scusa, non sono riuscito a rispondere. Riprova.";
    if (!bookingOk && CONFIRMATION_RE.test(reply)) {
      // The model claims a fresh booking but no booking tool succeeded THIS turn.
      // Before overriding with a failure, check the DB: the booking may have
      // completed in a PREVIOUS turn (classic case: the customer split the
      // request across two messages, so this turn only echoes the confirmation).
      // If a matching recent booking exists, the confirmation is real — allow it.
      if (!bookingFailed) {
        try {
          if (await hasRecentBooking(ctx.customerPhone, ctx.now)) {
            console.log(
              `${logPrefix} confirmation allowed: a recent booking for this phone ` +
                `exists in the DB (likely completed in a previous turn).`
            );
            return reply;
          }
        } catch (err) {
          console.error(`${logPrefix} hasRecentBooking check failed:`, err);
        }
      }
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
    // Safety net: if the model TELLS the customer it handed off to a human but
    // never called escalate_to_human, make the claim true (flip to human + alert
    // staff) so the promise isn't silently broken — the code is the source of
    // truth, exactly like the booking gate above.
    if (!escalated && ESCALATION_RE.test(reply)) {
      try {
        const res = await escalateAndNotify({
          conversationId: ctx.conversationId,
          customerPhone: ctx.customerPhone,
          customerName: ctx.customerName,
          reason: "richiesta operatore rilevata dalla risposta",
        });
        if (res.ok) {
          escalated = true;
          console.log(`${logPrefix} escalation ENFORCED by safety net (model claimed handoff without the tool).`);
        }
      } catch (err) {
        console.error(`${logPrefix} escalation safety net failed:`, err);
      }
    }
    // Safety net: the model promised the service list but the customer can't see
    // tool output. If the reply names no actual service, append the real list.
    if (SERVICES_PROMISE_RE.test(reply)) {
      try {
        const services = await listActiveServices();
        const namesAlreadyShown = services.some((s) => reply.toLowerCase().includes(s.name.toLowerCase()));
        if (services.length && !namesAlreadyShown) {
          console.log(`${logPrefix} appended the service list (model promised it without listing it).`);
          return `${reply}\n\n${formatServiceList(services)}`;
        }
      } catch (err) {
        console.error(`${logPrefix} service-list safety net failed:`, err);
      }
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
      return await finalize(choice.content);
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
  return await finalize(finalMsg.choices[0]?.message?.content);
}
