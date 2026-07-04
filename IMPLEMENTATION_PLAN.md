# Salone WhatsApp Agent — Implementation Plan & Deploy Runbook

Adaptation of the original dental-clinic WhatsApp agent into a **hair-salon booking
assistant** that speaks Italian, checks real availability, creates/cancels
appointments, and shares a single database with your existing React **gestionale**.
Deployed on **Hetzner + Coolify** with **self-hosted Supabase**.

---

## 1. Architecture

```
Cliente scrive su WhatsApp
  -> Meta invia POST /api/webhook (firma verificata)
  -> Risposta 200 immediata, elaborazione in background
  -> Messaggio salvato in Supabase (tabella messages)
  -> AI (OpenRouter) con TOOL-CALLING:
       list_services / check_availability / book_appointment /
       get_my_appointments / cancel_appointment
  -> I tool leggono/scrivono le tabelle appointments/services/stylists
  -> Risposta inviata via Meta Graph API e salvata
  -> Dashboard + GESTIONALE aggiornati in tempo reale (Supabase Realtime)
```

Single source of truth: the `appointments` table. A booking made by the AI appears
instantly in the gestionale, and staff bookings/edits from the gestionale are seen
by the AI when it computes availability.

---

## 2. What changed vs. the original project

| Area | Before (dental) | Now (salon) |
|---|---|---|
| Prompt | Hard-coded English dentist prompt | `buildSalonSystemPrompt()` — Italian, injects current date/time in `Europe/Rome` |
| AI | Plain chat completion, no actions | Tool-calling loop in `src/lib/ai.ts` (max 5 rounds) |
| Booking | None (talk only) | Real read/write via `src/lib/booking.ts` |
| Availability | None | `src/lib/availability.ts` slot engine + `src/lib/timezone.ts` (DST-safe) |
| Data model | conversations, messages | + `stylists`, `services`, `business_hours`, `appointments` |
| Webhook | Sync, could time out (dup replies) | Fast 200 + async processing + Meta signature check |
| Config | Constants in prompt | `src/lib/salon-config.ts` (name, address, hours rules) |
| Secrets | **Live keys committed** | Scrubbed; `WHATSAPP_APP_SECRET` added |

### New / changed files
- `supabase-schema.sql` — full shared schema + seed data (services, stylists, hours)
- `src/lib/salon-config.ts` — editable salon identity + booking rules
- `src/lib/timezone.ts` — Intl-based UTC ⇆ Europe/Rome helpers (no deps)
- `src/lib/availability.ts` — pure slot-computation engine
- `src/lib/booking.ts` — DB access for services/availability/booking/cancel
- `src/lib/tools.ts` — OpenAI tool definitions + dispatcher
- `src/lib/ai.ts` — tool-calling loop
- `src/lib/system-prompt.ts` — Italian salon prompt builder
- `src/lib/types.ts` — added Stylist/Service/BusinessHours/Appointment
- `src/app/api/webhook/route.ts` — signature verify + async processing

---

## 3. Booking data model

- **stylists** — parrucchieri (`Giulia`, `Marco`, `Francesca` seeded).
- **services** — nome, `duration_min`, `price_cents` (euro cents), `active`.
- **business_hours** — one row per weekday (0=Sun..6=Sat), optional midday break
  (pausa pranzo). Stored as local wall-clock time; the engine converts to UTC.
- **appointments** — the shared calendar. A Postgres **exclusion constraint**
  (`no_stylist_overlap`, via `btree_gist`) makes double-booking a stylist
  impossible at the database level — the ultimate guard even under races.

All timestamps are `timestamptz` (UTC). Business hours are local; the engine
handles DST correctly (verified: 09:00 Rome = 07:00Z in July, 08:00Z in January).

---

## 4. How the AI books (tool flow)

1. `list_services` — when the customer asks what's offered / prices.
2. `check_availability(service, date, [stylist])` — returns real free slots with an
   exact `iso` start instant per option. The model must not invent times.
3. `book_appointment(service, startIso, [stylist], [customerName])` — re-checks the
   slot, resolves a free stylist, inserts the appointment. The exclusion constraint
   rejects any slot taken in the meantime with a clean message.
4. `get_my_appointments` / `cancel_appointment` — self-service management by phone.

Booking rules live in `salon-config.ts`: slot granularity (15 min), min lead time
(60 min), max advance (60 days), max slots offered per reply (8).

---

## 5. Setup steps (in order)

1. **Rotate the leaked secrets first** (see §7). Do this before anything else.
2. Provision Supabase (self-hosted on Coolify — §6) or Supabase Cloud.
3. Run `supabase-schema.sql` in the SQL editor / `psql`. Edit the seed block
   (services, stylists, hours) to match the salon, or manage them from the gestionale.
4. Edit `src/lib/salon-config.ts` — real name, address, phone, email. Confirm the
   town (Napoli is Campania; Marche is a different region — set the real one).
5. `cp .env.example .env.local` and fill every value, including `WHATSAPP_APP_SECRET`.
6. `npm install && npm run dev`, send a test WhatsApp message.
7. Point the gestionale at the **same** Supabase DB; read/write the `appointments`
   table (and `services`/`stylists`/`business_hours` for admin screens).
8. Deploy to Hetzner + Coolify (§6) and set the Meta webhook to the public URL.

---

## 6. Hetzner + Coolify deploy runbook

### 6.1 Server
- Create a Hetzner Cloud server (an EU location — Falkenstein/Nuremberg — keeps data
  in the EU for GDPR). CX22/CPX21 or larger is sensible if self-hosting Supabase
  (Supabase is ~8–10 containers and wants RAM).
- Point a domain/subdomain at the server (e.g. `bot.iltuosalone.it`,
  `db.iltuosalone.it`). Coolify issues Let's Encrypt certs automatically.

### 6.2 Install Coolify
```bash
curl -fsSL https://coolify.io/install.sh | bash
```
Open Coolify, create an admin account, connect your Git repo (GitHub/GitLab).

### 6.3 Self-host Supabase on Coolify
- Coolify → **Resources → New → Service → Supabase**.
- Set a strong Postgres password, `JWT_SECRET`, and generate the `anon` /
  `service_role` keys (Coolify's Supabase template guides this).
- Assign the `db.` subdomain to Supabase Studio/API; enable HTTPS.
- Open the SQL editor and run `supabase-schema.sql`.
- Note the API URL and the anon + service_role keys for the app env.

### 6.4 Deploy the Next.js app
- Coolify → **New → Application → from your Git repo**. Build pack: **Nixpacks**
  (auto-detects Next.js) or Dockerfile if you prefer.
- Build: `npm run build`. Start: `npm run start`. Port `3000`.
- Add environment variables (from `.env.example`): WhatsApp token/id/verify/app-secret,
  OpenRouter key + model, the Supabase URL + anon + service_role keys.
- Assign the `bot.` subdomain, enable HTTPS, deploy.
- Because it runs as a persistent Node server, the webhook's "respond 200 then process
  in background" pattern works (unlike serverless). Keep `runtime = "nodejs"`.

### 6.5 Point Meta at production
- Meta App → WhatsApp → Configuration → Webhook URL:
  `https://bot.iltuosalone.it/api/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`.
- Subscribe to the **messages** field. Set the App Secret as `WHATSAPP_APP_SECRET`
  so signature verification is active in production.

### 6.6 Ops
- Enable automatic deploys on push to `main`.
- Set up Coolify backups for the Postgres volume (nightly), and store them off-box.
- Watch memory; scale the server up if Supabase + Next.js get tight.

---

## 7. Security actions (do these now)

The repo previously committed **live** credentials. All must be rotated:
- **Supabase** anon + `service_role` keys, and the project — regenerate keys
  (Project Settings → API). The old `service_role` key bypasses all security.
- **Supabase MCP access token** in `.mcp.json` (`sbp_…`) — revoke and reissue.
- **Meta WhatsApp access token** — regenerate in Meta Business → System Users.
- Confirm `.env.local` is gitignored (it is). Consider scrubbing git history
  (`git filter-repo`) if the repo was ever pushed.

Also hardened in this pass: webhook signature verification (`WHATSAPP_APP_SECRET`).

### Done in this pass
- **Auth on the dashboard + `/api/conversations/*`** — a shared staff password
  (`DASHBOARD_PASSWORD`) issues a signed, httpOnly session cookie (`AUTH_SECRET`);
  `src/middleware.ts` blocks the dashboard and data APIs while leaving
  `/api/webhook` and `/login` public. Login at `/login`, logout from the header.

### Still open (recommended next)
- **Row-Level Security on Supabase.** The dashboard subscribes to Realtime with the
  public `anon` key in the browser. With RLS off, that key can read table data
  directly regardless of the login gate. Enable RLS (and scope Realtime) so the
  anon key can't be used to bypass the password.
- **Rate limiting** on the webhook to cap AI spend from spammy senders.
- **GDPR**: privacy notice, data-retention policy, and a way to delete a
  customer's data on request (Italian/EU customers).

---

## 8. Verification done
- `tsc --noEmit` on all new/changed library modules: **passes** (0 errors).
- Availability engine unit tests: **11/11 pass** — DST (summer/winter), midday
  break exclusion, busy-slot overlap, min lead time, closed days.
- Next.js build + live WhatsApp round-trip: to be run in your environment with
  real credentials (couldn't run here without secrets).
