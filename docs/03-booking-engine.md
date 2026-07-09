# 03 — Booking Engine: Availability, Time & Rules

How the app turns "vorrei un taglio venerdì pomeriggio" into a real, conflict-free
appointment. This layer is shared by the **AI agent** (via tools), the **public
booking widget** (`/api/public/*`), and the **gestionale** (calendar/appointments).

Files: `src/lib/booking.ts` (DB access), `src/lib/availability.ts` (pure engine),
`src/lib/timezone.ts` (DST-safe conversions), `src/lib/salon-config.ts` (rules).

---

## 1. Booking rules (`salon-config.ts → BOOKING`)

| Rule | Value | Meaning |
|---|---|---|
| `slotGranularityMin` | **15** | Start times align to a 15-minute grid. |
| `minLeadTimeMin` | **60** | Nothing can be booked sooner than 60 min from now. |
| `maxAdvanceDays` | **60** | Customers can book at most 60 days ahead. |
| `maxSlotsReturned` | **6** | Max distinct times offered per availability answer (keeps WhatsApp replies short). |

Timezone is `Europe/Rome`, locale `it-IT` (from `SALON`).

---

## 2. Time model — UTC storage, local hours (DST-safe)

- **All instants** (`appointments.starts_at/ends_at`, time-off) are stored as
  `timestamptz` in **UTC**.
- **Business hours** (`business_hours`, `stylist_hours`) are stored as **local
  wall-clock time** for `Europe/Rome`.
- The engine converts local wall-clock → UTC for every comparison, so **DST is
  handled correctly**. Verified: 09:00 Rome = **07:00Z in July**, **08:00Z in
  January**.

`timezone.ts` provides (all built on `Intl`, zero dependencies):
- `zonedWallTimeToUtc(y,m,d,hh,mm,tz)` — local wall time → UTC `Date`, with a
  two-pass correction so times near DST boundaries resolve correctly.
- `getZonedParts(date, tz)` — the y/m/d/h/min/weekday as seen in the tz.
- `timeToMinutes("HH:MM")`, `formatZoned(...)`, `formatTime(...)`.

---

## 3. The availability engine (`availability.ts` — pure, no I/O)

`computeAvailability(args)` returns one `Slot` per **(time, stylist)** that is free
for the **full** service duration. Algorithm:

1. **Working intervals** from the salon hours for that weekday, **with the midday
   break removed** (`break_start`/`break_end`, "pausa pranzo") → e.g.
   `[[09:00,13:00],[14:00,19:00]]`.
2. **Per-stylist hours:** if a stylist has a `stylist_hours` row, intersect the
   salon intervals with theirs; a stylist marked `is_working = false` (or a null
   row) is **skipped** that day.
3. **Walk the grid:** step by `slotGranularityMin` (15). A start `m` is valid only
   if `m + durationMin ≤ intervalEnd` (the whole service fits before close).
4. **Lead time:** discard any start earlier than `now + minLeadTimeMin`.
5. **Conflict check:** discard a start whose `[start, end)` overlaps any **busy
   interval** for that stylist. Busy = active appointments **plus** time-off
   blocks.
6. `groupSlotsByTime()` collapses per-stylist slots into distinct start times,
   each listing which stylists are free — ideal for offering concise options.

All comparisons are done on absolute **UTC milliseconds**.

---

## 4. `checkAvailability` (booking.ts) — orchestration

Wraps the pure engine with all the DB reads and validation:

1. **Match the service** by name (fuzzy: id → exact → substring either direction).
   Unknown service → returns the service list.
2. **Validate the date window:** not in the past; not beyond `maxAdvanceDays`.
3. **Capability filter** via `stylist_services`: only stylists who can perform the
   service are considered. **If a service has no rows in `stylist_services`, every
   active stylist is treated as capable.** If a *specific* stylist was requested
   but can't do the service, it says so and names who can.
4. **Load the weekday's `business_hours`.** Closed if the row is missing,
   `is_closed`, or lacks open/close times → returns a friendly "chiuso" message.
5. In **parallel**, load: overlapping `appointments` (`booked` + `completed`),
   per-stylist `stylist_hours`, and `stylist_time_off` for the day.
6. Run `computeAvailability`, then produce **two lists**:
   - **`options`** — a curated sample: prefer round `:00`/`:30` times, spread
     across the whole day (`spreadEven`), capped at `maxSlotsReturned`.
   - **`allSlots` / `allFreeTimes`** — **every** genuinely-free start time (with
     exact `iso`). Used for exact-time questions and booking validation.

> **Why two lists matter:** the AI suggests a few times from `options`, but if the
> customer asks for a specific time it checks `allFreeTimes` — so it never wrongly
> claims 16:00 is taken just because it wasn't among the suggested few.

---

## 5. `bookAppointment` — creating the row

1. Match service, parse `startIso`, enforce the **60-min lead time**.
2. **Re-check availability at that exact slot** (guards against the slot being
   taken between suggestion and booking). Validate against `allSlots` (the full
   set), not the sampled display list.
3. If the exact time isn't free → return the **nearest free times** as
   `alternatives` (the AI offers these instead of a bare "unavailable").
4. **Resolve the stylist:** the requested one, else the first free at that slot.
5. `INSERT` into `appointments` with `source: 'whatsapp'`, `status: 'booked'`.
6. **Database is the final guard** (see §7). A `23P01` (exclusion violation) →
   clean "quell'orario è appena stato prenotato — scegline un altro".

## 6. `rescheduleAppointment` & `cancelAppointment`

- **Reschedule** locates the appointment (by `appointmentId`, or the caller's
  single upcoming booking), validates the new slot **excluding this appointment's
  own current time** (so nudging the same booking is allowed), then **UPDATEs the
  same row** — keeping the original stylist unless a new one is requested. Never
  creates a duplicate. Optional service change recomputes the duration/end.
- **Cancel** verifies ownership by phone and sets `status = 'cancelled'` (soft —
  the row remains for history). If the caller has multiple bookings and gives no
  id, it asks which one.
- **`getAppointmentsForPhone`** lists the caller's future `booked` appointments
  (with the appointment id, so the AI can target reschedule/cancel).

---

## 7. Double-booking is impossible at the database level

`appointments` has a Postgres **exclusion constraint** (needs the `btree_gist`
extension):

```sql
constraint no_stylist_overlap exclude using gist (
  stylist_id   with =,
  tstzrange(starts_at, ends_at) with &&
) where (status in ('booked','completed'));
```

Two active appointments for the **same stylist** whose time ranges **overlap**
cannot both exist — even under a race between the in-app availability check and the
insert. The app's re-check gives a *clean message*; the constraint is the
*hard guarantee*.

---

## 8. Other booking-adjacent behaviour

- **Auto stock decrement:** when an appointment transitions to `completed` (first
  time only), products linked to the service via `service_products` are decremented
  and a `stock_movements` row is logged (handled in `PATCH /api/appointments/[id]`).
- **Auto client creation:** a DB trigger (`upsert_client_from_appt`) upserts a
  `clients` row from every new appointment's phone/name.
- **Online-booking abuse guard:** `recentOnlineBookingCount()` caps self-service
  bookings at **6 per phone per 24 h** (`POST /api/public/book` → `429`).

---

## 9. Appointment reminders

`GET /api/cron/reminders?key=CRON_SECRET` (not automatic — schedule it):
- Selects `booked` appointments starting in a window (default **20–28 h** ahead,
  overridable via `fromH`/`toH`) with `reminder_sent_at IS NULL`.
- Sends a WhatsApp reminder and stamps `reminder_sent_at` (prevents duplicates).
- Guarded by `CRON_SECRET` → `401` if unset or mismatched.
- **Outside Meta's 24-hour customer-service window this must use an approved
  message template**, not plain text. Swap the send call once your template is
  approved. See [08-deployment.md](08-deployment.md).

---

## 10. Test coverage

The engine is heavily unit-tested (`availability.test.ts`, `timezone.test.ts`,
`booking.test.ts`): open/closed days, pausa pranzo, busy-overlap, min-lead-time,
fit-before-close, multi-stylist, DST summer/winter, grouping, and booking
validation branches. See [09-development-testing.md](09-development-testing.md).
