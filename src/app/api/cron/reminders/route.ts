import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { SALON } from "@/lib/salon-config";
import { formatZoned } from "@/lib/timezone";

export const runtime = "nodejs";

/**
 * GET /api/cron/reminders?key=CRON_SECRET
 * Sends a WhatsApp reminder for booked appointments starting within the window
 * (default 20–28h ahead) that haven't been reminded yet. Trigger from a cron.
 *
 * NOTE: outside Meta's 24h customer-service window this must use an APPROVED
 * message template. Plain text works only inside the 24h window. Swap the body
 * of sendWhatsAppMessage for a template call once your template is approved.
 */
export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fromH = Number(request.nextUrl.searchParams.get("fromH") ?? 20);
  const toH = Number(request.nextUrl.searchParams.get("toH") ?? 28);
  const now = Date.now();
  const from = new Date(now + fromH * 3600_000).toISOString();
  const to = new Date(now + toH * 3600_000).toISOString();

  const { data: appts } = await supabase
    .from("appointments")
    .select("id, customer_phone, customer_name, starts_at, service:services(name)")
    .eq("status", "booked")
    .is("reminder_sent_at", null)
    .gte("starts_at", from)
    .lt("starts_at", to);

  let sent = 0;
  for (const a of appts ?? []) {
    const when = formatZoned(new Date(a.starts_at), SALON.timezone, SALON.locale);
    const svc = (a.service as unknown as { name?: string } | null)?.name ?? "il tuo appuntamento";
    const name = a.customer_name ? ` ${a.customer_name}` : "";
    const text = `Ciao${name}! Ti ricordiamo l'appuntamento da ${SALON.name} per ${svc}: ${when}. Per modifiche rispondi a questo messaggio. A presto!`;
    try { await sendWhatsAppMessage(a.customer_phone, text); await supabase.from("appointments").update({ reminder_sent_at: new Date().toISOString() }).eq("id", a.id); sent++; } catch (e) { console.error("reminder failed", a.id, e); }
  }
  return Response.json({ ok: true, sent, considered: appts?.length ?? 0 });
}
