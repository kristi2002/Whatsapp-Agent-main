import { supabase } from "@/lib/supabase";
import { SALON } from "@/lib/salon-config";

/** Public — services + stylists for the self-service booking picker. */
export async function GET() {
  const [services, stylists] = await Promise.all([
    supabase.from("services").select("id, name, duration_min, price_cents, category").eq("active", true).order("name"),
    supabase.from("stylists").select("id, name").eq("active", true).order("name"),
  ]);
  return Response.json({ salon: { name: SALON.name, address: SALON.address, phone: SALON.phone }, services: services.data ?? [], stylists: stylists.data ?? [] });
}
