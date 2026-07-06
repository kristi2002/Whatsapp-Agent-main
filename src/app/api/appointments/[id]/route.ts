import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { SALON } from "@/lib/salon-config";
import { zonedWallTimeToUtc } from "@/lib/timezone";

const STATUSES = ["booked", "completed", "cancelled", "no_show"];
const SELECT = "*, service:services(name,duration_min,price_cents), stylist:stylists(name)";

/** PATCH /api/appointments/[id] — change status/notes or reschedule. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) return Response.json({ error: "Stato non valido." }, { status: 400 });
    update.status = b.status;
  }
  if (b.notes !== undefined) update.notes = b.notes?.trim() || null;
  if (b.stylist_id) update.stylist_id = b.stylist_id;
  if (b.service_id) update.service_id = b.service_id;
  if (b.customer_name !== undefined) update.customer_name = b.customer_name?.trim() || null;

  // Reschedule: recompute starts_at/ends_at from date+time using the service duration.
  if (b.date && b.time) {
    const serviceId = b.service_id || (await supabase.from("appointments").select("service_id").eq("id", id).single()).data?.service_id;
    const { data: svc } = await supabase.from("services").select("duration_min").eq("id", serviceId).single();
    if (!svc) return Response.json({ error: "Servizio non trovato per il ricalcolo dell'orario." }, { status: 400 });
    const [y, m, d] = String(b.date).split("-").map(Number);
    const [hh, mm] = String(b.time).split(":").map(Number);
    const start = zonedWallTimeToUtc(y, m, d, hh, mm, SALON.timezone);
    if (isNaN(start.getTime())) return Response.json({ error: "Data/ora non valida." }, { status: 400 });
    update.starts_at = start.toISOString();
    update.ends_at = new Date(start.getTime() + svc.duration_min * 60000).toISOString();
  }

  const { data, error } = await supabase.from("appointments").update(update).eq("id", id).select(SELECT).single();
  if (error) {
    if (error.code === "23P01") return Response.json({ error: "Sovrapposizione con un altro appuntamento di questo parrucchiere." }, { status: 409 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

/** DELETE /api/appointments/[id] — cancel (soft: status = cancelled). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase
    .from("appointments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
