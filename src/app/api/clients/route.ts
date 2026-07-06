import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("clients").select("*").order("name", { nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.phone?.trim()) return Response.json({ error: "Il telefono è obbligatorio." }, { status: 400 });
  const { data, error } = await supabase.from("clients").insert({
    phone: b.phone.trim(), name: b.name?.trim() || null, email: b.email?.trim() || null, notes: b.notes?.trim() || null,
  }).select().single();
  if (error) {
    if (error.code === "23505") return Response.json({ error: "Esiste già un cliente con questo telefono." }, { status: 409 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}
