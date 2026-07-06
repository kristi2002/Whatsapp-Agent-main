import { NextRequest } from "next/server";
import { checkAvailability } from "@/lib/booking";

/** Public — free slots for a service on a date (optionally a specific stylist). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const service = sp.get("service"), date = sp.get("date");
  if (!service || !date) return Response.json({ error: "Parametri mancanti." }, { status: 400 });
  const res = await checkAvailability({ service, date, stylist: sp.get("stylist") || null });
  return Response.json({ ok: res.ok, serviceName: res.serviceName, options: res.options ?? [], message: res.message });
}
