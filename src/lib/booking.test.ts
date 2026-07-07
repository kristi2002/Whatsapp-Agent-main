import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Service } from "@/lib/types";

// Chainable, thenable Supabase stub: each awaited chain shifts one result.
const h = vi.hoisted(() => {
  const state: { queue: unknown[] } = { queue: [] };
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "in", "lt", "gt", "gte", "lte", "order", "limit", "single",
  ];
  for (const m of methods) builder[m] = () => builder;
  (builder as { then: unknown }).then = (
    resolve: (v: unknown) => unknown,
    reject: (e: unknown) => unknown
  ) => {
    const next = state.queue.length ? state.queue.shift() : { data: null, error: null };
    return Promise.resolve(next).then(resolve, reject);
  };
  return { state, supabase: { from: () => builder } };
});

vi.mock("@/lib/supabase", () => ({ supabase: h.supabase, getSupabase: () => h.supabase }));

import {
  formatServiceList,
  checkAvailability,
  bookAppointment,
  getAppointmentsForPhone,
  cancelAppointment,
} from "@/lib/booking";

const NOW = new Date("2025-07-15T10:00:00Z");

function svc(over: Partial<Service> = {}): Service {
  return {
    id: "s1",
    name: "Taglio donna",
    duration_min: 45,
    price_cents: 2500,
    active: true,
    created_at: "",
    ...over,
  };
}

beforeEach(() => {
  h.state.queue = [];
});

describe("formatServiceList (pure)", () => {
  it("renders name, duration and euro price", () => {
    expect(formatServiceList([svc()])).toBe("• Taglio donna — 45 min — €25,00");
  });
  it("shows 'su richiesta' when price is null", () => {
    expect(formatServiceList([svc({ price_cents: null })])).toContain("su richiesta");
  });
  it("handles an empty list", () => {
    expect(formatServiceList([])).toBe("Nessun servizio disponibile al momento.");
  });
});

describe("checkAvailability — validation branches", () => {
  it("reports when the requested service is unknown", async () => {
    h.state.queue = [{ data: [] }]; // listActiveServices -> none
    const res = await checkAvailability({ service: "Massaggio", date: "2025-07-20", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Non ho trovato il servizio");
  });

  it("rejects a past date", async () => {
    h.state.queue = [{ data: [svc()] }];
    const res = await checkAvailability({ service: "Taglio donna", date: "2020-01-01", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("già passata");
  });

  it("rejects a date beyond the max advance window", async () => {
    h.state.queue = [{ data: [svc()] }];
    const res = await checkAvailability({ service: "Taglio donna", date: "2030-01-01", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("al massimo");
  });
});

describe("bookAppointment — validation branches", () => {
  it("rejects an invalid startIso", async () => {
    h.state.queue = [{ data: [svc()] }];
    const res = await bookAppointment({
      service: "Taglio donna",
      startIso: "not-a-date",
      customerPhone: "393330000000",
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Orario non valido");
  });

  it("rejects a slot inside the minimum lead time", async () => {
    h.state.queue = [{ data: [svc()] }];
    const res = await bookAppointment({
      service: "Taglio donna",
      startIso: "2025-07-15T10:30:00.000Z", // only 30 min ahead of NOW
      customerPhone: "393330000000",
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("troppo vicino");
  });
});

describe("read/cancel with no data", () => {
  it("getAppointmentsForPhone reports no upcoming appointments", async () => {
    h.state.queue = [{ data: [] }];
    expect(await getAppointmentsForPhone("393330000000", NOW)).toContain(
      "Non hai appuntamenti futuri"
    );
  });

  it("cancelAppointment reports nothing to cancel", async () => {
    h.state.queue = [{ data: [] }];
    const res = await cancelAppointment({ customerPhone: "393330000000", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("Non ho trovato appuntamenti");
  });
});

describe("checkAvailability — full slot set for validation (regression)", () => {
  it("returns allSlots as the FULL set; options is a spread subset of it", async () => {
    const stylist = (id: string, name: string) => ({ id, name, active: true, created_at: "" });
    const HOURS_OPEN = { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "19:00", break_start: null, break_end: null };
    h.state.queue = [
      { data: [svc()] },                                  // listActiveServices
      { data: [stylist("g", "Genny"), stylist("t", "Tony")] }, // listActiveStylists
      { data: [] },                                       // stylist_services caps (unrestricted)
      { data: HOURS_OPEN },                               // business_hours .single()
      { data: [] },                                       // appointments
      { data: [] },                                       // stylist_hours
      { data: [] },                                       // stylist_time_off
    ];
    const res = await checkAvailability({ service: "Taglio donna", date: "2025-07-16", now: NOW });
    expect(res.ok).toBe(true);
    // Many free slots on an empty day → the display sample is smaller than the full set.
    expect(res.allSlots!.length).toBeGreaterThan(res.options!.length);
    // Every displayed option must be present in the full validation set.
    const all = new Set(res.allSlots!.map((s) => s.iso));
    for (const o of res.options!) expect(all.has(o.iso)).toBe(true);
    // A free time that is NOT in the sampled display is still in allSlots (bookable).
    expect(res.allSlots!.length).toBeGreaterThan(6);
  });
});

describe("recentOnlineBookingCount (abuse guard)", () => {
  it("returns the online booking count for the phone", async () => {
    h.state.queue = [{ count: 6 }];
    const { recentOnlineBookingCount } = await import("@/lib/booking");
    expect(await recentOnlineBookingCount("393330000000", NOW)).toBe(6);
  });
  it("returns 0 when there are none", async () => {
    h.state.queue = [{ count: null }];
    const { recentOnlineBookingCount } = await import("@/lib/booking");
    expect(await recentOnlineBookingCount("393330000000", NOW)).toBe(0);
  });
});

describe("rescheduleAppointment — validates target availability", () => {
  it("refuses to move an appointment to an unavailable slot (salon closed)", async () => {
    const { rescheduleAppointment } = await import("@/lib/booking");
    const appt = { id: "a1", customer_phone: "393330000000", status: "booked", service_id: "s1", stylist_id: "g", starts_at: "2025-07-16T08:00:00.000Z", ends_at: "2025-07-16T08:45:00.000Z" };
    const stylist = { id: "g", name: "Genny", active: true, created_at: "" };
    h.state.queue = [
      { data: [appt] },     // reschedule: find upcoming appt (unambiguous)
      { data: [svc()] },    // reschedule: listActiveServices
      { data: [stylist] },  // reschedule: listActiveStylists
      { data: [svc()] },    // checkAvailability: listActiveServices
      { data: [stylist] },  // checkAvailability: listActiveStylists
      { data: [] },         // checkAvailability: stylist_services caps
      { data: { day_of_week: 0, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null } }, // business_hours -> closed
    ];
    const res = await rescheduleAppointment({ customerPhone: "393330000000", startIso: "2025-07-20T10:00:00.000Z", now: NOW });
    expect(res.ok).toBe(false);
    expect(res.message).toContain("non è disponibile");
  });
});
