import { supabase } from "@/lib/supabase";

/** GET — distinct brands / lines / tones used, for autocomplete. */
export async function GET() {
  const [items, products] = await Promise.all([
    supabase.from("color_session_items").select("brand, line, tone"),
    supabase.from("products").select("brand").not("brand", "is", null),
  ]);
  const brands = new Set<string>(), lines = new Set<string>(), tones = new Set<string>();
  for (const it of items.data ?? []) { if (it.brand) brands.add(it.brand); if (it.line) lines.add(it.line); if (it.tone) tones.add(it.tone); }
  for (const p of products.data ?? []) if (p.brand) brands.add(p.brand);
  return Response.json({ brands: [...brands].sort(), lines: [...lines].sort(), tones: [...tones].sort() });
}
