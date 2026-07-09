-- ============================================================================
-- Migration 9 — Enable Row-Level Security (RLS) on every table. Idempotent.
--
-- WHY: the dashboard's live chat (/chat) creates a browser Supabase client with
-- the PUBLIC anon key (NEXT_PUBLIC_SUPABASE_ANON_KEY) for Realtime. With RLS
-- OFF, that key can read/write EVERY table directly (PostgREST + Realtime),
-- completely bypassing the Next.js password gate in src/proxy.ts. Anyone who
-- opens browser dev-tools can lift the anon key and read the whole database.
--
-- WHAT THIS DOES: turns RLS ON with NO permissive policies, so the anon (and
-- authenticated) roles get ZERO access. The Next.js server uses the
-- SERVICE_ROLE key, which BYPASSES RLS — so every /api/* route keeps working
-- unchanged. Only the browser's direct anon access is cut off.
--
-- SIDE EFFECT: browser Realtime via the anon key stops delivering row changes.
-- The /chat page has a polling fallback (added alongside this migration), so it
-- still updates — just by short-interval refetch instead of push. If you later
-- want true push again, mint a short-lived Supabase JWT for logged-in staff and
-- add SELECT policies for the `authenticated` role; do NOT re-open `anon`.
--
-- Run this in the Supabase SQL Editor. Safe to re-run.
-- ============================================================================

do $$
declare
  t text;
  tables text[] := array[
    'conversations', 'messages',
    'stylists', 'services', 'stylist_services', 'business_hours', 'appointments',
    'stylist_hours', 'stylist_time_off',
    'products', 'stock_movements', 'service_products',
    'clients', 'loyalty_transactions',
    'color_sessions', 'color_session_items',
    'sales', 'sale_items',
    'waitlist'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('alter table public.%I enable row level security;', t);
      execute format('alter table public.%I force row level security;', t);
    end if;
  end loop;
end $$;

-- No policies are created on purpose: deny-by-default for anon/authenticated.
-- The service_role key (server-side only) bypasses RLS and is unaffected.
