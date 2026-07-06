-- ============================================================================
-- Migration 3 — CRM cliente + scheda tecnica colore (normalizzata).
-- La scheda colore vive DENTRO la scheda cliente e si aggancia all'appuntamento.
-- La formula NON è testo: è una lista di componenti (tubi + ossigeno + additivi).
-- Run once in the Supabase SQL Editor. Idempotent.
-- ============================================================================

-- Dati clinici a livello CLIENTE (non per scheda).
alter table clients add column if not exists allergies text;
alter table clients add column if not exists patch_test_date date;
alter table clients add column if not exists patch_test_result text;
alter table clients add column if not exists birthdate date;

-- Supersede any earlier flat color_cards table.
drop table if exists color_cards cascade;

-- Master — una riga per seduta di colore.
create table if not exists color_sessions (
  id uuid default gen_random_uuid() primary key,
  client_id uuid references clients(id) on delete cascade not null,
  appointment_id uuid references appointments(id) on delete set null,
  stylist_id uuid references stylists(id) on delete set null,
  date date not null default current_date,
  service_type text,          -- ritocco radici, colore completo, balayage, decolorazione, toner
  base_level int,             -- base naturale 1-10 (diagnosi, ereditata)
  white_pct int,              -- % capelli bianchi
  hair_state text,            -- naturale, colorato, decolorato
  technique text,             -- radici, lunghezze, foil, mano libera
  processing_min int,         -- tempo di posa (minuti)
  result text,                -- com'è venuto + correzioni per la prossima volta
  notes text,
  before_photo_url text,
  after_photo_url text,
  created_at timestamptz default now()
);
create index if not exists idx_color_sessions_client on color_sessions(client_id, date desc);
create index if not exists idx_color_sessions_base on color_sessions(base_level);

-- Righe — i componenti della formula.
create table if not exists color_session_items (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references color_sessions(id) on delete cascade not null,
  role text not null default 'colore' check (role in ('colore', 'ossigeno', 'additivo')),
  brand text,                 -- marca (es. Wella, L'Oréal)
  line text,                  -- linea / gamma
  tone text,                  -- tono (7.3, 8.11...)
  quantity numeric(6,1),      -- grammi / ml
  volumes int,                -- solo ossigeno: 10/20/30/40
  product_id uuid references products(id) on delete set null,  -- aggancio magazzino (scarico futuro)
  sort int not null default 0
);
create index if not exists idx_color_items_session on color_session_items(session_id);
create index if not exists idx_color_items_tone on color_session_items(tone);
create index if not exists idx_color_items_brand on color_session_items(brand);

-- Bucket foto (self-hosted Supabase).
insert into storage.buckets (id, name, public) values ('photos', 'photos', true) on conflict (id) do nothing;

do $$ begin
  begin alter publication supabase_realtime add table color_sessions; exception when others then null; end;
end $$;
