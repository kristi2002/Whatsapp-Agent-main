# 07 — Configuration & Environment

Two layers of configuration:
1. **Runtime secrets & switches** → environment variables (`.env.local`, or
   Coolify). Template in `.env.example`.
2. **Salon identity & booking rules** → `src/lib/salon-config.ts` (code).

---

## 1. Environment variables

| Variable | Required? | Description |
|---|---|---|
| `WHATSAPP_ACCESS_TOKEN` | **yes** (send) | Permanent Meta token (Business → System Users). Test-number tokens expire in ~24 h. |
| `WHATSAPP_PHONE_NUMBER_ID` | **yes** | Meta phone-number id (default in repo: `1142465592289974`). Not secret. |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | optional | WABA id; informational. |
| `WHATSAPP_VERIFY_TOKEN` | **yes** | Any string; must match the Meta webhook config (GET verification). |
| `WHATSAPP_APP_SECRET` | prod | Meta App Secret. Enables `X-Hub-Signature-256` verification. **Unset → signature check is skipped** (dev only). |
| `STAFF_NOTIFY_NUMBER` | optional | WhatsApp number for staff handoff alerts (`393802871060`). |
| `OPENROUTER_API_KEY` | **yes** (AI) | Key from openrouter.ai. **Unset → AI errors → customer gets the fallback message.** |
| `AI_MODEL` | optional | Model id. Code default `anthropic/claude-sonnet-4-20250514`; deploy default `google/gemini-2.5-flash`. |
| `NEXT_PUBLIC_SUPABASE_URL` | **yes** | Supabase API URL. **Inlined into the browser bundle at build time.** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **yes** | Anon key (browser Realtime). **Inlined at build time.** |
| `SUPABASE_SERVICE_ROLE_KEY` | **yes** | Service-role key (server/webhook). **Secret — never expose to the browser.** |
| `DASHBOARD_PASSWORD` | **yes** | Shared staff login password. `checkPassword` throws if unset. |
| `AUTH_SECRET` | **yes** | ≥16 chars; signs the session cookie. Auth **throws if missing/short**. `openssl rand -hex 32`. |
| `CRON_SECRET` | for reminders | Guards `/api/cron/reminders`. **Unset → 401, no reminders ever sent.** |
| `PORT` | optional | Server port (default 3000). |
| `NEXT_PUBLIC_APP_URL` | optional | Public base URL (e.g. `https://agent.testdemo.it`). |

### Degrade / fail-fast behaviour (important)
- **Fail-fast (won't boot / throws on use):** `AUTH_SECRET` (missing/short) and
  `DASHBOARD_PASSWORD` throw when auth is exercised. `SUPABASE_*` are required for
  any DB call.
- **Degrade gracefully (no crash):**
  - `WHATSAPP_APP_SECRET` unset → webhook signature verification **skipped**
    (returns valid). Fine locally; **set it in production.**
  - `OPENROUTER_API_KEY` / bad `AI_MODEL` → `getAIResponse` throws → the customer
    receives the safe Italian fallback; the webhook still returns 200.
  - `CRON_SECRET` unset → reminders endpoint returns 401 (silent no reminders).
- **Build needs no secrets.** All external clients (Supabase, OpenAI/OpenRouter)
  are **lazily constructed**, so `npm run build` and the test suite work with
  nothing configured.

### `NEXT_PUBLIC_*` are build-time
The two `NEXT_PUBLIC_SUPABASE_*` values are compiled into the browser bundle **when
Coolify builds**. If they're missing at build time, dashboard Realtime won't
connect until you rebuild with them set — add them **before the first deploy**.

---

## 2. `src/lib/salon-config.ts`

Static identity + booking rules the AI needs but that rarely change. Dynamic data
(services, stylists, hours) lives in the DB so the gestionale can manage it.

```ts
SALON = {
  name: "Max&Tony Nazionale",
  address: "Piazza Nazionale 92, 80143 Napoli (NA)",
  phone: "081 2356402",
  email: "",
  timezone: "Europe/Rome",   // all date math & formatting
  locale: "it-IT",
}

WHATSAPP = {
  phoneNumberId: "1142465592289974",   // mirror in WHATSAPP_PHONE_NUMBER_ID
  staffNotifyNumber: "393802871060",
}

BOOKING = {
  slotGranularityMin: 15,   // start-time grid
  minLeadTimeMin: 60,       // earliest bookable lead time
  maxAdvanceDays: 60,       // furthest-ahead booking
  maxSlotsReturned: 6,      // times offered per availability reply
}
```

- `SALON` feeds the **system prompt** (name/address/phone/email) and every
  timezone conversion. Update it for a different salon.
- `BOOKING` tunes the availability engine and how many options the AI offers.
  See [03-booking-engine.md](03-booking-engine.md).

---

## 3. Related config files
- **`.mcp.json`** — optional Supabase MCP server (placeholders `YOUR_PROJECT_REF`
  / `YOUR_SUPABASE_ACCESS_TOKEN`). Only needed if you drive Supabase via MCP.
- **`.nvmrc`** — Node 22 (deploy pins this; `package.json` engines require ≥20).
- **`next.config.ts`**, **`tsconfig.json`**, **`eslint.config.mjs`**,
  **`postcss.config.mjs`**, **`vitest.config.ts`** — standard tooling. Test env
  values (dummy, never real) live in `vitest.config.ts`.

---

## 4. Secrets hygiene
- `.env.local` is gitignored. **Never** commit real secrets to `.env.example` /
  `DEPLOY.md` — keep them in `.env.local` and Coolify only.
- The repo previously contained **live** credentials; all must be rotated
  (Meta token, Supabase anon + service_role keys, the Supabase MCP token). Consider
  scrubbing git history if it was ever pushed.
- To generate: `AUTH_SECRET` = `openssl rand -hex 32`; `CRON_SECRET` =
  `openssl rand -hex 16`.
