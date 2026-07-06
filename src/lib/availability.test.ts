import { describe, it, expect } from "vitest";
import {
  computeAvailability,
  groupSlotsByTime,
  type BusyInterval,
  type Slot,
} from "@/lib/availability";
import { zonedWallTimeToUtc } from "@/lib/timezone";
import type { BusinessHours, Stylist } from "@/lib/types";

const TZ = "Europe/Rome";
const DATE = "2025-07-15"; // a Tuesday in summer (CEST, UTC+2)

function stylist(id: string, name: string): Stylist {
  return { id, name, active: true, created_at: "" };
}

const HOURS_OPEN: BusinessHours = {
  day_of_week: 2,
  is_closed: false,
  open_time: "09:00",
  close_time: "19:00",
  break_start: null,
  break_end: null,
};

/** A Rome wall-clock instant on the test date, in ms. */
function romeMs(h: number, m: number): number {
  return zonedWallTimeToUtc(2025, 7, 15, h, m, TZ).getTime();
}

/** `now` set to the previous day so min-lead-time never interferes. */
const NOW_EARLY = new Date("2025-07-14T00:00:00Z");

const G = stylist("g", "Genny");
const T = stylist("t", "Tony");

describe("computeAvailability", () => {
  // 1. Open day, single stylist — full grid of 15-min slots that fit before close.
  it("returns aligned slots across an open day", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: HOURS_OPEN,
      busy: [],
      now: NOW_EARLY,
    });
    // 09:00 .. 18:15 inclusive, step 15 => 38 slots.
    expect(slots.length).toBe(38);
    expect(slots[0].startUtc.toISOString()).toBe("2025-07-15T07:00:00.000Z"); // 09:00 Rome
    expect(slots[slots.length - 1].startUtc.getTime()).toBe(romeMs(18, 15));
    // grid is 15 minutes
    expect(slots[1].startUtc.getTime() - slots[0].startUtc.getTime()).toBe(15 * 60_000);
  });

  // 2. Closed day (is_closed) => nothing.
  it("returns [] on a closed day", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: { ...HOURS_OPEN, is_closed: true, open_time: null, close_time: null },
      busy: [],
      now: NOW_EARLY,
    });
    expect(slots).toEqual([]);
  });

  // 3. No stylists => nothing.
  it("returns [] when no stylists are considered", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [],
      hours: HOURS_OPEN,
      busy: [],
      now: NOW_EARLY,
    });
    expect(slots).toEqual([]);
  });

  // 4. Midday break splits the working window.
  it("excludes the pausa pranzo", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: { ...HOURS_OPEN, break_start: "13:00", break_end: "14:00" },
      busy: [],
      now: NOW_EARLY,
    });
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(12, 15))).toBe(true); // last morning slot (12:15+45=13:00)
    expect(times.has(romeMs(12, 30))).toBe(false); // would run into the break
    expect(times.has(romeMs(13, 30))).toBe(false); // inside the break
    expect(times.has(romeMs(14, 0))).toBe(true); // first afternoon slot
  });

  // 5. A busy interval blocks overlapping slots for that stylist.
  it("removes slots that overlap an existing appointment", () => {
    const busy: BusyInterval[] = [
      { stylist_id: "g", startMs: romeMs(10, 0), endMs: romeMs(11, 0) },
    ];
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: HOURS_OPEN,
      busy,
      now: NOW_EARLY,
    });
    // No returned slot may overlap [10:00, 11:00).
    for (const s of slots) {
      const overlaps =
        s.startUtc.getTime() < romeMs(11, 0) && s.endUtc.getTime() > romeMs(10, 0);
      expect(overlaps).toBe(false);
    }
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(9, 15))).toBe(true); // 09:15+45=10:00, touches but no overlap
    expect(times.has(romeMs(9, 30))).toBe(false); // 09:30+45=10:15, overlaps
    expect(times.has(romeMs(10, 0))).toBe(false);
  });

  // 6. A busy interval for a DIFFERENT stylist does not block.
  it("only blocks the busy stylist, not others", () => {
    const busy: BusyInterval[] = [
      { stylist_id: "g", startMs: romeMs(10, 0), endMs: romeMs(11, 0) },
    ];
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G, T],
      hours: HOURS_OPEN,
      busy,
      now: NOW_EARLY,
    });
    const at1000 = slots.filter((s) => s.startUtc.getTime() === romeMs(10, 0));
    expect(at1000.map((s) => s.stylistId)).toEqual(["t"]); // Genny busy, Tony free
  });

  // 7. Minimum lead time filters near-term slots.
  it("respects the minimum lead time", () => {
    const now = new Date("2025-07-15T07:30:00Z"); // 09:30 Rome; +60min lead => 10:30 Rome
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: HOURS_OPEN,
      busy: [],
      now,
    });
    expect(slots[0].startUtc.getTime()).toBe(romeMs(10, 30));
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(9, 0))).toBe(false);
    expect(times.has(romeMs(10, 15))).toBe(false);
  });

  // 8. Duration must fit entirely before closing time.
  it("only offers slots where the whole service fits before close", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 120,
      timeZone: TZ,
      stylists: [G],
      hours: HOURS_OPEN,
      busy: [],
      now: NOW_EARLY,
    });
    const last = slots[slots.length - 1];
    expect(last.startUtc.getTime()).toBe(romeMs(17, 0)); // 17:00+120=19:00
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(17, 15))).toBe(false);
  });

  // 9. Multiple stylists produce one slot each per free time.
  it("produces one slot per free stylist", () => {
    const slots = computeAvailability({
      dateLocal: DATE,
      durationMin: 45,
      timeZone: TZ,
      stylists: [G, T],
      hours: HOURS_OPEN,
      busy: [],
      now: NOW_EARLY,
    });
    expect(slots.length).toBe(38 * 2);
  });

  // 10. Winter date keeps the same wall-clock start (DST-safe).
  it("keeps 09:00 local start across DST (winter)", () => {
    const slots = computeAvailability({
      dateLocal: "2025-01-14", // Tuesday, CET (UTC+1)
      durationMin: 45,
      timeZone: TZ,
      stylists: [G],
      hours: HOURS_OPEN,
      busy: [],
      now: new Date("2025-01-13T00:00:00Z"),
    });
    expect(slots[0].startUtc.toISOString()).toBe("2025-01-14T08:00:00.000Z"); // 09:00 Rome winter
  });
});

describe("groupSlotsByTime", () => {
  // 11. Collapses per-stylist slots into distinct, sorted times.
  it("de-dupes by time and lists all free stylists, sorted ascending", () => {
    const t1 = new Date(romeMs(9, 0));
    const t2 = new Date(romeMs(9, 15));
    const slots: Slot[] = [
      { startUtc: t2, endUtc: t2, stylistId: "g", stylistName: "Genny" },
      { startUtc: t1, endUtc: t1, stylistId: "g", stylistName: "Genny" },
      { startUtc: t1, endUtc: t1, stylistId: "t", stylistName: "Tony" },
    ];
    const grouped = groupSlotsByTime(slots);
    expect(grouped.map((g) => g.startUtc.getTime())).toEqual([
      t1.getTime(),
      t2.getTime(),
    ]); // sorted
    expect(grouped[0].stylists.map((s) => s.id).sort()).toEqual(["g", "t"]);
    expect(grouped[1].stylists.map((s) => s.id)).toEqual(["g"]);
  });
});

describe("computeAvailability — per-stylist hours & time-off", () => {
  it("constrains a stylist to their own hours (intersected with salon)", () => {
    const stylistHours = new Map<string, BusinessHours | null>([
      ["g", { day_of_week: 2, is_closed: false, open_time: "10:00", close_time: "14:00", break_start: null, break_end: null }],
    ]);
    const slots = computeAvailability({ dateLocal: DATE, durationMin: 45, timeZone: TZ, stylists: [G], hours: HOURS_OPEN, busy: [], now: NOW_EARLY, stylistHours });
    expect(slots[0].startUtc.getTime()).toBe(romeMs(10, 0));
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(9, 0))).toBe(false);
    expect(times.has(romeMs(13, 15))).toBe(true);
    expect(times.has(romeMs(13, 30))).toBe(false);
  });
  it("gives no slots for a stylist marked off that day, others unaffected", () => {
    const stylistHours = new Map<string, BusinessHours | null>([["g", null]]);
    const slots = computeAvailability({ dateLocal: DATE, durationMin: 45, timeZone: TZ, stylists: [G, T], hours: HOURS_OPEN, busy: [], now: NOW_EARLY, stylistHours });
    expect(slots.some((s) => s.stylistId === "g")).toBe(false);
    expect(slots.filter((s) => s.stylistId === "t").length).toBe(38);
  });
  it("treats time-off as busy and blocks those slots", () => {
    const busy: BusyInterval[] = [{ stylist_id: "g", startMs: romeMs(10, 0), endMs: romeMs(12, 0) }];
    const slots = computeAvailability({ dateLocal: DATE, durationMin: 45, timeZone: TZ, stylists: [G], hours: HOURS_OPEN, busy, now: NOW_EARLY });
    const times = new Set(slots.map((s) => s.startUtc.getTime()));
    expect(times.has(romeMs(10, 30))).toBe(false);
    expect(times.has(romeMs(12, 0))).toBe(true);
  });
});
