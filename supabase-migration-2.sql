-- ============================================================================
-- Migration 2 — Magazzino (products), Clienti (clients), Vendite (sales).
-- Run once in the Supabase SQL Editor. Safe to re-run (idempotent).
-- ============================================================================

-- Products (magazzino) — retail beauty products.
create table if not exists products (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  brand text,
  category text,
  sku text,
  price_cents int,
  cost_cents int,
  stock_qty int not null default 0,
  low_stock_threshold int not null default 3,
  active boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_products_name on products(name);

-- Clients — one row per customer (keyed by phone). Auto-populated from
-- appointments via the trigger below, and editable by staff.
create table if not exists clients (
  id uuid default gen_random_uuid() primary key,
  phone text unique not null,
  name text,
  email text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Sales / receipts — a sale groups line items (services + products) for a client.
create table if not exists sales (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete set null,
  customer_phone text,
  appointment_id uuid references appointments(id) on delete set null,
  total_cents int not null default 0,
  created_at timestamptz default now()
);
create index if not exists idx_sales_client on sales(client_id);
create index if not exists idx_sales_phone on sales(customer_phone);

create table if not exists sale_items (
  id uuid default gen_random_uuid() primary key,
  sale_id uuid references sales(id) on delete cascade not null,
  kind text not null check (kind in ('service', 'product')),
  service_id uuid references services(id) on delete set null,
  product_id uuid references products(id) on delete set null,
  description text not null,
  qty int not null default 1,
  unit_price_cents int not null default 0
);
create index if not exists idx_sale_items_sale on sale_items(sale_id);

-- Auto-upsert a client whenever an appointment is created (WhatsApp or gestionale).
create or replace function upsert_client_from_appt() returns trigger as $$
begin
  if new.customer_phone is not null then
    insert into clients (phone, name)
    values (new.customer_phone, new.customer_name)
    on conflict (phone) do update
      set name = coalesce(clients.name, excluded.name),
          updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_appt_client on appointments;
create trigger trg_appt_client after insert on appointments
  for each row execute function upsert_client_from_appt();

-- Backfill clients from existing appointments.
insert into clients (phone, name)
select customer_phone, max(customer_name)
from appointments
where customer_phone is not null
group by customer_phone
on conflict (phone) do nothing;

-- Realtime (optional, mirrors the rest of the schema).
do $$ begin
  begin alter publication supabase_realtime add table products; exception when others then null; end;
  begin alter publication supabase_realtime add table clients; exception when others then null; end;
  begin alter publication supabase_realtime add table sales; exception when others then null; end;
end $$;

-- Seed a few sample products (edit/delete freely).
insert into products (name, brand, category, price_cents, cost_cents, stock_qty) values
  ('Shampoo idratante 250ml', 'Kerastase', 'Cura capelli', 2400, 1200, 12),
  ('Maschera ristrutturante 200ml', 'Olaplex', 'Cura capelli', 3200, 1700, 8),
  ('Olio protettivo 100ml', 'Moroccanoil', 'Styling', 2800, 1500, 5),
  ('Fondotinta luminoso', 'MAC', 'Make-up', 3500, 1900, 6),
  ('Rossetto matte', 'MAC', 'Make-up', 2200, 1100, 10)
on conflict do nothing;
