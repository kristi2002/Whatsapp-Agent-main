import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const phone = request.nextUrl.searchParams.get("phone");
  if (phone) {
    const { data } = await supabase.from("clients").select("*").eq("phone", phone).single();
    return Response.json(data ?? null);
  }
  const { data, error } = await supabase.from("clients").select("*").order("priority", { ascending: false }).order("name", { nullsFirst: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // Attach each client's most recent past visit (one extra query, mapped by phone).
  const nowIso = new Date().toISOString();
  const { data: past } = await supabase
    .from("appointments")
    .select("customer_phone, starts_at")
    .in("status", ["booked", "completed"])
    .lte("starts_at", nowIso)
    .order("starts_at", { ascending: false });
  const lastByPhone = new Map<string, string>();
  for (const a of past ?? []) {
    if (a.customer_phone && !lastByPhone.has(a.customer_phone)) lastByPhone.set(a.customer_phone, a.starts_at);
  }
  const withVisit = (data ?? []).map((c) => ({ ...c, last_visit: lastByPhone.get(c.phone) ?? null }));
  return Response.json(withVisit);
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
