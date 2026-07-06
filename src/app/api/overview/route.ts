import { supabase } from "@/lib/supabase";
import { SALON } from "@/lib/salon-config";
import { zonedWallTimeToUtc, getZonedParts } from "@/lib/timezone";

const SELECT = "*, service:services(name,duration_min,price_cents), stylist:stylists(name)";

/** GET /api/overview — KPIs + today's appointments for the dashboard home. */
export async function GET() {
  const now = new Date();
  const p = getZonedParts(now, SALON.timezone);
  const dayStart = zonedWallTimeToUtc(p.year, p.month, p.day, 0, 0, SALON.timezone);
  const nextDay = zonedWallTimeToUtc(p.year, p.month, p.day + 1, 0, 0, SALON.timezone);
  const in7 = zonedWallTimeToUtc(p.year, p.month, p.day + 7, 0, 0, SALON.timezone);

  const [today, upcoming, services, stylists, convos] = await Promise.all([
    supabase.from("appointments").select(SELECT).in("status", ["booked", "completed"]).gte("starts_at", dayStart.toISOString()).lt("starts_at", nextDay.toISOString()).order("starts_at"),
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("status", "booked").gte("starts_at", now.toISOString()).lt("starts_at", in7.toISOString()),
    supabase.from("services").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("stylists").select("id", { count: "exact", head: true }).eq("active", true),
    supabase.from("conversations").select("id", { count: "exact", head: true }),
  ]);

  return Response.json({
    todayCount: today.data?.length ?? 0,
    upcomingCount: upcoming.count ?? 0,
    activeServices: services.count ?? 0,
    activeStylists: stylists.count ?? 0,
    conversations: convos.count ?? 0,
    today: today.data ?? [],
  });
}
