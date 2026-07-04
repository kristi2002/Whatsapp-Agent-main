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
  getAppointmentsForPhone,
  cancelAppointment,
} from "@/lib/booking";

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
];

/** Execute a tool call and return a string result for the model. */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolContext
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
        // Give the model the machine-readable options plus a human message.
        return JSON.stringify({
          message: res.message,
          service: res.serviceName,
          options: res.options ?? [],
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
        return res.message;
      }
      case "get_my_appointments": {
        return await getAppointmentsForPhone(ctx.customerPhone, ctx.now);
      }
      case "cancel_appointment": {
        const res = await cancelAppointment({
          appointmentId: (args.appointmentId as string) ?? undefined,
          customerPhone: ctx.customerPhone,
          now: ctx.now,
        });
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
