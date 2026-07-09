# 06 — Staff Dashboard (Gestionale)

The gestionale is the Italian-language staff back office: a Next.js App Router SPA
(React 19) behind the shared-password login. It manages everything the salon does —
calendar, clients, color formulas, inventory, sales, loyalty, staff schedules,
statistics — plus a live WhatsApp chat with the agent/human handoff.

Pages live in `src/app/*/page.tsx`; shared UI in `src/components/*`.

---

## 1. Pages

| Route | Italian name | Purpose | Main APIs |
|---|---|---|---|
| `/` | **Panoramica** | KPI overview: appts today, next 7 days, active services/staff; today's list + 7-day bar chart. Auto-refreshes (20 s) + on focus + Realtime. | `GET /api/overview` |
| `/login` | **Accesso** | Password login (no registration). Redirects to `?next` on success. | `POST /api/auth/login` |
| `/calendar` | **Calendario** | Week/day grid of appointment blocks; create/edit/delete; filter by stylist + hours. | `GET/POST/PATCH/DELETE /api/appointments`, `/api/stylists`, `/api/services` |
| `/appuntamenti` | **Appuntamenti** | Tabular appointment list; filter by date range, status, operator, source; paginated (20/page). | `GET /api/appointments`, `/api/stylists` |
| `/attesa` | **Lista d'attesa** | Waitlist: add, mark contattato/chiuso, quick WhatsApp link. | `/api/waitlist`, `/api/services` |
| `/chat` | **Conversazioni** | Live WhatsApp chat; search; per-conversation **agent ↔ human** toggle; manual send. | `/api/conversations*`, `/api/clients` |
| `/clienti` | **Clienti** | Client roster (card grid); search; filter by notes/priority; loyalty tier badges; paginated (12/page). | `GET/POST /api/clients` |
| `/clienti/[id]` | **Dettagli cliente** | Full profile: personal + clinical (allergie, patch test, data nascita), appointment history, sales, color sessions (+photos), loyalty points/history. Create sales, log color sessions, adjust points. | `/api/clients/[id]*`, `/api/sales`, `/api/color-sessions`, `/api/color-options`, `/api/products`, `/api/services`, `/api/stylists` |
| `/ricettario` | **Ricettario** | Color-formula library; search + filter by tone/brand/base/technique/service/photos; card grid with after-photos. | `GET /api/color-sessions`, `/api/color-options` |
| `/fidelity` | **Fedeltà** | Loyalty dashboard: points issued, clients with points, Gold/Platinum counts; ranked client list; tier filter. | `GET /api/clients` |
| `/services` | **Servizi** | Service catalog; create/edit (name, category, duration, price, consumables); active toggle. | `/api/services*`, `/api/products` |
| `/stylists` | **Staff** | Staff roster; create/edit (name + specializations); active toggle; link to detail. | `/api/stylists*`, `/api/services` |
| `/stylists/[id]` | **Dettagli staff** | Personal schedule (turni) vs salon default, time-off (ferie) manager, day's appointments. | `/api/stylists/[id]*` (hours, timeoff), `/api/appointments`, `/api/hours` |
| `/magazzino` | **Magazzino** | Product inventory (card grid); stock/low-stock status; carico/scarico; filter + search. | `/api/products*` (+ movement) |
| `/magazzino/[id]` | **Dettaglio prodotto** | Product specs, consumed-by services, stock in/out form, movement history. | `/api/products/[id]*` (+ movement) |
| `/prenota` | **Prenota online** | **Public** step-by-step booking wizard (service → stylist → date → slot → details). | `/api/public/setup`, `/api/public/availability`, `/api/public/book` |
| `/statistiche` | **Statistiche** | Analytics: revenue, appts, avg ticket, new clients; trend charts (7/30/90 d); top operators/services. | `GET /api/stats` |
| `/hours` | **Orari** | Salon opening-hours editor (7-day: open/closed, times, break). | `GET/PATCH /api/hours` |
| `/privacy` | **Informativa privacy** | **Public** GDPR policy (static; required for Meta Live). | none |

---

## 2. Navigation (`src/components/Sidebar.tsx`)

Sidebar order (icon from `lucide-react`):

1. Panoramica `/` · 2. Calendario `/calendar` · 3. Appuntamenti `/appuntamenti` ·
4. Lista d'attesa `/attesa` · 5. Conversazioni `/chat` · 6. Clienti `/clienti` ·
7. Ricettario `/ricettario` · 8. Fedeltà `/fidelity` · 9. Servizi `/services` ·
10. Staff `/stylists` · 11. Magazzino `/magazzino` · 12. Statistiche `/statistiche`
· 13. Orari `/hours`.

Sticky bottom: **Esci** (`POST /api/auth/logout` → `/login`). Active link
highlights on exact match (`/`) or prefix match (nested). Desktop: fixed 240 px rail;
mobile: slide-in drawer with backdrop, closes on navigation.

---

## 3. Layout, shell & theming

- **Root layout** (`src/app/layout.tsx`): `lang="it"`, Google **Geist** font,
  title "Max&Tony Nazionale — Gestionale". An inline pre-paint script sets the
  theme (`localStorage.theme` → else `prefers-color-scheme`) by toggling `.dark`
  on `<html>` (no theme flash).
- **AppShell** (`src/components/AppShell.tsx`): sidebar + sticky **TopNav**
  (mobile hamburger, page `title`/`subtitle`, right-side `actions`) + scrollable
  main area. `bare` prop drops padding for full-bleed pages (e.g. calendar, chat).
- **Theming** (`src/app/globals.css`): CSS variables for light/dark. Brand accent
  is a muted rose/mauve (`#a34e74` light, `#d17497` dark); semantic success/warning/
  danger/info; warm neutral surfaces. Utilities: `.card`, `.surface`, `.badge`,
  `.thin-scroll`, `.zebra-alt`, border helpers.
- **Component kit** (`src/components/ui.tsx`): `Button` (CVA variants
  primary/secondary/ghost/danger), `Card`, `Badge`, `Input`/`Select`, `Field`,
  `Modal` (Radix Dialog). `data-ui.tsx`: `Filters`, `FilterField`, `Pagination`,
  `usePagination`. `pickers.tsx`: `DateField`, `TimeField`, `Popover`
  (Monday-first calendar; click-outside close).

---

## 4. Real-time & refresh behaviour

- **Supabase Realtime** (browser, anon key) on **`/chat`**: subscribes to
  `postgres_changes` — INSERT on `messages` (append live) and `*` on
  `conversations` (refetch list). This is how staff see incoming WhatsApp messages
  instantly.
- **Polling fallback**: Panoramica, Calendario, Appuntamenti refetch every **20 s**
  and on window focus, so bookings made by the AI or other staff appear without a
  manual reload.

> ⚠️ Realtime uses the public **anon** key in the browser. Enable **Row-Level
> Security** in Supabase so that key can't read table data around the login gate
> (see [08-deployment.md](08-deployment.md)).

---

## 5. Where the agent and dashboard meet
- **Conversazioni** (`/chat`) is the human side of the handoff: flip a conversation
  to **human** to stop AI auto-replies and answer manually; flip back to **agent**.
- Bookings the AI makes over WhatsApp show up in **Calendario/Appuntamenti** live.
- **Servizi**, **Staff**, **Orari** directly shape what the agent can offer —
  editing them changes availability the AI computes on the next message.
- **Clienti → color session** can be pre-filled from a calendar appointment via
  `?color=<appointmentId>&stylist=<id>`.
