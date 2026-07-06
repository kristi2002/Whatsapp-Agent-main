import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** PATCH /api/services/[id] — edit a service or toggle active. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const update: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (!b.name.trim()) return Response.json({ error: "Il nome non può essere vuoto." }, { status: 400 });
    update.name = b.name.trim();
  }
  if (b.duration_min !== undefined) {
    const d = Number(b.duration_min);
    if (!Number.isFinite(d) || d <= 0) return Response.json({ error: "Durata non valida." }, { status: 400 });
    update.duration_min = d;
  }
  if (b.price_cents !== undefined) update.price_cents = b.price_cents === null || b.price_cents === "" ? null : Number(b.price_cents);
  if (b.category !== undefined) update.category = b.category?.trim() || null;
  if (b.active !== undefined) update.active = !!b.active;

  const { data, error } = await supabase.from("services").update(update).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** DELETE /api/services/[id] — soft delete (active = false) to preserve history. */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from("services").update({ active: false }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
