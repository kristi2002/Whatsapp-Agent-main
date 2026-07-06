import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { SALON } from "@/lib/salon-config";
import { zonedWallTimeToUtc } from "@/lib/timezone";

const SELECT =
  "*, service:services(name,duration_min,price_cents,category), stylist:stylists(name)";

/** GET /api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD (local Rome dates, inclusive). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const from = sp.get("from");
  const to = sp.get("to");

  let query = supabase.from("appointments").select(SELECT).order("starts_at");

  if (from) {
    const [y, m, d] = from.split("-").map(Number);
    query = query.gte("starts_at", zonedWallTimeToUtc(y, m, d, 0, 0, SALON.timezone).toISOString());
  }
  if (to) {
    const [y, m, d] = to.split("-").map(Number);
    // Inclusive of the "to" day: everything before the start of the next day.
    query = query.lt("starts_at", zonedWallTimeToUtc(y, m, d + 1, 0, 0, SALON.timezone).toISOString());
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/appointments — create a booking from the gestionale. */
export async function POST(request: NextRequest) {
  const b = await request.json();
  const { service_id, stylist_id, date, time, customer_name, customer_phone, notes } = b;

  if (!service_id || !stylist_id || !date || !time || !customer_phone?.trim()) {
    return Response.json({ error: "Servizio, parrucchiere, data, ora e telefono sono obbligatori." }, { status: 400 });
  }

  const { data: svc, error: svcErr } = await supabase
    .from("services")
    .select("duration_min")
    .eq("id", service_id)
    .single();
  if (svcErr || !svc) return Response.json({ error: "Servizio non trovato." }, { status: 400 });

  const [y, m, d] = String(date).split("-").map(Number);
  const [hh, mm] = String(time).split(":").map(Number);
  const start = zonedWallTimeToUtc(y, m, d, hh, mm, SALON.timezone);
  if (isNaN(start.getTime())) return Response.json({ error: "Data/ora non valida." }, { status: 400 });
  const end = new Date(start.getTime() + svc.duration_min * 60000);

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      service_id,
      stylist_id,
      customer_name: customer_name?.trim() || null,
      customer_phone: String(customer_phone).trim(),
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "booked",
      source: "gestionale",
      notes: notes?.trim() || null,
    })
    .select(SELECT)
    .single();

  if (error) {
    if (error.code === "23P01") {
      return Response.json({ error: "Questo parrucchiere ha già un appuntamento in questo orario." }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
