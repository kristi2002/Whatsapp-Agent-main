-- Migration 4 — Turni per operatore (per-stylist hours + ferie/assenze). Idempotent.
create table if not exists stylist_hours (
  stylist_id uuid references stylists(id) on delete cascade,
  day_of_week int check (day_of_week between 0 and 6),
  is_working boolean not null default true,
  open_time time, close_time time, break_start time, break_end time,
  primary key (stylist_id, day_of_week)
);
create table if not exists stylist_time_off (
  id uuid default gen_random_uuid() primary key,
  stylist_id uuid references stylists(id) on delete cascade not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text,
  created_at timestamptz default now(),
  check (ends_at > starts_at)
);
create index if not exists idx_time_off_stylist on stylist_time_off(stylist_id, starts_at);
