import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET — products consumed by this service (for auto-scarico). */
export async function GET(_r: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data, error } = await supabase.from("service_products").select("product_id, qty").eq("service_id", id);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** PUT { items: [{product_id, qty}] } — replace the consumable list. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  await supabase.from("service_products").delete().eq("service_id", id);
  const rows = (b.items ?? []).filter((i: { product_id?: string }) => i.product_id).map((i: { product_id: string; qty?: number }) => ({ service_id: id, product_id: i.product_id, qty: Math.max(1, Number(i.qty) || 1) }));
  if (rows.length) { const { error } = await supabase.from("service_products").insert(rows); if (error) return Response.json({ error: error.message }, { status: 500 }); }
  return Response.json({ ok: true });
}
