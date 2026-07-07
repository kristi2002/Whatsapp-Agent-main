import { NextRequest } from "next/server";
import { bookAppointment, recentOnlineBookingCount } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

/** Public — create a self-service booking (source = online). */
export async function POST(request: NextRequest) {
  const b = await request.json();
  const { service, startIso, stylist, customerName, customerPhone } = b;
  if (!service || !startIso || !customerName?.trim() || !customerPhone?.trim()) {
    return Response.json({ ok: false, message: "Compila nome, telefono, servizio e orario." }, { status: 400 });
  }

  // Abuse guard: cap self-service bookings per phone per day.
  const ONLINE_DAILY_LIMIT = 6;
  if ((await recentOnlineBookingCount(customerPhone.trim())) >= ONLINE_DAILY_LIMIT) {
    return Response.json({ ok: false, message: "Hai raggiunto il numero massimo di prenotazioni online per oggi. Contatta il salone per assistenza." }, { status: 429 });
  }
  const res = await bookAppointment({ service, startIso, stylist: stylist || null, customerName: customerName.trim(), customerPhone: customerPhone.trim() });
  if (res.ok && res.appointmentId) {
    await supabase.from("appointments").update({ source: "online" }).eq("id", res.appointmentId);
  }
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
