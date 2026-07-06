-- ============================================================================
-- Migration 7 — Promemoria appuntamenti + lista d'attesa. Idempotent.
-- ============================================================================

-- Segna quando è stato inviato il promemoria (evita doppi invii).
alter table appointments add column if not exists reminder_sent_at timestamptz;

-- Lista d'attesa: clienti che vogliono un posto se se ne libera uno.
create table if not exists waitlist (
  id uuid default gen_random_uuid() primary key,
  name text,
  phone text not null,
  service_id uuid references services(id) on delete set null,
  preferred_date date,
  notes text,
  status text not null default 'attesa' check (status in ('attesa', 'contattato', 'chiuso')),
  created_at timestamptz default now()
);
create index if not exists idx_waitlist_status on waitlist(status, created_at);
