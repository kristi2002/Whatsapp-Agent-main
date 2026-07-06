import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** POST /api/sales — record a lightweight sale (services + products) for a client. */
export async function POST(request: NextRequest) {
  const b = await request.json();
  const items: Array<{ kind: "service" | "product"; service_id?: string; product_id?: string; description: string; qty: number; unit_price_cents: number }> = b.items ?? [];
  if (!Array.isArray(items) || items.length === 0) return Response.json({ error: "Aggiungi almeno una voce." }, { status: 400 });
  const total = items.reduce((s, it) => s + (Number(it.unit_price_cents) || 0) * (Number(it.qty) || 1), 0);

  const { data: sale, error } = await supabase.from("sales").insert({
    client_id: b.client_id ?? null, customer_phone: b.customer_phone ?? null, appointment_id: b.appointment_id ?? null, total_cents: total,
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const rows = items.map((it) => ({ sale_id: sale.id, kind: it.kind, service_id: it.service_id ?? null, product_id: it.product_id ?? null, description: it.description, qty: Number(it.qty) || 1, unit_price_cents: Number(it.unit_price_cents) || 0 }));
  const { error: itErr } = await supabase.from("sale_items").insert(rows);
  if (itErr) return Response.json({ error: itErr.message }, { status: 500 });

  // Decrement stock for product line items.
  for (const it of items) {
    if (it.kind === "product" && it.product_id) {
      const { data: p } = await supabase.from("products").select("stock_qty").eq("id", it.product_id).single();
      if (p) await supabase.from("products").update({ stock_qty: Math.max(0, p.stock_qty - (Number(it.qty) || 1)) }).eq("id", it.product_id);
    }
  }
  return Response.json(sale);
}
