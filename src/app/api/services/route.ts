import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET /api/services — all services (active + inactive), for management. */
export async function GET() {
  const { data, error } = await supabase.from("services").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST /api/services — create a service. */
export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.name?.trim()) return Response.json({ error: "Il nome è obbligatorio." }, { status: 400 });
  const duration = Number(b.duration_min);
  if (!Number.isFinite(duration) || duration <= 0) {
    return Response.json({ error: "La durata deve essere un numero di minuti positivo." }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("services")
    .insert({
      name: b.name.trim(),
      duration_min: duration,
      price_cents: b.price_cents === null || b.price_cents === undefined || b.price_cents === "" ? null : Number(b.price_cents),
      category: b.category?.trim() || null,
      active: b.active ?? true,
    })
    .select()
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
