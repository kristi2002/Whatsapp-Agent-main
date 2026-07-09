# 09 — Development & Testing

The project is **fully testable without any external services or secrets** — all
external clients are lazily constructed. What's left to go live is configuration
([07](07-configuration.md)) and deployment ([08](08-deployment.md)).

---

## 1. Commands (`package.json`)

```bash
npm install         # deps (Node ≥20; deploy pins 22 via .nvmrc)
npm run dev         # Next dev server → http://localhost:3000
npm run build       # production build (succeeds with NO secrets)
npm run start       # run the production build
npm run lint        # eslint
npm run typecheck   # tsc --noEmit
npm test            # vitest run — 60 unit tests, no secrets/services
npm run test:watch  # vitest watch
npm run test:coverage
npm run simulate -- "<text>" <fromPhone>   # fake an inbound WhatsApp message
npm run seed        # node scripts/seed-appointments.mjs (needs .env.local)
```

CI (`.github/workflows/ci.yml`) runs lint + typecheck + test + build on every
push/PR to `main`.

---

## 2. The unit suite (60 tests, 8 files)

All under `src/lib/`. Fast and hermetic — the I/O layers (`@/lib/supabase`,
`openai`, `@/lib/whatsapp`, `@/lib/ai`, `@/lib/booking`) are replaced with **Vitest
mocks** per test; there is **no test database**. Dummy env values live in
`vitest.config.ts` (`test.env`) — never real secrets.

| File | Covers |
|---|---|
| `timezone.test.ts` | UTC⇄Europe/Rome, **DST** (Jul vs Jan), weekday, formatting (pure). |
| `availability.test.ts` | Slot engine: open/closed days, **pausa pranzo**, busy-overlap, min-lead-time, fit-before-close, multi-stylist, DST, grouping (pure). |
| `auth.test.ts` | Session token sign/verify, expiry, tamper rejection, `checkPassword`. |
| `webhook.test.ts` | `verifySignature` HMAC + `processEvent` (create / agent / human / duplicate). |
| `ai.test.ts` | Tool-calling loop, tool round-trip, max-rounds fallback (mocked OpenAI). |
| `tools.test.ts` | Tool dispatch routing + error fallback. |
| `booking.test.ts` | Service/price formatting, availability + booking validation branches. |
| `whatsapp.test.ts` | Graph API request shape + headers (mocked `fetch`). |

The Supabase mock is a small chainable/awaitable query-builder stub whose results
you seed per test.

---

## 3. End-to-end smoke test (`scripts/smoke.sh`)

With a server running in another terminal:

```bash
BASE_URL=http://localhost:3000 ./scripts/smoke.sh
```

Checks (no real credentials needed for 1–3, 5):
1. `GET /api/health` → `{"status":"ok"}`
2. `GET /api/webhook` verification echoes the challenge (uses
   `WHATSAPP_VERIFY_TOKEN`, default `test-verify-token`)
3. wrong verify token → `403`
4. `POST /api/webhook` with `scripts/sample-webhook-payload.json` →
   `{"status":"received"}` (fully exercises AI/booking only once configured;
   without a DB it still returns 200 and logs a background error)
5. `GET /api/conversations` without a cookie → `401`

Keep `WHATSAPP_APP_SECRET` **empty** locally so the signature check is skipped.

---

## 4. Simulating a WhatsApp conversation locally

`scripts/simulate-message.mjs` POSTs a Meta-shaped webhook payload to your dev
server — the full agent (store → AI → booking → reply) runs **without a public
URL**:

```bash
npm run dev            # terminal 1
npm run simulate -- "Che servizi avete?" 393330000000          # terminal 2
npm run simulate -- "Ciao, vorrei un taglio donna domani" 393330000000
```

The server returns 200 immediately and processes in the background — watch the
`npm run dev` logs for the AI/booking output (`[ai convo=…] tool call …`). If
`from` is a number registered on your Meta test number, the reply is delivered for
real and the exchange appears in the dashboard. Env: `BASE_URL` (default
`http://localhost:3000`), `FROM`, `NAME`. Keep `WHATSAPP_APP_SECRET` empty.

`scripts/seed-appointments.mjs` (`npm run seed`) populates sample appointments for
manual dashboard testing (reads `.env.local`).

---

## 5. Local run modes

- **Build/test only (no config):** `npm test`, `npm run build` — everything green
  with zero secrets.
- **Interactive agent (needs Supabase + OpenRouter):** fill `.env.local`, run
  `npm run dev`, then `npm run simulate`. WhatsApp send additionally needs a valid
  Meta token + a registered recipient.
- **Full end-to-end:** requires the public HTTPS deployment + Meta webhook
  ([08](08-deployment.md)).

---

## 6. Notable engineering choices (from `TESTING.md`, behaviour-preserving)
- The webhook's `verifySignature` + `processEvent` were **extracted** into
  `src/lib/webhook.ts` so they're unit-testable (route files can't export helpers);
  `src/app/api/webhook/route.ts` is a thin wrapper.
- **Added** `GET /api/health` (public liveness) and allow-listed it in the proxy.
- **Renamed** `src/middleware.ts` → `src/proxy.ts` (function `middleware` →
  `proxy`) per the Next 16 deprecation. Per `AGENTS.md`, this is **not the Next.js
  you know** — check `node_modules/next/dist/docs/` and heed deprecation notices
  before writing framework code.

---

## 7. Definition of done (project convention)
1. App builds and boots with no errors.
2. `npm test`, `npm run typecheck`, `npm run lint`, `npm run build` all pass.
3. New backend route → add an assertion to `scripts/smoke.sh` **and** a row to the
   API map in [05-api-reference.md](05-api-reference.md).
4. Summarize what changed, what was tested, and any assumptions.
