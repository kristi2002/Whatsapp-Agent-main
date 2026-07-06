export interface Conversation {
  id: string;
  phone: string;
  name: string | null;
  mode: "agent" | "human";
  updated_at: string;
  created_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: "user" | "assistant";
  content: string;
  whatsapp_msg_id: string | null;
  created_at: string;
}

export interface ConversationWithLastMessage extends Conversation {
  last_message: string | null;
}

export interface Stylist {
  id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface Service {
  id: string;
  name: string;
  duration_min: number;
  price_cents: number | null;
  active: boolean;
  created_at: string;
}

export interface BusinessHours {
  day_of_week: number; // 0 = Sunday ... 6 = Saturday
  is_closed: boolean;
  open_time: string | null; // "HH:MM:SS" local (Europe/Rome)
  close_time: string | null;
  break_start: string | null;
  break_end: string | null;
}

export type AppointmentStatus = "booked" | "completed" | "cancelled" | "no_show";

export interface Appointment {
  id: string;
  stylist_id: string;
  service_id: string;
  conversation_id: string | null;
  customer_name: string | null;
  customer_phone: string;
  starts_at: string; // ISO timestamptz (UTC)
  ends_at: string;
  status: AppointmentStatus;
  source: "whatsapp" | "gestionale" | "phone" | "online";
  notes: string | null;
  created_at: string;
  updated_at: string;
}
