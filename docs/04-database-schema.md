# 04 — Database Schema

One shared Supabase/Postgres database backs both the WhatsApp agent and the
gestionale. Convention: **all timestamps are `timestamptz` (UTC)**; **business
hours are local wall-clock (`Europe/Rome`)**.

## How the schema is applied
- **`supabase-schema.sql`** — base schema + seed (services, stylists, hours). Run
  it first in the Supabase SQL Editor. Enables `btree_gist` and Realtime.
- **`supabase-migration-2.sql` … `-8.sql`** — run **in order**. Each is idempotent
  (`create ... if not exists`, `add column if not exists`), safe to re-run.
- `inspect.sql` is an ad-hoc inspection helper (not part of the migration chain).

---

## 1. Tables by domain

| Domain | Tables |
|---|---|
| **WhatsApp** | `conversations`, `messages` |
| **Booking core** | `stylists`, `services`, `stylist_services`, `business_hours`, `appointments`, `stylist_hours`, `stylist_time_off` |
| **Clients / CRM** | `clients`, `loyalty_transactions` |
| **Color archive (ricettario)** | `color_sessions`, `color_session_items` |
| **Inventory (magazzino)** | `products`, `stock_movements`, `service_products` |
| **Sales** | `sales`, `sale_items` |
| **Waitlist** | `waitlist` |

---

## 2. Base schema (`supabase-schema.sql`)

### conversations
WhatsApp threads, one per phone number.
`id` · `phone` (unique) · `name` · `mode` `'agent'|'human'` (default `agent`) ·
`updated_at` · `created_at`.

### messages
One row per WhatsApp message.
`id` · `conversation_id` → conversations (cascade) · `role` `'user'|'assistant'` ·
`content` · `whatsapp_msg_id` (unique — **dedup key** for Meta retries) ·
`created_at`.

### stylists
`id` · `name` · `active` · `created_at`. *(Seed: Genny Pinto, Tony Pinto, Valeria
Esposito, Claudia Milone.)*

### services
`id` · `name` · `duration_min` (>0) · `price_cents` (euro cents, nullable) ·
`category` (taglio/piega/colore/trattamento/trucco/extension) · `active` ·
`created_at`.

### stylist_services (many-to-many)
`stylist_id` + `service_id` (composite PK). Who can perform what. **A service with
no rows here → every active stylist is considered capable.**

### business_hours
One row per weekday. `day_of_week` (PK, 0=Sun…6=Sat) · `is_closed` · `open_time` ·
`close_time` · `break_start` · `break_end` (local time; null when closed).
*(Seed: Mar–Sab 09:00–19:00, chiuso Dom/Lun.)*

### appointments — the single source of truth
`id` · `stylist_id` → stylists (restrict) · `service_id` → services (restrict) ·
`conversation_id` → conversations (set null) · `customer_name` · `customer_phone` ·
`starts_at` · `ends_at` (UTC; `ends_at > starts_at`) · `status`
`'booked'|'completed'|'cancelled'|'no_show'` · `source`
`'whatsapp'|'gestionale'|'phone'|'online'` (`'online'` added in M5) · `notes` ·
`reminder_sent_at` (added M7) · `created_at` · `updated_at`.

Indexes on `(stylist_id, starts_at)`, `(starts_at)`, `(customer_phone)`.

**Exclusion constraint `no_stylist_overlap`** (via `btree_gist`): no two active
(`booked`/`completed`) appointments for the same stylist may overlap. This is the
hard anti-double-booking guarantee (see [03](03-booking-engine.md) §7).

**Realtime** is enabled for `messages`, `conversations`, `appointments` (and, in
later migrations, `products`, `clients`, `sales`, `color_sessions`).

---

## 3. Migration 2 — Inventory, Clients, Sales

### products (magazzino)
`id` · `name` · `brand` · `category` · `sku` · `price_cents` · `cost_cents` ·
`stock_qty` (default 0) · `low_stock_threshold` (default 3) · `active` ·
`created_at` · `updated_at`. *(Seeded with 5 sample products.)*

### clients (CRM master — keyed by phone)
`id` · `phone` (unique) · `name` · `email` · `notes` · `created_at` · `updated_at`.
Extended by later migrations (see below).

### sales / sale_items (receipts)
- **sales:** `id` · `client_id` → clients (set null) · `customer_phone` ·
  `appointment_id` → appointments (set null) · `total_cents` · `created_at`.
- **sale_items:** `id` · `sale_id` → sales (cascade) · `kind` `'service'|'product'`
  · `service_id` · `product_id` · `description` · `qty` · `unit_price_cents`.

### Trigger `upsert_client_from_appt()`
`AFTER INSERT ON appointments` → upserts a `clients` row from
`customer_phone`/`customer_name` (keeps an existing name). Also **backfills**
clients from existing appointments on migration.

---

## 4. Migration 3 — Color archive & clinical CRM

**New `clients` columns:** `allergies`, `patch_test_date`, `patch_test_result`,
`birthdate`.

Supersedes any earlier flat `color_cards` table (dropped).

### color_sessions (one row per color treatment)
`id` · `client_id` → clients (cascade) · `appointment_id` (set null) · `stylist_id`
(set null) · `date` · `service_type` (ritocco radici, colore completo, balayage,
decolorazione, toner) · `base_level` (1–10) · `white_pct` · `hair_state`
(naturale/colorato/decolorato) · `technique` (radici/lunghezze/foil/mano libera) ·
`processing_min` · `result` · `notes` · `before_photo_url` · `after_photo_url` ·
`created_at`.

### color_session_items (the formula, as structured components — not free text)
`id` · `session_id` → color_sessions (cascade) · `role`
`'colore'|'ossigeno'|'additivo'` · `brand` · `line` · `tone` (e.g. `7.3`, `8.11`) ·
`quantity` (grams/ml) · `volumes` (peroxide 10/20/30/40) · `product_id` → products
(set null; magazzino link) · `sort`.

Also creates a public **`photos`** storage bucket (self-hosted Supabase).

---

## 5. Migration 4 — Per-stylist hours & time off

- **stylist_hours:** `stylist_id` + `day_of_week` (composite PK) · `is_working` ·
  `open_time` · `close_time` · `break_start` · `break_end`. Overrides the salon
  `business_hours` per stylist.
- **stylist_time_off:** `id` · `stylist_id` (cascade) · `starts_at` · `ends_at`
  (UTC; `ends_at > starts_at`) · `reason` · `created_at`. Blocks the stylist like a
  busy interval in the availability engine (ferie/assenze).

## 6. Migration 5 — Online booking source
Extends `appointments.source` check to include **`'online'`** (self-service widget).

## 7. Migration 6 — Stock movements & consumables

- **stock_movements:** `id` · `product_id` (cascade) · `delta` (+carico/−scarico) ·
  `reason` (carico/scarico/vendita/servizio/rettifica) · `ref` (e.g. appointment
  id) · `created_at`. Immutable audit log.
- **service_products:** `service_id` + `product_id` (composite PK) · `qty`. Which
  consumables a service depletes → **auto-scarico** when an appointment is marked
  `completed`.

## 8. Migration 7 — Reminders & waitlist

- **`appointments.reminder_sent_at`** column (prevents duplicate reminders).
- **waitlist:** `id` · `name` · `phone` · `service_id` (set null) · `preferred_date`
  · `notes` · `status` `'attesa'|'contattato'|'chiuso'` · `created_at`.

## 9. Migration 8 — Loyalty & VIP

- **New `clients` columns:** `priority` (VIP flag, default false), `loyalty_points`
  (denormalized balance, default 0).
- **loyalty_transactions:** `id` · `client_id` (cascade) · `delta` · `reason` ·
  `created_at`. Immutable ledger. **1 point per euro spent** is awarded in
  `POST /api/sales`. Tiers (`src/lib/loyalty.ts`): Bronzo 0–99 · Argento 100–299 ·
  Oro 300–599 · Platino 600+.

---

## 10. Entity relationships (summary)

```
conversations 1──* messages
conversations 1──* appointments (conversation_id, nullable)

stylists 1──* appointments        services 1──* appointments
stylists *──* services (stylist_services)
stylists 1──* stylist_hours       stylists 1──* stylist_time_off
business_hours (one row per weekday)

clients 1──* appointments (by phone) ─ via trigger upsert
clients 1──* sales 1──* sale_items
clients 1──* color_sessions 1──* color_session_items
clients 1──* loyalty_transactions

products *──* services (service_products)   products 1──* stock_movements
products 1──* color_session_items (product_id)   products 1──* sale_items

waitlist * ── services
```

## 11. Key invariants & automations
1. **No stylist overlap** — enforced by the `no_stylist_overlap` exclusion constraint.
2. **Auto client** — trigger upserts `clients` from every new appointment.
3. **Auto stock decrement** — appointment → `completed` scarichi via `service_products`.
4. **Loyalty earn** — `POST /api/sales` awards `floor(total_cents/100)` points.
5. **Reminder idempotency** — `reminder_sent_at` gates repeat sends.
6. **Online abuse guard** — 6 bookings/phone/day (`source='online'`).
7. **Message idempotency** — unique `whatsapp_msg_id` drops Meta re-deliveries.
