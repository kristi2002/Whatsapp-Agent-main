import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** POST { delta, reason } — manually adjust a client's loyalty points. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await request.json();
  const delta = Number(b.delta);
  if (!Number.isFinite(delta) || delta === 0) return Response.json({ error: "Valore non valido." }, { status: 400 });
  const { data: cl } = await supabase.from("clients").select("loyalty_points").eq("id", id).single();
  if (!cl) return Response.json({ error: "Cliente non trovato." }, { status: 404 });
  const next = Math.max(0, (cl.loyalty_points || 0) + delta);
  await supabase.from("clients").update({ loyalty_points: next }).eq("id", id);
  await supabase.from("loyalty_transactions").insert({ client_id: id, delta, reason: b.reason?.trim() || (delta > 0 ? "aggiunta" : "riscatto") });
  return Response.json({ loyalty_points: next });
}
