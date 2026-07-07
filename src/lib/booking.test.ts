import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Service } from "@/lib/types";

// Chainable, thenable Supabase stub: each awaited chain shifts one result.
const h = vi.hoisted(() => {
  const state: { queue: unknown[] } = { queue: [] };
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "update", "delete",
    "eq", "neq", "in", "lt", "gt", "gte", "lte", "order", "limit", "single", "maybeSingle",
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
  formatBusinessHours,
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

describe("bookAppointment — suggests nearest times when the slot is unavailable", () => {
  it("returns the closest free times (not just a rejection) when the requested slot isn't bookable", async () => {
    const stylist = { id: "g", name: "Genny", active: true, created_at: "" };
    const HOURS_OPEN = { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "19:00", break_start: null, break_end: null };
    h.state.queue = [
      { data: [svc()] },    // bookAppointment: listActiveServices
      { data: [svc()] },    // checkAvailability: listActiveServices
      { data: [stylist] },  // checkAvailability: listActiveStylists
      { data: [] },         // checkAvailability: stylist_services caps
      { data: HOURS_OPEN }, // checkAvailability: business_hours
      { data: [] },         // appointments
      { data: [] },         // stylist_hours
      { data: [] },         // stylist_time_off
    ];
    // 08:15 Rome (06:15Z) — before opening, so not a valid slot, though the day has plenty of free times.
    const res = await bookAppointment({
      service: "Taglio donna",
      startIso: "2025-07-16T06:15:00.000Z",
      customerPhone: "393330000000",
      now: NOW,
    });
    expect(res.ok).toBe(false);
    expect(res.appointmentId).toBeUndefined();
    expect(res.alternatives!.length).toBeGreaterThan(0);
    expect(res.message).toContain("orari liberi più vicini");
    // Alternatives carry a local HH:MM label and are sorted chronologically.
    expect(res.alternatives!.every((a) => /^\d{2}:\d{2}$/.test(a.time))).toBe(true);
    const isoTimes = res.alternatives!.map((a) => new Date(a.iso).getTime());
    expect(isoTimes).toEqual([...isoTimes].sort((x, y) => x - y));
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
    // Each free slot carries a local HH:MM label for exact-time checks.
    expect(res.allSlots!.every((sl) => /^\d{2}:\d{2}$/.test(sl.time))).toBe(true);
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

describe("checkAvailability — respects business hours (regression)", () => {
  it("treats a closed weekday as closed (no slots)", async () => {
    h.state.queue = [
      { data: [svc()] },                                   // listActiveServices
      { data: [{ id: "g", name: "Genny", active: true, created_at: "" }] }, // listActiveStylists
      { data: [] },                                        // stylist_services caps
      { data: { day_of_week: 0, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null } }, // business_hours -> closed
    ];
    const res = await checkAvailability({ service: "Taglio donna", date: "2025-07-20", now: NOW }); // Sunday
    expect(res.options).toEqual([]);
    expect(res.message).toContain("chiuso");
  });

  it("treats a day flagged open but with no hours as closed", async () => {
    h.state.queue = [
      { data: [svc()] },
      { data: [{ id: "g", name: "Genny", active: true, created_at: "" }] },
      { data: [] },
      { data: { day_of_week: 2, is_closed: false, open_time: null, close_time: null, break_start: null, break_end: null } },
    ];
    const res = await checkAvailability({ service: "Taglio donna", date: "2025-07-16", now: NOW });
    expect(res.options).toEqual([]);
    expect(res.message).toContain("chiuso");
  });
});

describe("formatBusinessHours", () => {
  it("lists open days with hours and names the closed days", async () => {
    h.state.queue = [
      {
        data: [
          { day_of_week: 0, is_closed: true, open_time: null, close_time: null },
          { day_of_week: 1, is_closed: true, open_time: null, close_time: null },
          { day_of_week: 2, is_closed: false, open_time: "09:00:00", close_time: "19:00:00" },
          { day_of_week: 3, is_closed: false, open_time: "09:00:00", close_time: "19:00:00" },
          { day_of_week: 4, is_closed: false, open_time: "09:00:00", close_time: "19:00:00" },
          { day_of_week: 5, is_closed: false, open_time: "09:00:00", close_time: "19:00:00" },
          { day_of_week: 6, is_closed: false, open_time: "09:00:00", close_time: "18:00:00" },
        ],
      },
    ];
    const label = await formatBusinessHours();
    expect(label).toContain("Chiuso: domenica, lunedì.");
    expect(label).toContain("martedì: 09:00–19:00");
    expect(label).toContain("sabato: 09:00–18:00");
    // Closed days must NOT appear as open lines.
    expect(label).not.toContain("domenica: ");
  });

  it("returns an empty string when the table has no rows", async () => {
    h.state.queue = [{ data: [] }];
    expect(await formatBusinessHours()).toBe("");
  });
});

describe("checkAvailability — respects stylist ferie / time-off (agent path)", () => {
  const stylist = { id: "g", name: "Genny", active: true, created_at: "" };
  const HOURS_OPEN = { day_of_week: 3, is_closed: false, open_time: "09:00", close_time: "19:00", break_start: null, break_end: null };
  // NOTE: 2025-07-16 is CEST (UTC+2), so 09:00 Rome = 07:00Z, 19:00 Rome = 17:00Z.

  it("returns no slots when the only stylist is on ferie for the whole day", async () => {
    h.state.queue = [
      { data: [svc()] },                                   // listActiveServices
      { data: [stylist] },                                 // listActiveStylists
      { data: [] },                                        // caps (unrestricted)
      { data: HOURS_OPEN },                                // business_hours
      { data: [] },                                        // appointments
      { data: [] },                                        // stylist_hours
      { data: [{ stylist_id: "g", starts_at: "2025-07-16T06:00:00.000Z", ends_at: "2025-07-16T18:00:00.000Z" }] }, // stylist_time_off — full day
    ];
    const res = await checkAvailability({ service: "Taglio donna", date: "2025-07-16", now: NOW });
    expect(res.ok).toBe(true);
    expect(res.allSlots ?? []).toHaveLength(0);
    expect(res.options ?? []).toHaveLength(0);
  });

  it("removes only the slots overlapping a partial ferie window", async () => {
    h.state.queue = [
      { data: [svc()] },
      { data: [stylist] },
      { data: [] },
      { data: HOURS_OPEN },
      { data: [] },
      { data: [] },
      { data: [{ stylist_id: "g", starts_at: "2025-07-16T07:00:00.000Z", ends_at: "2025-07-16T11:00:00.000Z" }] }, // off 09:00–13:00 Rome
    ];
    const res = await checkAvailability({ service: "Taglio donna", date: "2025-07-16", now: NOW });
    expect(res.ok).toBe(true);
    const times = new Set((res.allSlots ?? []).map((s) => s.time));
    expect(times.has("09:00")).toBe(false); // start of ferie
    expect(times.has("10:00")).toBe(false); // inside ferie
    expect(times.has("15:00")).toBe(true);  // afternoon, well clear of ferie
  });
});
