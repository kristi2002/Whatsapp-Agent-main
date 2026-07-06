import { NextRequest } from "next/server";
import { bookAppointment } from "@/lib/booking";
import { supabase } from "@/lib/supabase";

/** Public — create a self-service booking (source = online). */
export async function POST(request: NextRequest) {
  const b = await request.json();
  const { service, startIso, stylist, customerName, customerPhone } = b;
  if (!service || !startIso || !customerName?.trim() || !customerPhone?.trim()) {
    return Response.json({ ok: false, message: "Compila nome, telefono, servizio e orario." }, { status: 400 });
  }
  const res = await bookAppointment({ service, startIso, stylist: stylist || null, customerName: customerName.trim(), customerPhone: customerPhone.trim() });
  if (res.ok && res.appointmentId) {
    await supabase.from("appointments").update({ source: "online" }).eq("id", res.appointmentId);
  }
  return Response.json(res, { status: res.ok ? 200 : 409 });
}
