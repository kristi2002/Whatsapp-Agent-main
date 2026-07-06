import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("stylist_hours").select("*").eq("stylist_id", id).order("day_of_week");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  await supabase.from("stylist_hours").delete().eq("stylist_id", id);
  if (b.reset) return Response.json({ ok: true });
  const rows = (b.rows ?? []).map((r: Record<string, unknown>) => ({
    stylist_id: id, day_of_week: Number(r.day_of_week), is_working: !!r.is_working,
    open_time: r.is_working ? (r.open_time || null) : null, close_time: r.is_working ? (r.close_time || null) : null,
    break_start: r.is_working ? (r.break_start || null) : null, break_end: r.is_working ? (r.break_end || null) : null,
  }));
  if (rows.length) { const { error } = await supabase.from("stylist_hours").insert(rows); if (error) return Response.json({ error: error.message }, { status: 500 }); }
  return Response.json({ ok: true });
}
