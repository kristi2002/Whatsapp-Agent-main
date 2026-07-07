/**
 * Booking data-access layer — the bridge between the AI tools and the shared
 * database. Everything the agent does to appointments goes through here so the
 * gestionale and the WhatsApp agent stay perfectly in sync.
 */

import { supabase } from "@/lib/supabase";
import { SALON, BOOKING } from "@/lib/salon-config";
import {
  computeAvailability,
  groupSlotsByTime,
  type BusyInterval,
} from "@/lib/availability";
import {
  zonedWallTimeToUtc,
  getZonedParts,
  formatZoned,
} from "@/lib/timezone";
import type { Service, Stylist, BusinessHours, Appointment } from "@/lib/types";

const TZ = SALON.timezone;
const LOCALE = SALON.locale;

function euro(cents: number | null): string {
  if (cents == null) return "su richiesta";
  return `€${(cents / 100).toFixed(2).replace(".", ",")}`;
}

export async function listActiveServices(): Promise<Service[]> {
  const { data } = await supabase
    .from("services")
    .select("*")
    .eq("active", true)
    .order("name");
  return data ?? [];
}

export async function listActiveStylists(): Promise<Stylist[]> {
  const { data } = await supabase
    .from("stylists")
    .select("*")
    .eq("active", true)
    .order("name");
  return data ?? [];
}

/** Fuzzy-match a service by name (case-insensitive substring) or exact id. */
function matchService(services: Service[], query: string): Service | null {
  const q = query.trim().toLowerCase();
  return (
    services.find((s) => s.id === query) ||
    services.find((s) => s.name.toLowerCase() === q) ||
    services.find((s) => s.name.toLowerCase().includes(q)) ||
    services.find((s) => q.includes(s.name.toLowerCase())) ||
    null
  );
}

function matchStylist(stylists: Stylist[], query?: string | null): Stylist | null {
  if (!query) return null;
  const q = query.trim().toLowerCase();
  return (
    stylists.find((s) => s.id === query) ||
    stylists.find((s) => s.name.toLowerCase() === q) ||
    stylists.find((s) => s.name.toLowerCase().includes(q)) ||
    null
  );
}

function weekdayOf(dateLocal: string): number {
  const [y, m, d] = dateLocal.split("-").map(Number);
  const noon = zonedWallTimeToUtc(y, m, d, 12, 0, TZ);
  return getZonedParts(noon, TZ).weekday;
}

/** UTC bounds [start, end) covering the whole local calendar day. */
function dayBoundsUtc(dateLocal: string): { start: Date; end: Date } {
  const [y, m, d] = dateLocal.split("-").map(Number);
  const start = zonedWallTimeToUtc(y, m, d, 0, 0, TZ);
  const end = new Date(start.getTime() + 26 * 60 * 60 * 1000); // +26h covers DST
  return { start, end };
}

export function formatServiceList(services: Service[]): string {
  if (services.length === 0) return "Nessun servizio disponibile al momento.";
  return services
    .map((s) => `• ${s.name} — ${s.duration_min} min — ${euro(s.price_cents)}`)
    .join("\n");
}

/** Evenly sample up to `max` items from a time-sorted list (keeps first & last). */
function spreadEven<T>(arr: T[], max: number): T[] {
  if (arr.length <= max) return arr;
  const out: T[] = [];
  const seen = new Set<number>();
  const step = (arr.length - 1) / (max - 1);
  for (let i = 0; i < max; i++) {
    const idx = Math.round(i * step);
    if (!seen.has(idx)) { seen.add(idx); out.push(arr[idx]); }
  }
  return out;
}

export interface AvailabilityResult {
  ok: boolean;
  message: string;
  serviceId?: string;
  serviceName?: string;
  durationMin?: number;
  options?: Array<{ iso: string; label: string; stylists: string[] }>;
}

export async function checkAvailability(params: {
  service: string;
  date: string; // YYYY-MM-DD (local)
  stylist?: string | null;
  now?: Date;
}): Promise<AvailabilityResult> {
  const now = params.now ?? new Date();
  const services = await listActiveServices();
  const service = matchService(services, params.service);
  if (!service) {
    return {
      ok: false,
      message: `Non ho trovato il servizio "${params.service}". Servizi disponibili:\n${formatServiceList(services)}`,
    };
  }

  // Validate the date is within the allowed booking window.
  const { start: dayStart, end: dayEnd } = dayBoundsUtc(params.date);
  const maxDate = now.getTime() + BOOKING.maxAdvanceDays * 24 * 60 * 60 * 1000;
  if (dayEnd.getTime() < now.getTime()) {
    return { ok: false, message: "Quella data è già passata. Indica una data futura." };
  }
  if (dayStart.getTime() > maxDate) {
    return {
      ok: false,
      message: `Posso prenotare al massimo ${BOOKING.maxAdvanceDays} giorni in anticipo.`,
    };
  }

  const stylists = await listActiveStylists();
  const requestedStylist = matchStylist(stylists, params.stylist);

  // Which stylists can perform this service. If the service has no rows in
  // stylist_services, everyone is considered capable (unconstrained).
  const { data: caps } = await supabase
    .from("stylist_services")
    .select("stylist_id")
    .eq("service_id", service.id);
  const capableIds = new Set((caps ?? []).map((c) => c.stylist_id));
  const restrict = capableIds.size > 0;
  const capable = restrict
    ? stylists.filter((s) => capableIds.has(s.id))
    : stylists;

  // A specific stylist was asked for but doesn't do this service.
  if (requestedStylist && restrict && !capableIds.has(requestedStylist.id)) {
    const others = capable.map((s) => s.name).join(", ");
    return {
      ok: true,
      serviceId: service.id,
      serviceName: service.name,
      durationMin: service.duration_min,
      options: [],
      message:
        `${requestedStylist.name} non esegue ${service.name}.` +
        (others ? ` Questo servizio è disponibile con: ${others}. Vuoi che controlli con loro?` : ""),
    };
  }

  const consider = requestedStylist ? [requestedStylist] : capable;

  const { data: hoursRow } = await supabase
    .from("business_hours")
    .select("*")
    .eq("day_of_week", weekdayOf(params.date))
    .single();
  const hours = hoursRow as BusinessHours | null;

  if (!hours || hours.is_closed) {
    return {
      ok: true,
      serviceId: service.id,
      serviceName: service.name,
      durationMin: service.duration_min,
      options: [],
      message: "Il salone è chiuso in quella data. Vuoi provare un altro giorno?",
    };
  }

  const weekday = weekdayOf(params.date);
  const consideredIds = consider.map((s) => s.id);

  const [apptsRes, shRes, offRes] = await Promise.all([
    supabase.from("appointments").select("stylist_id, starts_at, ends_at, status").in("status", ["booked", "completed"]).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()),
    consideredIds.length ? supabase.from("stylist_hours").select("*").eq("day_of_week", weekday).in("stylist_id", consideredIds) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
    consideredIds.length ? supabase.from("stylist_time_off").select("stylist_id, starts_at, ends_at").in("stylist_id", consideredIds).lt("starts_at", dayEnd.toISOString()).gt("ends_at", dayStart.toISOString()) : Promise.resolve({ data: [] as Array<Record<string, unknown>> }),
  ]);

  const busy: BusyInterval[] = (apptsRes.data ?? []).map((a) => ({
    stylist_id: a.stylist_id,
    startMs: new Date(a.starts_at).getTime(),
    endMs: new Date(a.ends_at).getTime(),
  }));
  // Time-off blocks the stylist like a busy interval.
  for (const t of (offRes.data ?? []) as Array<{ stylist_id: string; starts_at: string; ends_at: string }>) {
    busy.push({ stylist_id: t.stylist_id, startMs: new Date(t.starts_at).getTime(), endMs: new Date(t.ends_at).getTime() });
  }

  // Per-stylist hours (if configured). A row with is_working=false means off.
  const stylistHours = new Map<string, BusinessHours | null>();
  for (const r of (shRes.data ?? []) as Array<{ stylist_id: string; is_working: boolean; open_time: string | null; close_time: string | null; break_start: string | null; break_end: string | null }>) {
    stylistHours.set(r.stylist_id, r.is_working === false ? null : { day_of_week: weekday, is_closed: !r.is_working, open_time: r.open_time, close_time: r.close_time, break_start: r.break_start, break_end: r.break_end });
  }

  const slots = computeAvailability({
    dateLocal: params.date,
    durationMin: service.duration_min,
    timeZone: TZ,
    stylists: consider,
    hours,
    busy,
    now,
    stylistHours,
  });

  const groupedAll = groupSlotsByTime(slots);
  // Prefer round times (:00 / :30); spread the offered slots across the whole
  // day instead of returning the earliest consecutive ones.
  const roundOnes = groupedAll.filter((g) => getZonedParts(g.startUtc, TZ).minute % 30 === 0);
  const pool = roundOnes.length >= Math.min(4, BOOKING.maxSlotsReturned) ? roundOnes : groupedAll;
  const grouped = spreadEven(pool, BOOKING.maxSlotsReturned);
  const options = grouped.map((g) => ({
    iso: g.startUtc.toISOString(),
    label: formatZoned(g.startUtc, TZ, LOCALE),
    stylists: g.stylists.map((s) => s.name),
  }));

  return {
    ok: true,
    serviceId: service.id,
    serviceName: service.name,
    durationMin: service.duration_min,
    options,
    message:
      options.length === 0
        ? "Non ci sono orari liberi in quella data. Vuoi provare un altro giorno?"
        : `Orari disponibili per ${service.name}:\n` +
          options
            .map(
              (o) =>
                `• ${o.label}${o.stylists.length ? ` (con ${o.stylists.join(" o ")})` : ""}`
            )
            .join("\n"),
  };
}

export interface BookResult {
  ok: boolean;
  message: string;
  appointmentId?: string;
}

export async function bookAppointment(params: {
  service: string;
  startIso: string; // exact UTC instant chosen from availability
  customerPhone: string;
  customerName?: string | null;
  stylist?: string | null;
  conversationId?: string | null;
  now?: Date;
}): Promise<BookResult> {
  const now = params.now ?? new Date();
  const services = await listActiveServices();
  const service = matchService(services, params.service);
  if (!service) {
    return { ok: false, message: `Servizio "${params.service}" non trovato.` };
  }

  const start = new Date(params.startIso);
  if (isNaN(start.getTime())) {
    return { ok: false, message: "Orario non valido." };
  }
  if (start.getTime() < now.getTime() + BOOKING.minLeadTimeMin * 60_000) {
    return { ok: false, message: "Quell'orario è troppo vicino o già passato. Scegline un altro." };
  }
  const end = new Date(start.getTime() + service.duration_min * 60_000);

  // Re-check availability at the exact slot to avoid double-booking (the DB
  // exclusion constraint is the final guard, but this gives a clean message).
  const dateLocal = (() => {
    const p = getZonedParts(start, TZ);
    return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  })();
  const avail = await checkAvailability({
    service: service.id,
    date: dateLocal,
    stylist: params.stylist,
    now,
  });
  const match = avail.options?.find((o) => o.iso === start.toISOString());
  if (!match) {
    return {
      ok: false,
      message: "Quell'orario non è più disponibile. " + (avail.message || ""),
    };
  }

  // Resolve stylist: requested one, else the first free at that slot.
  const stylists = await listActiveStylists();
  const requested = matchStylist(stylists, params.stylist);
  const chosen =
    requested ?? stylists.find((s) => match.stylists.includes(s.name)) ?? null;
  if (!chosen) {
    return { ok: false, message: "Nessun parrucchiere disponibile a quell'orario." };
  }

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      stylist_id: chosen.id,
      service_id: service.id,
      conversation_id: params.conversationId ?? null,
      customer_name: params.customerName ?? null,
      customer_phone: params.customerPhone,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: "booked",
      source: "whatsapp",
    })
    .select()
    .single();

  if (error) {
    // 23P01 = exclusion violation (slot taken between check and insert).
    if (error.code === "23P01") {
      return { ok: false, message: "Quell'orario è appena stato prenotato da qualcun altro. Scegline un altro." };
    }
    return { ok: false, message: "Non sono riuscito a completare la prenotazione. Riprova." };
  }

  return {
    ok: true,
    appointmentId: (data as Appointment).id,
    message: `Prenotazione confermata: ${service.name} il ${formatZoned(start, TZ, LOCALE)} con ${chosen.name}.`,
  };
}

export async function getAppointmentsForPhone(
  phone: string,
  now: Date = new Date()
): Promise<string> {
  const { data } = await supabase
    .from("appointments")
    .select("id, starts_at, status, service_id, stylist_id")
    .eq("customer_phone", phone)
    .eq("status", "booked")
    .gte("starts_at", now.toISOString())
    .order("starts_at");

  if (!data || data.length === 0) return "Non hai appuntamenti futuri prenotati.";

  const [services, stylists] = await Promise.all([
    listActiveServices(),
    listActiveStylists(),
  ]);
  return data
    .map((a) => {
      const svc = services.find((s) => s.id === a.service_id)?.name ?? "servizio";
      const sty = stylists.find((s) => s.id === a.stylist_id)?.name ?? "";
      return `• ${formatZoned(new Date(a.starts_at), TZ, LOCALE)} — ${svc}${sty ? ` con ${sty}` : ""} (id: ${a.id})`;
    })
    .join("\n");
}

export async function cancelAppointment(params: {
  appointmentId?: string;
  customerPhone: string;
  now?: Date;
}): Promise<{ ok: boolean; message: string }> {
  const now = params.now ?? new Date();

  // If no id given, cancel the customer's single upcoming appointment if unambiguous.
  let id = params.appointmentId;
  if (!id) {
    const { data } = await supabase
      .from("appointments")
      .select("id")
      .eq("customer_phone", params.customerPhone)
      .eq("status", "booked")
      .gte("starts_at", now.toISOString());
    if (!data || data.length === 0) {
      return { ok: false, message: "Non ho trovato appuntamenti da annullare." };
    }
    if (data.length > 1) {
      return {
        ok: false,
        message: "Hai più appuntamenti. Dimmi quale annullare (indica data e ora).",
      };
    }
    id = data[0].id;
  }

  const { data: appt } = await supabase
    .from("appointments")
    .select("id, customer_phone, status")
    .eq("id", id)
    .single();

  if (!appt || appt.customer_phone !== params.customerPhone) {
    return { ok: false, message: "Appuntamento non trovato." };
  }
  if (appt.status !== "booked") {
    return { ok: false, message: "Quell'appuntamento non è attivo." };
  }

  await supabase
    .from("appointments")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id);

  return { ok: true, message: "Appuntamento annullato. A presto!" };
}

/**
 * Move an existing appointment to a new time (and optionally stylist/service),
 * updating the SAME row instead of creating a new booking. Keeps the original
 * stylist unless a new one is explicitly requested.
 */
export async function rescheduleAppointment(params: {
  appointmentId?: string;
  customerPhone: string;
  startIso: string;
  stylist?: string | null;
  service?: string | null;
  now?: Date;
}): Promise<{ ok: boolean; message: string; appointmentId?: string }> {
  const now = params.now ?? new Date();

  // Locate the appointment: by id, or the customer's single upcoming booking.
  let appt: Appointment | null = null;
  if (params.appointmentId) {
    const { data } = await supabase.from("appointments").select("*").eq("id", params.appointmentId).single();
    appt = (data as Appointment) ?? null;
    if (!appt || appt.customer_phone !== params.customerPhone) return { ok: false, message: "Appuntamento non trovato." };
  } else {
    const { data } = await supabase
      .from("appointments").select("*")
      .eq("customer_phone", params.customerPhone).eq("status", "booked")
      .gte("starts_at", now.toISOString()).order("starts_at");
    const list = (data as Appointment[]) ?? [];
    if (list.length === 0) return { ok: false, message: "Non trovo appuntamenti futuri da modificare." };
    if (list.length > 1) {
      const services = await listActiveServices();
      const lines = list.map((a) => `• ${formatZoned(new Date(a.starts_at), TZ, LOCALE)} — ${services.find((s) => s.id === a.service_id)?.name ?? "servizio"} (id: ${a.id})`).join("\n");
      return { ok: false, message: `Hai più appuntamenti futuri. Quale vuoi spostare?\n${lines}` };
    }
    appt = list[0];
  }
  if (!appt) return { ok: false, message: "Appuntamento non trovato." };
  if (appt.status !== "booked") return { ok: false, message: "Quell'appuntamento non è attivo." };

  const start = new Date(params.startIso);
  if (isNaN(start.getTime())) return { ok: false, message: "Orario non valido." };
  if (start.getTime() < now.getTime() + BOOKING.minLeadTimeMin * 60_000) {
    return { ok: false, message: "Quell'orario è troppo vicino o già passato. Scegline un altro." };
  }

  const services = await listActiveServices();
  const service = params.service ? matchService(services, params.service) : services.find((s) => s.id === appt!.service_id) ?? null;
  const durationMin = service?.duration_min ?? Math.round((new Date(appt.ends_at).getTime() - new Date(appt.starts_at).getTime()) / 60_000);
  const end = new Date(start.getTime() + durationMin * 60_000);

  const stylists = await listActiveStylists();
  const requested = params.stylist ? matchStylist(stylists, params.stylist) : null;

  const update: Record<string, unknown> = { starts_at: start.toISOString(), ends_at: end.toISOString(), updated_at: now.toISOString() };
  if (requested) update.stylist_id = requested.id;
  if (service && params.service) update.service_id = service.id;

  const { data, error } = await supabase.from("appointments").update(update).eq("id", appt.id).select().single();
  if (error) {
    if (error.code === "23P01") return { ok: false, message: "Quell'orario è già occupato per il parrucchiere. Scegline un altro." };
    return { ok: false, message: "Non sono riuscito a spostare l'appuntamento. Riprova." };
  }
  const finalStylist = stylists.find((s) => s.id === (data as Appointment).stylist_id);
  return {
    ok: true,
    appointmentId: appt.id,
    message: `Appuntamento spostato a ${formatZoned(start, TZ, LOCALE)}${finalStylist ? ` con ${finalStylist.name}` : ""}.`,
  };
}
