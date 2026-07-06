import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET /api/stylists — all stylists with the service ids they can perform. */
export async function GET() {
  const { data: stylists, error } = await supabase.from("stylists").select("*").order("name");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const { data: caps } = await supabase.from("stylist_services").select("stylist_id, service_id");
  const byStylist = new Map<string, string[]>();
  for (const c of caps ?? []) {
    const list = byStylist.get(c.stylist_id) ?? [];
    list.push(c.service_id);
    byStylist.set(c.stylist_id, list);
  }
  return Response.json((stylists ?? []).map((s) => ({ ...s, service_ids: byStylist.get(s.id) ?? [] })));
}

/** POST /api/stylists — create a stylist (optionally with service capabilities). */
export async function POST(request: NextRequest) {
  const b = await request.json();
  if (!b.name?.trim()) return Response.json({ error: "Il nome è obbligatorio." }, { status: 400 });
  const { data, error } = await supabase.from("stylists").insert({ name: b.name.trim(), active: b.active ?? true }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (Array.isArray(b.service_ids) && b.service_ids.length > 0) {
    await supabase.from("stylist_services").insert(b.service_ids.map((sid: string) => ({ stylist_id: data.id, service_id: sid })));
  }
  return Response.json(data);
}
