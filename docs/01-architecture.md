# 01 — System Architecture

## 1. Two apps, one database

```
                         ┌─────────────────────────────────────┐
   Customer (WhatsApp)   │            Supabase (Postgres)       │
        │                │  conversations · messages            │
        ▼                │  stylists · services · appointments  │
  Meta WhatsApp Cloud    │  clients · sales · color_sessions    │
        │                │  products · waitlist · loyalty · …   │
        ▼                │            + Realtime                 │
 ┌──────────────┐        └───────▲───────────────────▲──────────┘
 │  Next.js app │                │                    │
 │  (one server)│                │ service_role       │ anon key
 │              │────────────────┘  (server/webhook)  │ (browser Realtime)
 │  ┌────────┐  │                                     │
 │  │Webhook │  │ ← Meta → AI agent → booking         │
 │  ├────────┤  │                                     │
 │  │REST API│  │ ← dashboard data + public booking   │
 │  ├────────┤  │                                     │
 │  │Dashboard│ │ ← staff SPA (React) ────────────────┘
 │  └────────┘  │
 └──────────────┘
        ▲
        │ staff browser (login-gated)
   Salon staff
```

The **single source of truth is the `appointments` table.** The AI agent and the
staff gestionale both read/write it, so they stay perfectly in sync in real time.

## 2. Components

| Component | Where | Role |
|---|---|---|
| **WhatsApp webhook** | `src/app/api/webhook` + `src/lib/webhook.ts` | Receives Meta deliveries, verifies signature, processes messages in the background. |
| **AI agent** | `src/lib/ai.ts`, `tools.ts`, `system-prompt.ts` | Tool-calling loop that decides what to do and drafts replies. See [02](02-agent-logic.md). |
| **Booking layer** | `src/lib/booking.ts`, `availability.ts`, `timezone.ts` | Real DB reads/writes + the pure slot engine. See [03](03-booking-engine.md). |
| **Gestionale REST API** | `src/app/api/*` | ~40 endpoints for appointments, clients, color, inventory, sales, staff, stats. See [05](05-api-reference.md). |
| **Dashboard SPA** | `src/app/*` (pages) + `src/components/*` | Staff back office, Italian UI. See [06](06-dashboard-gestionale.md). |
| **Public booking widget** | `src/app/prenota` + `src/app/api/public/*` | Unauthenticated self-service booking. |
| **Auth / proxy** | `src/lib/auth.ts`, `src/proxy.ts` | Shared-password session cookie; middleware gates the dashboard + data APIs. |
| **Database** | `supabase-schema.sql` + `supabase-migration-{2..8}.sql` | Shared Postgres schema. See [04](04-database-schema.md). |
| **Reminders cron** | `src/app/api/cron/reminders` | Externally-triggered appointment reminders. |

## 3. How the pieces talk

- **Meta → app.** WhatsApp deliveries hit `POST /api/webhook`. The route verifies
  the `X-Hub-Signature-256` HMAC (using `WHATSAPP_APP_SECRET`), returns `200`
  immediately, and processes the message **in the background**.
- **App → Meta.** Replies go out via `sendWhatsAppMessage()` →
  `POST https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages` with the
  permanent access token.
- **App → AI.** `getAIResponse()` calls OpenRouter (OpenAI-compatible) with the
  system prompt, conversation history, and tool definitions.
- **App → DB (server).** All server code uses the **service-role** Supabase client
  (`src/lib/supabase.ts`), lazily constructed so `next build` needs no secrets.
- **Browser → DB (Realtime).** The dashboard subscribes to Supabase **Realtime**
  with the public **anon** key for live message/conversation updates.
- **Same-origin.** Dashboard and APIs are the same Next.js server — no CORS.

## 4. Request lifecycles

### Inbound WhatsApp message (the agent)
```
Meta → POST /api/webhook → verify signature → 200 "received"
     → processEvent (fire-and-forget)
       → per-phone serialization
       → store user message (dedup) → mode check
       → getAIResponse (tool loop: availability/book/…) 
       → sendWhatsAppMessage → store assistant message
       → Realtime pushes both to the dashboard
```
Full detail: [02-agent-logic.md](02-agent-logic.md).

### Dashboard data request (staff)
```
Browser → GET/POST /api/… → proxy.ts checks salon_session cookie
        → 401 (redirect to /login) if missing/invalid
        → route handler → Supabase (service role) → JSON
```

### Public self-service booking
```
Browser → /prenota → GET /api/public/setup (services, stylists, salon)
        → GET /api/public/availability → POST /api/public/book
        (no auth; abuse-guarded to 6 bookings/phone/day; source = 'online')
```

## 5. Runtime model — why it must be a persistent server

The webhook uses **"respond 200, then process in the background"**. Meta's webhook
timeout is ~5 s; the AI + booking round-trip is slower, so blocking would make Meta
retry and deliver **duplicate** messages. This pattern only works on a **persistent
Node process** — hence:

- The webhook route pins `export const runtime = "nodejs"`.
- Deployment is a long-running `next start` server on **Coolify** (not serverless).
- **Per-phone serialization** (`runSerial`) is an **in-memory Map**, correct only
  for a **single instance**. This is a **deliberate, appropriate tradeoff** for a
  single-VPS deployment — not a bug. Horizontal scaling (multiple instances behind
  a load balancer) would silently break per-phone ordering and require replacing
  the Map with a shared/distributed lock (Redis, Postgres advisory locks) or an
  ordered stream (e.g. Kafka keyed by phone). **Don't add that until you actually
  need to scale out** — it's pure overhead for one salon.

## 6. Security posture

- **Dashboard + data APIs** are behind a shared-password session cookie (signed,
  httpOnly, 12 h TTL) enforced in `src/proxy.ts`.
- **Public exceptions:** `/login`, `/api/auth/*`, `/api/webhook`, `/api/health`,
  `/privacy`, `/prenota`, `/api/public/*`, `/api/cron/*`.
- **Webhook** is signature-verified in production (`WHATSAPP_APP_SECRET`).
- **Reminders** are guarded by `CRON_SECRET`.
- **RLS (important).** The `/chat` page holds the Supabase **anon** key in the
  browser for Realtime. With RLS **off**, that key can read/write every table
  directly (PostgREST + Realtime), bypassing the login gate — anyone can lift it
  from dev-tools. **`supabase-migration-9.sql` enables RLS on every table**
  (deny-by-default; the server's `service_role` key bypasses RLS so all `/api/*`
  routes keep working). After enabling it, browser Realtime stops delivering rows
  by design; `/chat` falls back to short-interval polling of the authenticated
  `/api/*` routes. **Run migration 9 before going live** — see
  [08-deployment.md](08-deployment.md) §go-live.

## 7. Tech stack (from `package.json`)

- **next 16.2.1**, **react 19.2**, TypeScript 5, Tailwind CSS 4.
- **@supabase/supabase-js 2**, **openai 6** (pointed at OpenRouter), **pg 8**.
- UI: Radix primitives (dialog, dropdown, select, switch, tabs, tooltip),
  `lucide-react`, `motion` (Framer Motion), `date-fns`,
  `class-variance-authority` + `tailwind-merge`.
- Tests: **vitest 4** (+ coverage). Node **≥ 20** (`.nvmrc` pins 22 for deploy).
