import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

const MASTER = ["appointment_id", "stylist_id", "date", "service_type", "base_level", "white_pct", "hair_state", "technique", "processing_min", "result", "notes", "before_photo_url", "after_photo_url"];
const SELECT = "*, items:color_session_items(*), stylist:stylists(name)";

interface ItemIn { role?: string; brand?: string; line?: string; tone?: string; quantity?: number | string; volumes?: number | string; product_id?: string }

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("color_sessions").select(SELECT).eq("id", id).single();
  if (error) return Response.json({ error: error.message }, { status: 404 });
  return Response.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const u: Record<string, unknown> = {};
  for (const f of MASTER) if (b[f] !== undefined) u[f] = b[f] === "" ? null : b[f];
  for (const n of ["base_level", "white_pct", "processing_min"]) if (u[n] != null) u[n] = Number(u[n]) || null;
  if (Object.keys(u).length) { const { error } = await supabase.from("color_sessions").update(u).eq("id", id); if (error) return Response.json({ error: error.message }, { status: 500 }); }
  if (Array.isArray(b.items)) {
    await supabase.from("color_session_items").delete().eq("session_id", id);
    const rows = (b.items as ItemIn[]).map((it, i) => ({ session_id: id, role: it.role || "colore", brand: it.brand?.trim() || null, line: it.line?.trim() || null, tone: it.tone?.trim() || null, quantity: it.quantity === "" || it.quantity == null ? null : Number(it.quantity), volumes: it.volumes === "" || it.volumes == null ? null : Number(it.volumes), product_id: it.product_id || null, sort: i }));
    if (rows.length) await supabase.from("color_session_items").insert(rows);
  }
  const { data } = await supabase.from("color_sessions").select(SELECT).eq("id", id).single();
  return Response.json(data);
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from("color_sessions").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
