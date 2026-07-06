import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** PATCH /api/stylists/[id] — edit name/active and/or replace service capabilities. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const update: Record<string, unknown> = {};
  if (b.name !== undefined) {
    if (!b.name.trim()) return Response.json({ error: "Il nome non può essere vuoto." }, { status: 400 });
    update.name = b.name.trim();
  }
  if (b.active !== undefined) update.active = !!b.active;

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from("stylists").update(update).eq("id", id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  // Replace capability set if provided.
  if (Array.isArray(b.service_ids)) {
    await supabase.from("stylist_services").delete().eq("stylist_id", id);
    if (b.service_ids.length > 0) {
      await supabase.from("stylist_services").insert(b.service_ids.map((sid: string) => ({ stylist_id: id, service_id: sid })));
    }
  }

  const { data } = await supabase.from("stylists").select("*").eq("id", id).single();
  return Response.json(data);
}

/** DELETE /api/stylists/[id] — soft delete (active = false). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from("stylists").update({ active: false }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
