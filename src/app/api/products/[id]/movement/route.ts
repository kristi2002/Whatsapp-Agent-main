import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET — movement history for a product. */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("stock_movements").select("*").eq("product_id", id).order("created_at", { ascending: false }).limit(50);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** POST { delta, reason } — record a carico/scarico and update stock. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0) return Response.json({ error: "Quantità non valida." }, { status: 400 });
  const { data: p } = await supabase.from("products").select("stock_qty").eq("id", id).single();
  if (!p) return Response.json({ error: "Prodotto non trovato." }, { status: 404 });
  await supabase.from("stock_movements").insert({ product_id: id, delta, reason: b.reason?.trim() || (delta > 0 ? "carico" : "scarico") });
  const { data: updated, error } = await supabase.from("products").update({ stock_qty: Math.max(0, p.stock_qty + delta), updated_at: new Date().toISOString() }).eq("id", id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(updated);
}
