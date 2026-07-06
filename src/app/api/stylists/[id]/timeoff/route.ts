import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("stylist_time_off").select("*").eq("stylist_id", id).gte("ends_at", new Date().toISOString()).order("starts_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  if (!b.starts_at || !b.ends_at) return Response.json({ error: "Date mancanti." }, { status: 400 });
  if (new Date(b.ends_at) <= new Date(b.starts_at)) return Response.json({ error: "La fine deve essere dopo l'inizio." }, { status: 400 });
  const { data, error } = await supabase.from("stylist_time_off").insert({ stylist_id: id, starts_at: b.starts_at, ends_at: b.ends_at, reason: b.reason?.trim() || null }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
