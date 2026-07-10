# Max&Tony Nazionale — WhatsApp AI Agent + Gestionale

Documentation hub. This project is **two applications sharing one Supabase
database**:

1. **A WhatsApp AI booking agent** — an Italian-speaking assistant that chats with
   customers over the Meta WhatsApp Business API, checks real availability, and
   books / reschedules / cancels hair-salon appointments autonomously.
2. **A staff dashboard (*gestionale*)** — a full salon management back office:
   calendar, appointments, clients/CRM, color-formula archive (*ricettario*),
   inventory (*magazzino*), sales, loyalty, staff scheduling, statistics, and a
   live WhatsApp chat with an agent/human handoff toggle.

Both write the same `appointments` table, so a booking made by the AI shows up
instantly in the staff calendar, and staff edits are seen by the AI when it
computes availability. There is **no n8n** — this Next.js app replaced it.

- **Stack:** Next.js 16 (App Router, TypeScript) · Supabase (Postgres + Realtime)
  · OpenRouter (OpenAI-compatible AI) · Tailwind CSS 4 · self-hosted on
  Hetzner + Coolify.
- **Language:** the product UI, prompts and data are **Italian**.

> ⚠️ **Docs vs. code.** These documents were reconciled against the source on
> 2026-07-09. The older root-level markdown (`README.md`, `IMPLEMENTATION_PLAN.md`,
> `DEPLOY.md`, `TESTING.md`, `claude_code_prompt.md`) predates much of the
> gestionale and describes a smaller app. **When in doubt, trust the code.** This
> `docs/` set supersedes them.

---

## The 10 documents

| # | Document | What's inside |
|---|---|---|
| — | **[README.md](README.md)** (this file) | Overview, doc map, quick start. |
| 01 | **[01-architecture.md](01-architecture.md)** | System components, how the pieces talk, request lifecycle, runtime model. |
| 02 | **[02-agent-logic.md](02-agent-logic.md)** | ⭐ **The full scheme of the AI agent** — webhook → tool-loop → booking → reply, every safety gate, sequence diagrams. |
| 03 | **[03-booking-engine.md](03-booking-engine.md)** | Availability engine, timezone/DST, booking rules, double-booking prevention, reschedule/cancel/reminders. |
| 04 | **[04-database-schema.md](04-database-schema.md)** | Every table across the base schema + 8 migrations, relationships, triggers, constraints. |
| 05 | **[05-api-reference.md](05-api-reference.md)** | All REST routes (webhook, public booking, and the whole gestionale API), grouped by domain. |
| 06 | **[06-dashboard-gestionale.md](06-dashboard-gestionale.md)** | Every dashboard page, navigation, layout, theming, real-time behaviour. |
| 07 | **[07-configuration.md](07-configuration.md)** | Environment variables, `salon-config.ts`, booking knobs, fail-fast/degrade behaviour, secrets. |
| 08 | **[08-deployment.md](08-deployment.md)** | Hetzner + Coolify runbook, self-hosted Supabase, Meta webhook setup, reminder cron, go-live checklist. |
| 09 | **[09-development-testing.md](09-development-testing.md)** | Local dev, scripts, the test suite, CI, smoke test, message simulator. |
| 10 | **[10-agent-hardening-changes.md](10-agent-hardening-changes.md)** | ⭐ **2026-07-10 changes** — message coalescing, DB-aware confirmation gate, AI-failure alerts, human handoff, chat-UX fixes. Full changelog for review. |

**New here?** Read **01 → 02 → 03**. That's the whole agent, in order. For the
latest changes, see **[10](10-agent-hardening-changes.md)**.

---

## Quick start (local, no secrets needed to build/test)

```bash
npm install
npm test           # 88 unit tests — no services or secrets required
npm run typecheck  # tsc --noEmit
npm run build      # production build (all external clients are lazy)
```

Run the app and simulate an inbound WhatsApp message (see
[09-development-testing.md](09-development-testing.md)):

```bash
npm run dev
npm run simulate -- "Ciao, vorrei un taglio donna venerdì" 393330000000
```

To go fully live you need Meta WhatsApp, OpenRouter and Supabase credentials, and
a public HTTPS URL — the runbook is in [08-deployment.md](08-deployment.md).

## URLs (production example)
- **Agent / dashboard:** `https://agent.testdemo.it` (log in at `/login`)
- **Webhook:** `https://agent.testdemo.it/api/webhook`
- **Public booking widget:** `https://agent.testdemo.it/prenota`
- **Privacy policy:** `https://agent.testdemo.it/privacy`
- **Supabase Studio/API:** `https://db.testdemo.it`
