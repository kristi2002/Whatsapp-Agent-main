/**
 * AI tool (function-calling) definitions and the dispatcher that executes them
 * against the booking layer. The model decides WHEN to call these; this code
 * does the real database work and validation.
 */

import type OpenAI from "openai";
import {
  listActiveServices,
  formatServiceList,
  checkAvailability,
  bookAppointment,
  rescheduleAppointment,
  getAppointmentsForPhone,
  cancelAppointment,
} from "@/lib/booking";
import { escalateAndNotify } from "@/lib/escalation";

export interface ToolContext {
  customerPhone: string;
  customerName: string | null;
  conversationId: string | null;
  now: Date;
}

export const TOOL_DEFINITIONS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "list_services",
      description:
        "Elenca i servizi del salone con durata e prezzo. Usalo quando il cliente chiede quali servizi ci sono, i prezzi, o quando non è chiaro quale servizio vuole.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "check_availability",
      description:
        "Restituisce gli orari liberi reali per un servizio in una data specifica. Usalo SEMPRE prima di proporre orari. Restituisce opzioni con uno startIso esatto da usare per prenotare.",
      parameters: {
        type: "object",
        properties: {
          service: {
            type: "string",
            description: "Nome del servizio (es. 'Taglio donna', 'Colore').",
          },
          date: {
            type: "string",
            description: "Data richiesta in formato YYYY-MM-DD (fuso Europe/Rome).",
          },
          stylist: {
            type: "string",
            description: "Opzionale: nome del parrucchiere preferito.",
          },
        },
        required: ["service", "date"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "book_appointment",
      description:
        "Crea la prenotazione. Usa lo startIso ESATTO restituito da check_availability. Non inventare orari.",
      parameters: {
        type: "object",
        properties: {
          service: { type: "string", description: "Nome del servizio da prenotare." },
          startIso: {
            type: "string",
            description: "L'istante ISO esatto restituito da check_availability (campo iso).",
          },
          stylist: {
            type: "string",
            description: "Opzionale: parrucchiere scelto dal cliente.",
          },
          customerName: {
            type: "string",
            description: "Nome del cliente per la conferma, se fornito.",
          },
        },
        required: ["service", "startIso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "reschedule_appointment",
      description:
        "Sposta un appuntamento ESISTENTE del cliente a un nuovo orario (e, se richiesto, nuovo parrucchiere o servizio). Usa SEMPRE questo strumento per modifiche/spostamenti: NON usare book_appointment, che creerebbe un doppione. Usa lo startIso ESATTO restituito da check_availability. Se il cliente ha più appuntamenti, usa prima get_my_appointments e passa appointmentId.",
      parameters: {
        type: "object",
        properties: {
          startIso: { type: "string", description: "L'istante ISO esatto del nuovo orario (campo iso di check_availability)." },
          appointmentId: { type: "string", description: "Opzionale: id dell'appuntamento da spostare (da get_my_appointments)." },
          stylist: { type: "string", description: "Opzionale: nuovo parrucchiere, SOLO se il cliente lo chiede." },
          service: { type: "string", description: "Opzionale: nuovo servizio, se il cliente vuole cambiarlo." },
        },
        required: ["startIso"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_my_appointments",
      description: "Elenca gli appuntamenti futuri del cliente che sta scrivendo.",
      parameters: { type: "object", properties: {}, required: [] },
    },
  },
  {
    type: "function",
    function: {
      name: "cancel_appointment",
      description:
        "Annulla un appuntamento del cliente. Se il cliente ne ha più di uno, chiedi quale prima di chiamare questo strumento.",
      parameters: {
        type: "object",
        properties: {
          appointmentId: {
            type: "string",
            description: "Opzionale: id dell'appuntamento (dal risultato di get_my_appointments).",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description:
        "Passa la conversazione a un operatore umano del salone. Usalo quando il cliente CHIEDE ESPLICITAMENTE di parlare con una persona, quando è insoddisfatto/arrabbiato, o quando la richiesta è troppo complessa per te (reclami, casi particolari, domande a cui non sai rispondere con gli strumenti). Dopo averlo usato, avvisa il cliente che un operatore gli risponderà. NON usarlo per normali prenotazioni/modifiche/annullamenti, che gestisci tu.",
      parameters: {
        type: "object",
        properties: {
          reason: {
            type: "string",
            description: "Breve motivo dell'inoltro (es. 'cliente insoddisfatto', 'reclamo', 'richiesta complessa').",
          },
        },
        required: [],
      },
    },
  },
];

/**
 * Optional callback so the caller (the AI loop) can observe the real outcome of
 * a booking-mutating tool — used to guard against the model claiming a booking
 * that did not actually happen. `ok` reflects whether the DB write succeeded.
 */
export type ToolOutcome = { name: string; ok: boolean; message: string };

/** Execute a tool call and return a string result for the model. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext,
  track?: (outcome: ToolOutcome) => void
): Promise<string> {
  try {
    switch (name) {
      case "list_services": {
        const services = await listActiveServices();
        return formatServiceList(services);
      }
      case "check_availability": {
        const res = await checkAvailability({
          service: String(args.service ?? ""),
          date: String(args.date ?? ""),
          stylist: (args.stylist as string) ?? null,
          now: ctx.now,
        });
        // options = a few curated times to SUGGEST. allFreeTimes = EVERY free
        // time, so the model can answer a specific request (e.g. "le 16:00?")
        // correctly instead of assuming a time is taken just because it was not
        // among the suggested few.
        return JSON.stringify({
          message: res.message,
          service: res.serviceName,
          options: res.options ?? [],
          // Include the free stylists per slot so the model can offer a choice
          // when more than one is available at the time the customer picks.
          allFreeTimes: (res.allSlots ?? []).map((sl) => ({ time: sl.time, iso: sl.iso, stylists: sl.stylists })),
        });
      }
      case "book_appointment": {
        const res = await bookAppointment({
          service: String(args.service ?? ""),
          startIso: String(args.startIso ?? ""),
          stylist: (args.stylist as string) ?? null,
          customerName: (args.customerName as string) ?? ctx.customerName,
          customerPhone: ctx.customerPhone,
          conversationId: ctx.conversationId,
          now: ctx.now,
        });
        track?.({ name, ok: res.ok, message: res.message });
        return res.message;
      }
      case "get_my_appointments": {
        return await getAppointmentsForPhone(ctx.customerPhone, ctx.now);
      }
      case "reschedule_appointment": {
        const res = await rescheduleAppointment({
          appointmentId: (args.appointmentId as string) ?? undefined,
          startIso: String(args.startIso ?? ""),
          stylist: (args.stylist as string) ?? null,
          service: (args.service as string) ?? null,
          customerPhone: ctx.customerPhone,
          now: ctx.now,
        });
        track?.({ name, ok: res.ok, message: res.message });
        return res.message;
      }
      case "cancel_appointment": {
        const res = await cancelAppointment({
          appointmentId: (args.appointmentId as string) ?? undefined,
          customerPhone: ctx.customerPhone,
          now: ctx.now,
        });
        track?.({ name, ok: res.ok, message: res.message });
        return res.message;
      }
      case "escalate_to_human": {
        const res = await escalateAndNotify({
          conversationId: ctx.conversationId,
          customerPhone: ctx.customerPhone,
          customerName: ctx.customerName,
          reason: (args.reason as string) ?? null,
        });
        track?.({ name, ok: res.ok, message: res.message });
        return res.message;
      }
      default:
        return `Strumento sconosciuto: ${name}`;
    }
  } catch (err) {
    console.error(`Tool ${name} failed:`, err);
    return "Si è verificato un errore tecnico con questa operazione. Riprova o chiama il salone.";
  }
}
