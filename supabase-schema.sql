-- ============================================================================
-- Salone WhatsApp Agent + Gestionale — shared database schema
-- Run this in the Supabase SQL Editor (or via `psql`) on the SAME database
-- your React gestionale uses. Both apps read/write these tables.
-- Timezone convention: all timestamps are stored as timestamptz (UTC).
-- Business hours are stored as local wall-clock time (Europe/Rome).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Conversations & messages (WhatsApp side)
-- ---------------------------------------------------------------------------
create table if not exists conversations (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  mode text not null default 'agent' check (mode in ('agent', 'human')),
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid default gen_random_uuid() primary key,
  conversation_id uuid references conversations(id) on delete cascade not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  whatsapp_msg_id text unique,
  created_at timestamptz default now()
);

create index if not exists idx_messages_conversation on messages(conversation_id);
create index if not exists idx_conversations_updated on conversations(updated_at desc);

-- ---------------------------------------------------------------------------
-- Stylists (parrucchieri) — shared with the gestionale
-- ---------------------------------------------------------------------------
create table if not exists stylists (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Services (servizi) — name, duration and price. Prices in euro cents.
-- ---------------------------------------------------------------------------
create table if not exists services (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  duration_min int not null check (duration_min > 0),
  price_cents int,
  category text,                         -- taglio, piega, colore, trattamento, trucco, extension
  active boolean not null default true,
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- Which stylist can perform which service (many-to-many). If a service has NO
-- rows here, the app treats every active stylist as capable of it.
-- ---------------------------------------------------------------------------
create table if not exists stylist_services (
  stylist_id uuid references stylists(id) on delete cascade,
  service_id uuid references services(id) on delete cascade,
  primary key (stylist_id, service_id)
);

-- ---------------------------------------------------------------------------
-- Business hours — one row per weekday. day_of_week: 0 = Sunday ... 6 = Saturday
-- open_time / close_time are local wall-clock (Europe/Rome), null when closed.
-- Optional midday break (e.g. pausa pranzo) via break_start / break_end.
-- ---------------------------------------------------------------------------
create table if not exists business_hours (
  day_of_week int primary key check (day_of_week between 0 and 6),
  is_closed boolean not null default false,
  open_time time,
  close_time time,
  break_start time,
  break_end time
);

-- ---------------------------------------------------------------------------
-- Appointments (appuntamenti) — the single source of truth shared by the
-- WhatsApp agent AND the gestionale. A booking made by either shows in both.
-- starts_at / ends_at are timestamptz (UTC). status drives the calendar.
-- ---------------------------------------------------------------------------
create table if not exists appointments (
  id uuid default gen_random_uuid() primary key,
  stylist_id uuid references stylists(id) on delete restrict not null,
  service_id uuid references services(id) on delete restrict not null,
  conversation_id uuid references conversations(id) on delete set null,
  customer_name text,
  customer_phone text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked'
    check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  source text not null default 'whatsapp' check (source in ('whatsapp', 'gestionale', 'phone')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (ends_at > starts_at)
);

create index if not exists idx_appt_stylist_time on appointments(stylist_id, starts_at);
create index if not exists idx_appt_time on appointments(starts_at);
create index if not exists idx_appt_phone on appointments(customer_phone);

-- Prevent two active appointments for the same stylist from overlapping.
-- Requires the btree_gist extension for the mixed equality + range constraint.
create extension if not exists btree_gist;
alter table appointments
  drop constraint if exists no_stylist_overlap;
alter table appointments
  add constraint no_stylist_overlap
  exclude using gist (
    stylist_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'completed'));

-- ---------------------------------------------------------------------------
-- Realtime for the dashboard
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table messages;
alter publication supabase_realtime add table conversations;
alter publication supabase_realtime add table appointments;

-- ============================================================================
-- SEED DATA — Max&Tony Nazionale (migrated from the old n8n seed).
-- Salone donna + make-up, Piazza Nazionale 92, Napoli. Verify prices are current.
-- Hours from the old business_info: Mar–Sab 09:00–19:00, chiuso Dom/Lun.
-- ============================================================================
insert into business_hours (day_of_week, is_closed, open_time, close_time, break_start, break_end) values
  (0, true,  null,    null,    null, null),   -- Domenica: chiuso
  (1, true,  null,    null,    null, null),   -- Lunedì: chiuso
  (2, false, '09:00', '19:00', null, null),   -- Martedì
  (3, false, '09:00', '19:00', null, null),   -- Mercoledì
  (4, false, '09:00', '19:00', null, null),   -- Giovedì
  (5, false, '09:00', '19:00', null, null),   -- Venerdì
  (6, false, '09:00', '19:00', null, null)    -- Sabato
on conflict (day_of_week) do nothing;

insert into stylists (name) values
  ('Genny Pinto'),
  ('Tony Pinto'),
  ('Valeria Esposito'),
  ('Claudia Milone')
on conflict do nothing;

-- Prices in euro cents. duration_min drives slot length. category drives which
-- stylist can perform it (see stylist_services below).
insert into services (name, duration_min, price_cents, category) values
  ('Taglio donna',                 45,  2500, 'taglio'),
  ('Piega',                        40,  2000, 'piega'),
  ('Taglio & Piega',               60,  4000, 'taglio'),
  ('Shampoo & Piega',              35,  1800, 'piega'),
  ('Colore / Tinta',               90,  4500, 'colore'),
  ('Colore completo',             120,  6000, 'colore'),
  ('Colpi di sole (Méches)',      150,  7000, 'colore'),
  ('Balayage',                    180, 12000, 'colore'),
  ('Trattamento ristrutturante',   30,  2500, 'trattamento'),
  ('Trattamento alla cheratina',  180, 15000, 'trattamento'),
  ('Acconciatura',                 60,  5000, 'piega'),
  ('Trucco',                       60,  4000, 'trucco'),
  ('Trucco sposa',                 90, 12000, 'trucco'),
  ('Extension capelli',           180, 25000, 'extension')
on conflict do nothing;

-- Who does what — migrated from the old n8n staff_services mapping:
--   Genny Pinto: taglio, piega, colore, trattamento, extension (tutto tranne trucco)
--   Tony Pinto / Valeria Esposito: taglio, piega, colore, trattamento
--   Claudia Milone: solo trucco (make-up artist)
insert into stylist_services (stylist_id, service_id)
select st.id, s.id from stylists st, services s
where (st.name = 'Genny Pinto'      and s.category in ('taglio','piega','colore','trattamento','extension'))
   or (st.name = 'Tony Pinto'       and s.category in ('taglio','piega','colore','trattamento'))
   or (st.name = 'Valeria Esposito' and s.category in ('taglio','piega','colore','trattamento'))
   or (st.name = 'Claudia Milone'   and s.category = 'trucco')
on conflict do nothing;
