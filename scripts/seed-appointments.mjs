#!/usr/bin/env node
/**
 * Seed the database with appointments so you can test the agent's
 * check_availability / booking / reschedule logic against a realistic,
 * partially-booked calendar (scattered free slots, not a full day).
 *
 * It reads your REAL stylists, services and business hours from Supabase and
 * books non-overlapping 60-min blocks per operator at the chosen density,
 * leaving gaps. Every seeded row is tagged notes="[seed]" so it can be removed.
 *
 * Usage (loads .env.local automatically):
 *   npm run seed                    # next 5 open days, density 0.6
 *   npm run seed -- 7               # next 7 open days
 *   npm run seed -- 2026-07-10      # one specific date
 *   npm run seed -- 2026-07-10 0.8  # specific date, 80% full
 *   npm run seed -- --clear         # remove ALL seeded ([seed]) appointments
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (in .env.local).
 */

import { createClient } from "@supabase/supabase-js";

const TZ = "Europe/Rome";
const SEED_TAG = "[seed]";
const SEED_PHONE_PREFIX = "390000";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run via:  node --env-file=.env.local scripts/seed-appointments.mjs   (or `npm run seed`)");
  process.exit(1);
}
const db = createClient(url, key);

// --- timezone helpers (mirror src/lib/timezone.ts) ---
function tzOffsetMs(date) {
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const map = {};
  for (const p of dtf.formatToParts(date)) map[p.type] = p.value;
  const hour = map.hour === "24" ? "00" : map.hour;
  return Date.UTC(+map.year, +map.month - 1, +map.day, +hour, +map.minute, +map.second) - date.getTime();
}
function zonedWallTimeToUtc(y, m, d, hh, mm) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0);
  let off = tzOffsetMs(new Date(guess));
  let res = new Date(guess - off);
  off = tzOffsetMs(res);
  return new Date(guess - off);
}
function weekdayOf(y, m, d) {
  const noon = zonedWallTimeToUtc(y, m, d, 12, 0);
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(noon);
  return { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[wd];
}
function timeToMin(t) { const [h, m] = t.split(":").map(Number); return h * 60 + m; }
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const addDays = (dateStr, n) => { const [y, m, d] = dateStr.split("-").map(Number); return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, d + n))); };

// --- clear mode ---
async function clear() {
  const { data: del } = await db.from("appointments").delete().eq("notes", SEED_TAG).select("id");
  await db.from("clients").delete().like("phone", SEED_PHONE_PREFIX + "%");
  console.log(`Removed ${del?.length ?? 0} seeded appointments (and their seed clients).`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--clear")) return clear();

  const dateArg = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a));
  const daysArg = args.find((a) => /^\d+$/.test(a));
  const densityArg = args.find((a) => /^0?\.\d+$/.test(a));
  const density = densityArg ? Number(densityArg) : 0.6;

  let dates;
  if (dateArg) dates = [dateArg];
  else {
    const n = daysArg ? Number(daysArg) : 5;
    dates = Array.from({ length: n }, (_, i) => addDays(todayLocal(), i + 1)); // start tomorrow
  }

  const [{ data: stylists }, { data: services }, { data: hours }] = await Promise.all([
    db.from("stylists").select("id, name").eq("active", true),
    db.from("services").select("id, name, duration_min").eq("active", true),
    db.from("business_hours").select("*"),
  ]);
  if (!stylists?.length) return console.error("No active stylists. Run the schema/seed first.");
  if (!services?.length) return console.error("No active services.");
  const shortSvcs = services.filter((s) => s.duration_min <= 60);
  const pool = shortSvcs.length ? shortSvcs : services;
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const rows = [];
  let seq = 0;
  for (const date of dates) {
    const [y, m, d] = date.split("-").map(Number);
    const wd = weekdayOf(y, m, d);
    const h = hours?.find((r) => r.day_of_week === wd);
    if (!h || h.is_closed || !h.open_time || !h.close_time) { console.log(`· ${date}: chiuso, salto.`); continue; }
    const open = timeToMin(h.open_time), close = timeToMin(h.close_time);
    const bs = h.break_start ? timeToMin(h.break_start) : null;
    const be = h.break_end ? timeToMin(h.break_end) : null;
    const intervals = bs != null && be != null ? [[open, bs], [be, close]] : [[open, close]];

    let dayCount = 0;
    for (const st of stylists) {
      for (const [s0, s1] of intervals) {
        for (let min = s0; min + 60 <= s1; min += 60) {
          if (Math.random() > density) continue;
          const svc = pick(pool);
          const startMin = min;
          const endMin = startMin + Math.min(svc.duration_min, 60);
          const start = zonedWallTimeToUtc(y, m, d, Math.floor(startMin / 60), startMin % 60);
          const end = zonedWallTimeToUtc(y, m, d, Math.floor(endMin / 60), endMin % 60);
          rows.push({
            stylist_id: st.id, service_id: svc.id,
            customer_name: "Cliente Seed", customer_phone: SEED_PHONE_PREFIX + String(seq++).padStart(4, "0"),
            starts_at: start.toISOString(), ends_at: end.toISOString(),
            status: "booked", source: "gestionale", notes: SEED_TAG,
          });
          dayCount++;
        }
      }
    }
    console.log(`· ${date}: +${dayCount} appuntamenti`);
  }

  if (!rows.length) return console.log("Nessun appuntamento da inserire (giorni chiusi?).");
  const { error } = await db.from("appointments").insert(rows);
  if (error) return console.error("Insert error:", error.message);
  console.log(`\n✓ Inseriti ${rows.length} appuntamenti (tag ${SEED_TAG}) su ${stylists.length} operatori.`);
  console.log("Ora prova l'agente: gli slot liberi saranno sparsi nella giornata.");
  console.log("Per rimuoverli:  npm run seed -- --clear");
}

main().catch((e) => { console.error(e); process.exit(1); });
