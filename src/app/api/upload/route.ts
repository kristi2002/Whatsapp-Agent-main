import { NextRequest } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

/** POST multipart/form-data { file } -> uploads to the 'photos' bucket, returns public URL. */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Nessun file." }, { status: 400 });
  if (file.size > 8 * 1024 * 1024) return Response.json({ error: "File troppo grande (max 8MB)." }, { status: 400 });

  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const buf = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from("photos").upload(path, buf, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const { data } = supabase.storage.from("photos").getPublicUrl(path);
  return Response.json({ url: data.publicUrl });
}
