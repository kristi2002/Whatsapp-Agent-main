import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("waitlist").select("*, service:services(name)").neq("status", "chiuso").order("created_at");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.phone?.trim()) return Response.json({ error: "Il telefono è obbligatorio." }, { status: 400 });
  const { data, error } = await supabase.from("waitlist").insert({ name: b.name?.trim() || null, phone: b.phone.trim(), service_id: b.service_id || null, preferred_date: b.preferred_date || null, notes: b.notes?.trim() || null }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
