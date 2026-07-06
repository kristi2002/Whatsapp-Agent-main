-- ============================================================================
-- Migration 6 — Movimenti di magazzino (carico/scarico) + scarico automatico
-- legato al servizio. Idempotent.
-- ============================================================================

-- Ogni carico/scarico registrato (storico + tracciabilità).
create table if not exists stock_movements (
  id uuid default gen_random_uuid() primary key,
  product_id uuid references products(id) on delete cascade not null,
  delta int not null,          -- +carico / -scarico
  reason text,                 -- carico, scarico, vendita, servizio, rettifica...
  ref text,                    -- riferimento (es. id appuntamento)
  created_at timestamptz default now()
);
create index if not exists idx_stock_mov_product on stock_movements(product_id, created_at desc);

-- Prodotti consumati da un servizio (scarico automatico alla chiusura).
create table if not exists service_products (
  service_id uuid references services(id) on delete cascade,
  product_id uuid references products(id) on delete cascade,
  qty int not null default 1,
  primary key (service_id, product_id)
);
