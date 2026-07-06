import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";
import { SALON } from "@/lib/salon-config";
import { zonedWallTimeToUtc, getZonedParts } from "@/lib/timezone";

/** GET /api/stats?from=YYYY-MM-DD&to=YYYY-MM-DD (local Rome dates, inclusive). */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const toStr = sp.get("to") || new Intl.DateTimeFormat("en-CA", { timeZone: SALON.timezone }).format(new Date());
  const fromStr = sp.get("from") || (() => { const d = new Date(); d.setDate(d.getDate() - 29); return new Intl.DateTimeFormat("en-CA", { timeZone: SALON.timezone }).format(d); })();
  const [fy, fm, fd] = fromStr.split("-").map(Number);
  const [ty, tm, td] = toStr.split("-").map(Number);
  const start = zonedWallTimeToUtc(fy, fm, fd, 0, 0, SALON.timezone);
  const end = zonedWallTimeToUtc(ty, tm, td + 1, 0, 0, SALON.timezone);

  const [apptsR, salesR, stylistsR, servicesR, clientsR] = await Promise.all([
    supabase.from("appointments").select("stylist_id, service_id, status, customer_phone, starts_at").gte("starts_at", start.toISOString()).lt("starts_at", end.toISOString()),
    supabase.from("sales").select("total_cents, created_at").gte("created_at", start.toISOString()).lt("created_at", end.toISOString()),
    supabase.from("stylists").select("id, name"),
    supabase.from("services").select("id, name"),
    supabase.from("clients").select("phone, created_at"),
  ]);
  const appts = apptsR.data ?? [], sales = salesR.data ?? [];
  const styName = new Map((stylistsR.data ?? []).map((s) => [s.id, s.name]));
  const svcName = new Map((servicesR.data ?? []).map((s) => [s.id, s.name]));
  const clientCreated = new Map((clientsR.data ?? []).map((c) => [c.phone, c.created_at]));

  const revenue = sales.reduce((t, s) => t + (s.total_cents || 0), 0);
  const count = (st: string) => appts.filter((a) => a.status === st).length;
  const completed = count("completed"), noShow = count("no_show"), cancelled = count("cancelled"), booked = count("booked");
  const worked = completed + booked;

  const byOp = new Map<string, number>(), bySvc = new Map<string, number>();
  for (const a of appts) { if (a.status === "cancelled") continue; byOp.set(a.stylist_id, (byOp.get(a.stylist_id) ?? 0) + 1); bySvc.set(a.service_id, (bySvc.get(a.service_id) ?? 0) + 1); }

  // new vs returning among distinct clients seen in the period
  const phones = new Set(appts.map((a) => a.customer_phone));
  let newClients = 0, returning = 0;
  for (const p of phones) { const c = clientCreated.get(p); if (c && new Date(c).getTime() >= start.getTime()) newClients++; else returning++; }

  // daily series
  const days: { date: string; label: string; revenue_cents: number; appts: number }[] = [];
  const dayCount = Math.min(92, Math.round((end.getTime() - start.getTime()) / 86400000));
  for (let i = 0; i < dayCount; i++) {
    const ds = zonedWallTimeToUtc(fy, fm, fd + i, 0, 0, SALON.timezone), de = zonedWallTimeToUtc(fy, fm, fd + i + 1, 0, 0, SALON.timezone);
    const rev = sales.filter((s) => { const t = new Date(s.created_at).getTime(); return t >= ds.getTime() && t < de.getTime(); }).reduce((t, s) => t + (s.total_cents || 0), 0);
    const ap = appts.filter((a) => { const t = new Date(a.starts_at).getTime(); return t >= ds.getTime() && t < de.getTime() && a.status !== "cancelled"; }).length;
    const p = getZonedParts(ds, SALON.timezone);
    days.push({ date: ds.toISOString(), label: `${p.day}/${p.month}`, revenue_cents: rev, appts: ap });
  }

  return Response.json({
    from: fromStr, to: toStr,
    revenue_cents: revenue, salesCount: sales.length, avgTicket_cents: sales.length ? Math.round(revenue / sales.length) : 0,
    apptTotal: appts.length, completed, noShow, cancelled, booked,
    noShowRate: worked + noShow ? Math.round((noShow / (worked + noShow)) * 100) : 0,
    newClients, returning,
    byOperator: [...byOp.entries()].map(([id, c]) => ({ name: styName.get(id) ?? "—", count: c })).sort((a, b) => b.count - a.count),
    byService: [...bySvc.entries()].map(([id, c]) => ({ name: svcName.get(id) ?? "—", count: c })).sort((a, b) => b.count - a.count).slice(0, 8),
    daily: days,
  });
}
