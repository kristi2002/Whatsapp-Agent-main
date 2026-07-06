import type { Appointment, Service, Stylist } from "@/lib/types";

/** Appointment joined with the service and stylist names for the calendar. */
export interface AppointmentWithRelations extends Appointment {
  service: Pick<Service, "name" | "duration_min" | "price_cents"> | null;
  stylist: Pick<Stylist, "name"> | null;
}

/** Service row including the category column (not in the base agent type). */
export interface ServiceRow extends Service {
  category: string | null;
}

/** Overview KPIs for the dashboard home. */
export interface OverviewStats {
  todayCount: number;
  upcomingCount: number;
  activeServices: number;
  activeStylists: number;
  conversations: number;
  today: AppointmentWithRelations[];
}

export interface ProductRow {
  id: string;
  name: string;
  brand: string | null;
  category: string | null;
  sku: string | null;
  price_cents: number | null;
  cost_cents: number | null;
  stock_qty: number;
  low_stock_threshold: number;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientRow {
  id: string;
  phone: string;
  name: string | null;
  email: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface SaleItem {
  id: string;
  sale_id: string;
  kind: "service" | "product";
  service_id: string | null;
  product_id: string | null;
  description: string;
  qty: number;
  unit_price_cents: number;
}

export interface Sale {
  id: string;
  client_id: string | null;
  customer_phone: string | null;
  appointment_id: string | null;
  total_cents: number;
  created_at: string;
  items?: SaleItem[];
}
