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
