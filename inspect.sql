-- ============================================================================
-- inspect.sql — read-only queries to explore the salon database from the
-- Supabase SQL Editor. Highlight one block and press "Run" (Ctrl/Cmd+Enter).
-- All timestamps are UTC; we convert to Europe/Rome for readability.
-- These are all SELECTs — safe to run anytime. (Avoid DELETE/UPDATE here.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Row counts across every table (quick health check)
-- ---------------------------------------------------------------------------
select 'appointments' t, count(*) from appointments
union all select 'clients', count(*) from clients
union all select 'conversations', count(*) from conversations
union all select 'messages', count(*) from messages
union all select 'services', count(*) from services
union all select 'stylists', count(*) from stylists
union all select 'products', count(*) from products
union all select 'sales', count(*) from sales
union all select 'color_sessions', count(*) from color_sessions
union all select 'stylist_hours', count(*) from stylist_hours
union all select 'stylist_time_off', count(*) from stylist_time_off
union all select 'waitlist', count(*) from waitlist
order by 1;

-- ---------------------------------------------------------------------------
-- 2. Upcoming appointments (next 7 days) in Rome local time, readable
-- ---------------------------------------------------------------------------
select
  to_char(a.starts_at at time zone 'Europe/Rome', 'Dy DD/MM')      as giorno,
  to_char(a.starts_at at time zone 'Europe/Rome', 'HH24:MI')       as ora,
  to_char(a.ends_at   at time zone 'Europe/Rome', 'HH24:MI')       as fine,
  sv.name  as servizio,
  st.name  as parrucchiere,
  coalesce(a.customer_name, a.customer_phone) as cliente,
  a.status, a.source
from appointments a
left join services sv on sv.id = a.service_id
left join stylists st on st.id = a.stylist_id
where a.starts_at >= now()
  and a.starts_at <  now() + interval '7 days'
  and a.status in ('booked','completed')
order by a.starts_at, st.name;

-- ---------------------------------------------------------------------------
-- 3. How full is each operator, per day (useful for testing availability)
-- ---------------------------------------------------------------------------
select
  (a.starts_at at time zone 'Europe/Rome')::date as giorno,
  st.name as parrucchiere,
  count(*)                                     as appuntamenti,
  min(to_char(a.starts_at at time zone 'Europe/Rome','HH24:MI')) as primo,
  max(to_char(a.starts_at at time zone 'Europe/Rome','HH24:MI')) as ultimo
from appointments a
join stylists st on st.id = a.stylist_id
where a.status in ('booked','completed')
  and a.starts_at >= now()
group by 1, 2
order by 1, 2;

-- ---------------------------------------------------------------------------
-- 4. A single day, hour-by-hour per operator (change the date!)
-- ---------------------------------------------------------------------------
select
  to_char(a.starts_at at time zone 'Europe/Rome','HH24:MI') as ora,
  st.name as parrucchiere,
  sv.name as servizio,
  coalesce(a.customer_name, a.customer_phone) as cliente,
  a.status
from appointments a
left join services sv on sv.id = a.service_id
left join stylists st on st.id = a.stylist_id
where (a.starts_at at time zone 'Europe/Rome')::date = date '2026-07-08'   -- <-- change
order by a.starts_at, st.name;

-- ---------------------------------------------------------------------------
-- 5. Seed data currently in the DB (the test script tags rows "[seed]")
-- ---------------------------------------------------------------------------
select count(*) as seed_appointments from appointments where notes = '[seed]';
-- to remove them:  delete from appointments where notes = '[seed]';

-- ---------------------------------------------------------------------------
-- 6. Business hours (salon) and per-operator hours / time off
-- ---------------------------------------------------------------------------
select day_of_week, is_closed, open_time, close_time, break_start, break_end
from business_hours order by day_of_week;

select st.name, sh.day_of_week, sh.is_working, sh.open_time, sh.close_time
from stylist_hours sh join stylists st on st.id = sh.stylist_id
order by st.name, sh.day_of_week;

select st.name,
  t.starts_at at time zone 'Europe/Rome' as dal,
  t.ends_at   at time zone 'Europe/Rome' as al, t.reason
from stylist_time_off t join stylists st on st.id = t.stylist_id
order by t.starts_at;

-- ---------------------------------------------------------------------------
-- 7. Clients — priority, loyalty points, total spend, last visit
-- ---------------------------------------------------------------------------
select
  c.name, c.phone, c.priority, c.loyalty_points,
  coalesce(sum(s.total_cents),0)/100.0 as spesa_eur,
  max(a.starts_at at time zone 'Europe/Rome')::date as ultima_visita
from clients c
left join sales s        on s.client_id = c.id
left join appointments a on a.customer_phone = c.phone and a.status = 'completed'
group by c.id
order by c.priority desc, c.loyalty_points desc
limit 50;

-- ---------------------------------------------------------------------------
-- 8. Magazzino — prodotti sotto scorta minima
-- ---------------------------------------------------------------------------
select name, brand, category, stock_qty, low_stock_threshold, price_cents/100.0 as prezzo_eur
from products
where active and stock_qty <= low_stock_threshold
order by stock_qty;

-- ---------------------------------------------------------------------------
-- 9. Incasso ultimi 30 giorni (dalle vendite registrate)
-- ---------------------------------------------------------------------------
select
  count(*) as vendite,
  sum(total_cents)/100.0 as incasso_eur,
  round(avg(total_cents)/100.0, 2) as ticket_medio_eur
from sales
where created_at >= now() - interval '30 days';

-- ---------------------------------------------------------------------------
-- 10. Ultime conversazioni WhatsApp (con ultimo messaggio)
-- ---------------------------------------------------------------------------
select
  coalesce(co.name, co.phone) as cliente, co.mode,
  co.updated_at at time zone 'Europe/Rome' as ultimo_aggiornamento
from conversations co
order by co.updated_at desc
limit 20;
