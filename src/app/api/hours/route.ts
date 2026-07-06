import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

/** GET /api/hours — all 7 weekday rows (0 = Sunday ... 6 = Saturday). */
export async function GET() {
  const { data, error } = await supabase.from("business_hours").select("*").order("day_of_week");
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}

/** PATCH /api/hours — upsert one weekday's hours. */
export async function PATCH(request: NextRequest) {
  const b = await request.json();
  const day = Number(b.day_of_week);
  if (!Number.isInteger(day) || day < 0 || day > 6) {
    return Response.json({ error: "Giorno non valido." }, { status: 400 });
  }
  const isClosed = !!b.is_closed;
  const row = {
    day_of_week: day,
    is_closed: isClosed,
    open_time: isClosed ? null : b.open_time || null,
    close_time: isClosed ? null : b.close_time || null,
    break_start: isClosed ? null : b.break_start || null,
    break_end: isClosed ? null : b.break_end || null,
  };
  const { data, error } = await supabase.from("business_hours").upsert(row, { onConflict: "day_of_week" }).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data);
}
