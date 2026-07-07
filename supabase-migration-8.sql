-- ============================================================================
-- Migration 8 — Clienti prioritari + programma fedeltà. Idempotent.
-- ============================================================================

-- Cliente prioritario (VIP).
alter table clients add column if not exists priority boolean not null default false;

-- Saldo punti fedeltà (denormalizzato per lettura veloce).
alter table clients add column if not exists loyalty_points int not null default 0;

-- Storico movimenti punti.
create table if not exists loyalty_transactions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  delta int not null,
  reason text,
  created_at timestamptz default now()
);
create index if not exists idx_loyalty_client on loyalty_transactions(client_id, created_at desc);
