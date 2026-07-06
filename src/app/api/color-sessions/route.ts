import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const MASTER = ["client_id", "appointment_id", "stylist_id", "date", "service_type", "base_level", "white_pct", "hair_state", "technique", "processing_min", "result", "notes", "before_photo_url", "after_photo_url"];
const SELECT = "*, items:color_session_items(*), client:clients(id,name,phone), stylist:stylists(name)";

interface ItemIn { role?: string; brand?: string; line?: string; tone?: string; quantity?: number | string; volumes?: number | string; product_id?: string }

async function insertItems(sessionId: string, items: ItemIn[]) {
  const rows = (items ?? []).map((it, i) => ({
    session_id: sessionId, role: it.role || "colore", brand: it.brand?.trim() || null, line: it.line?.trim() || null,
    tone: it.tone?.trim() || null, quantity: it.quantity === "" || it.quantity == null ? null : Number(it.quantity),
    volumes: it.volumes === "" || it.volumes == null ? null : Number(it.volumes), product_id: it.product_id || null, sort: i,
  }));
  if (rows.length) await supabase.from("color_session_items").insert(rows);
}

/** GET — ricettario: cross-search over all sessions. Filters: tone, brand, technique, base, withPhotos, q. */
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  let query = supabase.from("color_sessions").select(SELECT).order("date", { ascending: false }).limit(150);
  if (sp.get("base")) query = query.eq("base_level", Number(sp.get("base")));
  if (sp.get("technique")) query = query.ilike("technique", `%${sp.get("technique")}%`);
  if (sp.get("service_type")) query = query.eq("service_type", sp.get("service_type"));
  if (sp.get("withPhotos") === "1") query = query.not("after_photo_url", "is", null);
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const tone = (sp.get("tone") || "").toLowerCase(), brand = (sp.get("brand") || "").toLowerCase(), q = (sp.get("q") || "").toLowerCase();
  let rows = data ?? [];
  if (tone) rows = rows.filter((s) => (s.items ?? []).some((it: { tone?: string }) => it.tone?.toLowerCase().includes(tone)));
  if (brand) rows = rows.filter((s) => (s.items ?? []).some((it: { brand?: string }) => it.brand?.toLowerCase().includes(brand)));
  if (q) rows = rows.filter((s) => `${s.client?.name ?? ""} ${s.result ?? ""} ${s.notes ?? ""}`.toLowerCase().includes(q));
  return Response.json(rows);
}

/** POST — create a session + its component rows. */
export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.client_id) return Response.json({ error: "Cliente mancante." }, { status: 400 });
  const row: Record<string, unknown> = {};
  for (const f of MASTER) if (b[f] !== undefined) row[f] = b[f] === "" ? null : b[f];
  for (const n of ["base_level", "white_pct", "processing_min"]) if (row[n] != null) row[n] = Number(row[n]) || null;
  const { data: session, error } = await supabase.from("color_sessions").insert(row).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await insertItems(session.id, b.items ?? []);
  const { data: full } = await supabase.from("color_sessions").select(SELECT).eq("id", session.id).single();
  return Response.json(full);
}
