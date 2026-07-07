import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET /api/clients/[id] — client + appointment history + sales (with items). */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: client, error } = await supabase.from("clients").select("*").eq("id", id).single();
  if (error || !client) return Response.json({ error: "Non trovato." }, { status: 404 });
  const [appts, sales, colorCards, loyaltyTx] = await Promise.all([
    supabase.from("appointments").select("*, service:services(name,price_cents), stylist:stylists(name)").eq("customer_phone", client.phone).order("starts_at", { ascending: false }),
    supabase.from("sales").select("*, items:sale_items(*)").eq("client_id", id).order("created_at", { ascending: false }),
    supabase.from("color_sessions").select("*, items:color_session_items(*), stylist:stylists(name)").eq("client_id", id).order("date", { ascending: false }),
    supabase.from("loyalty_transactions").select("*").eq("client_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  const totalSpent = (sales.data ?? []).reduce((t, s) => t + (s.total_cents || 0), 0);
  return Response.json({ client, appointments: appts.data ?? [], sales: sales.data ?? [], colorSessions: colorCards.data ?? [], loyalty: loyaltyTx.data ?? [], totalSpent });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) u.name = b.name?.trim() || null;
  if (b.email !== undefined) u.email = b.email?.trim() || null;
  if (b.notes !== undefined) u.notes = b.notes ?? null;
  if (b.allergies !== undefined) u.allergies = b.allergies?.trim() || null;
  if (b.patch_test_date !== undefined) u.patch_test_date = b.patch_test_date || null;
  if (b.birthdate !== undefined) u.birthdate = b.birthdate || null;
  if (b.priority !== undefined) u.priority = !!b.priority;
  if (b.patch_test_result !== undefined) u.patch_test_result = b.patch_test_result?.trim() || null;
  if (b.phone !== undefined) { if (!b.phone.trim()) return Response.json({ error: "Telefono vuoto." }, { status: 400 }); u.phone = b.phone.trim(); }
  const { data, error } = await supabase.from("clients").update(u).eq("id", id).select().single();
  if (error) {
    if (error.code === "23505") return Response.json({ error: "Telefono già usato da un altro cliente." }, { status: 409 });
    return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json(data);
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from("clients").delete().eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
