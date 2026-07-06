import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const { data, error } = await supabase.from("products").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.name?.trim()) return Response.json({ error: "Il nome è obbligatorio." }, { status: 400 });
  const num = (v: unknown) => (v === "" || v === null || v === undefined ? null : Number(v));
  const { data, error } = await supabase.from("products").insert({
    name: b.name.trim(),
    brand: b.brand?.trim() || null,
    category: b.category?.trim() || null,
    sku: b.sku?.trim() || null,
    price_cents: num(b.price_cents),
    cost_cents: num(b.cost_cents),
    stock_qty: Number(b.stock_qty) || 0,
    low_stock_threshold: b.low_stock_threshold === undefined ? 3 : Number(b.low_stock_threshold),
    active: b.active ?? true,
  }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
