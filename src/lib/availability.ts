/**
 * Availability engine — pure slot computation.
 *
 * Given a service duration, the salon's business hours, per-stylist hours and
 * existing appointments, it returns the free start times per stylist. All
 * comparisons are done on absolute UTC instants, so DST is handled correctly.
 */

import type { BusinessHours, Stylist } from "@/lib/types";
import { BOOKING } from "@/lib/salon-config";
import { zonedWallTimeToUtc, timeToMinutes } from "@/lib/timezone";

export interface BusyInterval {
  stylist_id: string;
  startMs: number;
  endMs: number;
}

export interface Slot {
  startUtc: Date;
  endUtc: Date;
  stylistId: string;
  stylistName: string;
}

interface ComputeArgs {
  /** Local calendar date in the salon tz, "YYYY-MM-DD". */
  dateLocal: string;
  durationMin: number;
  timeZone: string;
  stylists: Stylist[]; // already filtered to the ones being considered
  hours: BusinessHours; // salon row for that weekday
  busy: BusyInterval[]; // active appointments (+ time-off) overlapping that day
  now: Date;
  /**
   * Optional per-stylist working hours for that weekday. If a stylist id is
   * present, their own hours are used (intersected with the salon hours); a
   * null value or is_closed means the stylist is off that day. Stylists not in
   * the map fall back to the salon hours.
   */
  stylistHours?: Map<string, BusinessHours | null>;
}

/** Convert a wall-clock minutes-of-day on `dateLocal` to a UTC instant (ms). */
function localMinutesToUtcMs(dateLocal: string, minutesOfDay: number, timeZone: string): number {
  const [y, m, d] = dateLocal.split("-").map(Number);
  const hh = Math.floor(minutesOfDay / 60);
  const mm = minutesOfDay % 60;
  return zonedWallTimeToUtc(y, m, d, hh, mm, timeZone).getTime();
}

/** Working intervals (in minutes-of-day) after removing the midday break. */
function workingIntervals(hours: BusinessHours): Array<[number, number]> {
  if (hours.is_closed || !hours.open_time || !hours.close_time) return [];
  const open = timeToMinutes(hours.open_time);
  const close = timeToMinutes(hours.close_time);
  if (hours.break_start && hours.break_end) {
    const bs = timeToMinutes(hours.break_start);
    const be = timeToMinutes(hours.break_end);
    return [[open, bs], [be, close]];
  }
  return [[open, close]];
}

/** Intersection of two sets of minute intervals. */
function intersect(a: Array<[number, number]>, b: Array<[number, number]>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [as, ae] of a) for (const [bs, be] of b) {
    const s = Math.max(as, bs), e = Math.min(ae, be);
    if (e > s) out.push([s, e]);
  }
  return out;
}

/**
 * Compute available slots for a single day. Returns one entry per (time,
 * stylist) that is free for the full duration.
 */
export function computeAvailability(args: ComputeArgs): Slot[] {
  const { dateLocal, durationMin, timeZone, stylists, hours, busy, now, stylistHours } = args;
  const salonIntervals = workingIntervals(hours);
  if (salonIntervals.length === 0 || stylists.length === 0) return [];

  const step = BOOKING.slotGranularityMin;
  const durationMs = durationMin * 60_000;
  const earliestStartMs = now.getTime() + BOOKING.minLeadTimeMin * 60_000;

  const busyByStylist = new Map<string, Array<[number, number]>>();
  for (const b of busy) {
    const list = busyByStylist.get(b.stylist_id) ?? [];
    list.push([b.startMs, b.endMs]);
    busyByStylist.set(b.stylist_id, list);
  }

  const slots: Slot[] = [];

  for (const stylist of stylists) {
    let intervals = salonIntervals;
    if (stylistHours && stylistHours.has(stylist.id)) {
      const sh = stylistHours.get(stylist.id);
      intervals = !sh || sh.is_closed ? [] : intersect(salonIntervals, workingIntervals(sh));
    }
    if (intervals.length === 0) continue;
    const stylistBusy = busyByStylist.get(stylist.id) ?? [];

    for (const [intervalStart, intervalEnd] of intervals) {
      for (let m = intervalStart; m + durationMin <= intervalEnd; m += step) {
        const startMs = localMinutesToUtcMs(dateLocal, m, timeZone);
        const endMs = startMs + durationMs;
        if (startMs < earliestStartMs) continue;
        const overlaps = stylistBusy.some(([bStart, bEnd]) => startMs < bEnd && endMs > bStart);
        if (overlaps) continue;
        slots.push({ startUtc: new Date(startMs), endUtc: new Date(endMs), stylistId: stylist.id, stylistName: stylist.name });
      }
    }
  }

  return slots;
}

/**
 * Collapse per-stylist slots into distinct start times, each listing which
 * stylists are free. Useful for presenting concise options to the customer.
 */
export function groupSlotsByTime(slots: Slot[]): Array<{ startUtc: Date; stylists: Array<{ id: string; name: string }> }> {
  const byTime = new Map<number, { startUtc: Date; stylists: Array<{ id: string; name: string }> }>();
  for (const s of slots) {
    const key = s.startUtc.getTime();
    const entry = byTime.get(key) ?? { startUtc: s.startUtc, stylists: [] };
    if (!entry.stylists.some((st) => st.id === s.stylistId)) entry.stylists.push({ id: s.stylistId, name: s.stylistName });
    byTime.set(key, entry);
  }
  return [...byTime.values()].sort((a, b) => a.startUtc.getTime() - b.startUtc.getTime());
}
