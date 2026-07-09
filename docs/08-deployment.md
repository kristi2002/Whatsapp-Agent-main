# 08 — Deployment (Hetzner + Coolify)

Target: a **persistent Node server** (required by the webhook's "reply 200, process
in background" pattern — see [01](01-architecture.md) §5) plus **self-hosted
Supabase**, both on a Hetzner box managed by Coolify. Coolify issues Let's Encrypt
HTTPS automatically.

> Example domains used below: `agent.testdemo.it` (app), `db.testdemo.it`
> (Supabase). Meta test data from the original setup: App ID `4092647910866661`,
> test number `+1 (555) 652-3157`, Phone Number ID `1142465592289974`, WABA
> `1041062138271233`.

---

## 1. Server
- Hetzner Cloud, **EU region** (Falkenstein/Nuremberg) for GDPR.
- **CPX31 / 4 vCPU / 8 GB** or larger — self-hosted Supabase is ~8–10 containers
  and wants RAM. Ubuntu 22.04/24.04, add your SSH key.
- DNS A-records → server IP: `agent.testdemo.it` (app), `db.testdemo.it` (Supabase).

## 2. Install Coolify
```bash
curl -fsSL https://coolify.io/install.sh | bash
```
Open `http://SERVER_IP:8000`, create the admin account, connect your Git provider.

## 3. Self-host Supabase → produces the 3 Supabase keys
1. Coolify → **New → Resource → Service → Supabase**.
2. Set a strong Postgres password; let it generate `JWT_SECRET`, `anon`,
   `service_role`.
3. Assign `db.testdemo.it`, enable HTTPS, deploy.
4. In **Supabase Studio → SQL Editor**, run **in order**:
   - `supabase-schema.sql` (base + seed; enables `btree_gist` + Realtime)
   - `supabase-migration-2.sql` … `supabase-migration-8.sql`
5. Note three values for the app env:
   - Project/API URL → `NEXT_PUBLIC_SUPABASE_URL` (e.g. `https://db.testdemo.it`)
   - anon public key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - service_role key → `SUPABASE_SERVICE_ROLE_KEY`
6. Edit the seed to the real salon (services, stylists, `business_hours`) or manage
   it later from the gestionale.

## 4. Deploy the Next.js app
1. Coolify → **New → Application → from Git repo**, branch `main`.
2. Build pack **Nixpacks** (auto-detects Next.js; Node pinned to 22 via `.nvmrc`):
   - Install `npm ci` · Build `npm run build` · Start `npm run start` · Port `3000`.
3. **Add all environment variables ([07](07-configuration.md)) BEFORE the first
   deploy** — the `NEXT_PUBLIC_*` values are inlined at build time.
4. Assign `agent.testdemo.it`, enable HTTPS.
5. **Health check:** point Coolify at `GET /api/health` (`{"status":"ok"}`, no auth).
6. Deploy. Optionally enable **auto-deploy on push to `main`**.

## 5. Environment variables
Paste the full set from [07-configuration.md](07-configuration.md) into Coolify →
app → Environment. Never commit real values. Template lives in `.env.example`.

## 6. Point Meta at production
1. Meta App → **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://agent.testdemo.it/api/webhook`
   - Verify token: your `WHATSAPP_VERIFY_TOKEN` (Meta calls GET to verify).
2. Subscribe to the **messages** field.
3. Set the **App Secret** as `WHATSAPP_APP_SECRET` so signature verification is
   active in production.
4. (Test number) Meta → **API Setup → "To"**: add your own WhatsApp number to the
   allow-list. Send `"Ciao, vorrei prenotare un taglio donna venerdì pomeriggio"` →
   expect an Italian reply proposing real slots; pick one; it books; the row lands
   in `appointments` and shows live in the dashboard.

## 7. Appointment reminders (schedule the cron)
Reminders are **not automatic**. To enable:
1. Set `CRON_SECRET` in the app env.
2. Schedule an HTTP GET (Coolify scheduled task / system cron / uptime pinger),
   e.g. hourly:
   ```bash
   curl -s "https://agent.testdemo.it/api/cron/reminders?key=$CRON_SECRET"
   ```
   It messages `booked` appointments ~20–28 h out that haven't been reminded.
3. **Outside Meta's 24 h service window you must use an approved message
   template**, not plain text — update the send call once your template is approved.

---

## 8. Go-live checklist (before the real salon number)
- [ ] **Permanent WhatsApp token** — replace the test-number token (expires ~24 h)
      with a Meta System-User token (`whatsapp_business_messaging` +
      `whatsapp_business_management`).
- [ ] **App Secret** set → `WHATSAPP_APP_SECRET` (signature verification on).
- [ ] **Enable Row-Level Security** on Supabase and scope Realtime. The dashboard
      uses the public **anon** key in the browser; without RLS that key can read
      table data directly, bypassing the login gate. **Top priority hardening.**
- [ ] **Rotate** any previously-committed secrets (Meta token, Supabase anon +
      service_role, Supabase MCP token). Scrub git history if ever pushed.
- [ ] **Backups** — nightly Postgres backups of the Supabase volume, stored off-box.
- [ ] **Rate limiting** on the webhook to cap AI spend from spammy senders (open).
- [ ] **GDPR** — privacy notice (served at `/privacy`), retention policy, and a way
      to delete a customer's data on request.
- [ ] Only cut the live customer number over after the test-number round-trip in §6
      works end-to-end.
- [ ] Watch memory; scale the server up if Supabase + Next.js get tight.

---

## 9. Operational notes
- Runs as a persistent `next start` server → the fast-200 + background-processing
  webhook works correctly (no Meta retries / duplicate replies). Keep the webhook
  route on `runtime = "nodejs"`.
- **Verified offline** (from `DEPLOY.md`/`IMPLEMENTATION_PLAN.md`): schema + seed +
  exclusion constraint on real Postgres (9/9); availability engine incl. DST
  (11/11); dashboard auth (9/9); AI tool-loop (6/6); TypeScript clean.
- **Verify live in your environment:** real model tool-calling on your `AI_MODEL`
  (OpenRouter isn't reachable from the build sandbox — if the bot chats but never
  books, switch to `anthropic/claude-3.7-sonnet` or `openai/gpt-4o`) and the first
  real WhatsApp send (needs the live token + Meta webhook).
