import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const num = (v: unknown) => (v === "" || v === null ? null : Number(v));
  const u: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (b.name !== undefined) { if (!b.name.trim()) return Response.json({ error: "Nome vuoto." }, { status: 400 }); u.name = b.name.trim(); }
  if (b.brand !== undefined) u.brand = b.brand?.trim() || null;
  if (b.category !== undefined) u.category = b.category?.trim() || null;
  if (b.sku !== undefined) u.sku = b.sku?.trim() || null;
  if (b.price_cents !== undefined) u.price_cents = num(b.price_cents);
  if (b.cost_cents !== undefined) u.cost_cents = num(b.cost_cents);
  if (b.stock_qty !== undefined) u.stock_qty = Number(b.stock_qty) || 0;
  if (b.low_stock_threshold !== undefined) u.low_stock_threshold = Number(b.low_stock_threshold) || 0;
  if (b.active !== undefined) u.active = !!b.active;
  const { data, error } = await supabase.from("products").update(u).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function DELETE(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabase.from("products").update({ active: false }).eq("id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
