# 05 — API Reference

All routes live under `src/app/api/`. **Auth:** `src/proxy.ts` protects everything
with the `salon_session` cookie **except** these public paths: `/login`,
`/api/auth/*`, `/api/webhook`, `/api/health`, `/privacy`, `/prenota`,
`/api/public/*`, `/api/cron/*`. Protected routes return `401` without a valid
cookie. Money is in **euro cents**; dates in path/query are local `Europe/Rome`.

---

## Public / infrastructure

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Liveness probe → `{"status":"ok"}`. Used by Coolify + smoke test. |
| GET | `/api/webhook` | Meta webhook verification — echoes `hub.challenge` if `hub.verify_token` matches, else `403`. |
| POST | `/api/webhook` | Inbound WhatsApp messages. Verifies `X-Hub-Signature-256`, returns `200 {status:"received"}` fast, processes in background. See [02](02-agent-logic.md). |
| GET | `/api/cron/reminders?key=CRON_SECRET` | Sends reminders for appointments ~20–28 h out (`fromH`/`toH` override). `401` without the secret. See [03](03-booking-engine.md) §9. |

### Auth
| Method | Route | Body / behaviour |
|---|---|---|
| POST | `/api/auth/login` | `{ password }` → sets signed httpOnly `salon_session` cookie (12 h). Wrong password → 401. |
| POST | `/api/auth/logout` | Clears the session cookie. |

### Public self-service booking (`/prenota` widget)
| Method | Route | Purpose |
|---|---|---|
| GET | `/api/public/setup` | `{ salon:{name,address,phone}, services:[active], stylists:[active] }`. |
| GET | `/api/public/availability?service=&date=YYYY-MM-DD&stylist=` | Free slots via `checkAvailability()` → `{ ok, serviceName, options:[{time,stylist_name,stylist_id}], message }`. |
| POST | `/api/public/book` | `{ service, startIso, stylist?, customerName, customerPhone }` → books with `source='online'`. Guard: **6/phone/day** → `429`. |

---

## WhatsApp conversations (dashboard chat)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/conversations` | All conversations, newest first, each with `last_message`. |
| GET | `/api/conversations/[id]/messages` | Full message history for a conversation. |
| DELETE | `/api/conversations/[id]/messages` | **Svuota chat** — deletes every message in the thread but keeps the conversation row (phone/name/mode preserved). Returns `{ ok: true }`. Used by the "clear chat" button. |
| PATCH | `/api/conversations/[id]` | `{ mode: 'agent'\|'human' }` — flip auto-reply vs. manual. |
| POST | `/api/conversations/[id]/send` | `{ message }` — staff manual reply: sends via Meta, stores as `assistant`, bumps `updated_at`. |

---

## Appointments & calendar

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/appointments?from=YYYY-MM-DD&to=YYYY-MM-DD` | Appointments in range, joined with service + stylist. |
| POST | `/api/appointments` | `{ service_id, stylist_id, date, time, customer_name, customer_phone, notes }` → creates (`source='gestionale'`); computes end from duration; **`409`** on overlap. |
| PATCH | `/api/appointments/[id]` | Update status/notes/stylist/service/date/time. On first `→ completed`, **auto-scarico** of `service_products`. `409` on overlap. |
| DELETE | `/api/appointments/[id]` | Soft-cancel (`status='cancelled'`). |

---

## Clients & loyalty

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/clients` (`?phone=` optional) | List clients (priority DESC, name ASC) or single by phone. |
| POST | `/api/clients` | `{ phone, name, email, notes }`. `409` if phone exists. |
| GET | `/api/clients/[id]` | Full profile: client + appointments + sales(+items) + color_sessions(+items) + loyalty_transactions + `totalSpent`. |
| PATCH | `/api/clients/[id]` | Update profile incl. clinical fields (allergies, patch test, birthdate), `priority`, phone. `409` on phone clash. |
| DELETE | `/api/clients/[id]` | Hard delete. |
| POST | `/api/clients/[id]/loyalty` | `{ delta, reason }` → adjusts points (clamped ≥0), logs a transaction, returns new balance. |

---

## Color archive (ricettario)

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/color-options` | Distinct `{ brands, lines, tones }` for autocomplete (from items + product brands). |
| GET | `/api/color-sessions` | Filterable list (`q, tone, brand, technique, base, service_type, withPhotos`), newest first (≤150), with items + client + stylist. |
| POST | `/api/color-sessions` | Create a session with its `items[]` (formula components). |
| GET | `/api/color-sessions/[id]` | One session with items + stylist. |
| PATCH | `/api/color-sessions/[id]` | Update; if `items[]` given, replaces the whole item list. |
| DELETE | `/api/color-sessions/[id]` | Delete (cascades items). |
| GET | `/api/color-cards` | **Deprecated → `410 Gone`** (superseded by color-sessions). |

---

## Services

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/services` | All services (active + inactive), sorted by name. |
| POST | `/api/services` | `{ name, duration_min, price_cents, category, active }`. |
| PATCH | `/api/services/[id]` | Update fields. |
| DELETE | `/api/services/[id]` | Soft delete (`active=false`). |
| GET | `/api/services/[id]/products` | Consumables `[{product_id, qty}]`. |
| PUT | `/api/services/[id]/products` | `{ items:[{product_id,qty}] }` — replace consumable list. |

---

## Staff (stylists) & scheduling

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/stylists` | All stylists, each with `service_ids[]`. |
| POST | `/api/stylists` | `{ name, active, service_ids[] }`. |
| GET | `/api/stylists/[id]` | One stylist with `service_ids[]`. |
| PATCH | `/api/stylists/[id]` | Update name/active/services (replaces capability list). |
| DELETE | `/api/stylists/[id]` | Soft delete (`active=false`). |
| GET | `/api/stylists/[id]/hours` | The stylist's 7-day `stylist_hours`. |
| PUT | `/api/stylists/[id]/hours` | `{ reset:true }` or `{ rows:[…] }` — set personal weekly hours. |
| GET | `/api/stylists/[id]/timeoff` | Future time-off periods. |
| POST | `/api/stylists/[id]/timeoff` | `{ starts_at, ends_at, reason }` (`ends_at>starts_at`). |
| DELETE | `/api/timeoff/[id]` | Delete a time-off record. |
| GET | `/api/hours` | Salon `business_hours` (7 rows). |
| PATCH | `/api/hours` | Upsert one weekday `{ day_of_week, is_closed, open_time, close_time, break_start, break_end }`. |

---

## Inventory (magazzino) & sales

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/products` | All products, sorted by name. |
| POST | `/api/products` | `{ name, brand, category, sku, price_cents, cost_cents, stock_qty, low_stock_threshold, active }`. |
| GET | `/api/products/[id]` | Product + `consumedBy[]` (services using it). |
| PATCH | `/api/products/[id]` | Update fields. |
| DELETE | `/api/products/[id]` | Soft delete. |
| GET | `/api/products/[id]/movement` | Last 50 `stock_movements`. |
| POST | `/api/products/[id]/movement` | `{ delta, reason }` — carico/scarico; clamps stock ≥0; logs movement. |
| POST | `/api/sales` | `{ client_id?, customer_phone?, appointment_id?, items:[…] }` → creates sale + items, decrements product stock, logs movements, **awards loyalty points**. |

---

## Waitlist

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/waitlist` | Open entries (`status != 'chiuso'`) with service, oldest first. |
| POST | `/api/waitlist` | `{ name, phone, service_id, preferred_date, notes }`. |
| PATCH | `/api/waitlist/[id]` | `{ status, notes }`. |
| DELETE | `/api/waitlist/[id]` | Hard delete. |

---

## Analytics & uploads

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/overview` | Dashboard KPIs: `todayCount`, `upcomingCount`, `activeServices`, `activeStylists`, `conversations`, `today[]`, `week[]` (7-day counts). |
| GET | `/api/stats?from=&to=` | Revenue, appt counts by status, no-show rate, new/returning clients, `byOperator[]`, `byService[]` (top 8), `daily[]`. Defaults to last 30 days. |
| POST | `/api/upload` | multipart `{ file }` → uploads to Supabase `photos` bucket, returns `{ url }`. Max 8 MB. Used for color before/after photos. |

> **Adding a route?** Also add an assertion to `scripts/smoke.sh` where applicable
> and keep this table in sync (per the project's definition of done).
