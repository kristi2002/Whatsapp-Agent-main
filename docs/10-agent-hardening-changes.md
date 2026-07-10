# 10 — Agent Hardening Changes (2026-07-10)

> A full, no-detail-spared record of the changes made to fix the agent's
> functional gaps and the two live issues found in production. Read alongside
> [02-agent-logic.md](02-agent-logic.md) (updated) and
> [07-configuration.md](07-configuration.md) (updated).

---

## ⟲ Status / resume here (last updated 2026-07-10)

| | |
|---|---|
| **Work state** | Phases 1–4 complete, unit-tested, and validated live. |
| **Git** | **Uncommitted** — changes are in the working tree, nothing branched/pushed. Run `git status` to see the 15 modified + 3 new files (listed in §5). |
| **Checks** | `npm test` → **88 pass** · `npm run typecheck` clean · `npm run build` compiles. |
| **Open action (yours)** | Confirm the **OpenRouter key** is permanently fixed (raise limit / top up / rotate — see §0.1). |
| **New env (optional)** | `COALESCE_WINDOW_MS` (default 2500), `STAFF_NOTIFY_NUMBER` (set it so alerts/escalation reach staff). |
| **Deferred (not done, by scope)** | Voice transcription · reminder templates · `/api/health` AI status · horizontal-scale locks — see §7. |
| **How to resume** | Read this file top-to-bottom; the phase sections (§1–§4) each say *what/why/files/tests*. To re-verify: `npm test`, or run the app and send two quick WhatsApp messages that together form one booking → expect a single clean reply. |

### Change log (append future rounds here)
- **2026-07-10** — Initial hardening round (Phases 1–4). This document created;
  `docs/02`, `05`, `07`, `README` updated. Not yet committed.

**Scope agreed:** *"just fix the gaps found"* + two dashboard-chat requests. No
new platform features. Deployment target unchanged: **app on Hetzner, Supabase
Cloud as-is** (already online).

**Result:** 4 phases implemented, unit-tested (**81 → 88 tests, all green**),
typecheck + production build clean, and **validated live** against the production
Supabase (test data created then deleted).

---

## 0. Two live incidents diagnosed first

### 0.1 "Scusa, sto avendo un problema tecnico" on every message — *not a bug*
The agent's catch-all fallback ([`webhook.ts`](../src/lib/webhook.ts)) fires when
`getAIResponse()` throws. Reproducing the exact OpenRouter call with the repo's
key/model returned:

```
403  Key limit exceeded (total limit).   model: google/gemini-2.5-flash
```

**Cause:** the OpenRouter API key hit its credit/usage limit — a billing/config
issue, not code. **Fix:** raise/remove the key limit or top up credits at
openrouter.ai (rotate the key, since it was committed in `.env.local`). This
incident is what motivated **Phase 3** (make AI failure visible instead of silent).

### 0.2 "Appuntamento confermato" immediately followed by "Scusa, non sono riuscito…"
The customer sent the booking in **two messages** (*"…oggi alle 16… a nome di
Maria Paola"* then *"Con Genny"*). Each became a separate AI turn:
- **Turn 1** actually booked → real DB row → real "confermato".
- **Turn 2** re-confirmed from history **without calling `book_appointment`** →
  the anti-hallucination gate saw no booking *this turn* and replaced the
  confirmation with the failure message — even though the appointment existed.

Root cause: **no message coalescing** (double-processing one intent) + a
**turn-blind confirmation gate**. Fixed in **Phase 2** (both sub-fixes).

---

## 1. Phase 1 — Dashboard chat UX (explicit requests)

**Files:** [`src/app/chat/page.tsx`](../src/app/chat/page.tsx),
[`src/app/api/conversations/[id]/messages/route.ts`](../src/app/api/conversations/[id]/messages/route.ts)

### 1a. Removed the forced auto-scroll
Previously `useEffect(scrollIntoView, [messages])` scrolled to the bottom on
**every** `messages` change — and the 5 s poller replaces `messages` every 5 s, so
scrolling up to read history yanked you back down.

Now the page tracks whether the thread is scrolled near the bottom
(`atBottomRef`, 80 px tolerance, updated on `onScroll`) and **only auto-scrolls
when you're already at the bottom**. Switching conversation and sending your own
message still jump to the latest, as expected.

### 1b. "Svuota chat" (clear) button
- New **`DELETE /api/conversations/[id]/messages`** endpoint: deletes every message
  in the thread, keeps the conversation row (phone/name/mode preserved), bumps
  `updated_at`. Returns `{ ok: true }`. Staff-only (behind the auth proxy).
- A **trash-icon button** in the chat header, with a confirm dialog
  (*"Svuota questa chat? …"*). On success the thread empties and the list refreshes.

**Verified live:** `DELETE` without the session cookie → **401** (proxy protects
it); with cookie → **200 `{ok:true}`**; messages cleared, conversation preserved.

---

## 2. Phase 2 — The booking double-confirmation bug

### 2a. DB-aware confirmation gate
**Files:** [`src/lib/booking.ts`](../src/lib/booking.ts) (`hasRecentBooking`),
[`src/lib/ai.ts`](../src/lib/ai.ts) (`finalize`).

`finalize()` still blocks a "confermato" that isn't backed by a booking **this
turn** — but before blocking it now calls **`hasRecentBooking(phone)`**: if the DB
has an upcoming appointment for that phone **created in the last 5 minutes**, the
confirmation is real (previous-turn booking) and is allowed through. Still blocks:
a pure hallucination (no recent booking), and a booking that was *attempted and
failed* this turn (`bookingFailed`).

### 2b. Message coalescing (root-cause fix)
**File:** [`src/lib/webhook.ts`](../src/lib/webhook.ts) — restructured into
`ingestMessage` (fast, serialized, stores every message) + a **debounced**
`generateAndSendReply` scheduled by `scheduleReply`.

Each inbound text message (agent mode) (re)starts a per-phone timer of
**`COALESCE_WINDOW_MS`** (default **2500 ms**, `0` disables). A follow-up within the
window resets the timer, so **only the last message in a burst triggers the reply**,
answered over the full history. Nothing is dropped (all messages stored at
ingest); one reply per burst; the reply is `runSerial`-serialized so bursts can't
overlap. See [02-agent-logic.md §3.4](02-agent-logic.md).

**Verified live** (test phone, then cleaned up):
- Two rapid messages *"…alle 14:30… a nome di Test"* + *"Con Genny Pinto"* →
  **exactly one** assistant reply (coalesced), **no** false "Scusa".
- After a *"Sì, conferma"*, **exactly one** appointment row created
  (`source: whatsapp`) and a real "Perfetto! Ho prenotato…" confirmation.
- Summary: `{ userMessages: 3, assistantReplies: 2, appointments: 1, anySorry: false }`.

---

## 3. Phase 3 — AI-failure visibility

**Files:** [`src/lib/whatsapp.ts`](../src/lib/whatsapp.ts) (`notifyStaff`),
[`src/lib/webhook.ts`](../src/lib/webhook.ts) (`alertStaffAiDown`).

When `getAIResponse()` throws, in addition to the customer fallback the code now
sends a **rate-limited staff alert** (at most once / 15 min) to
`STAFF_NOTIFY_NUMBER` with the error detail — so an AI outage (like the 403 above)
is no longer invisible. `notifyStaff` is best-effort: no-op if the number is
unset, never throws.

---

## 4. Phase 4 — Human handoff (`escalate_to_human`)

**Files:** [`src/lib/booking.ts`](../src/lib/booking.ts) (`escalateToHuman`),
[`src/lib/escalation.ts`](../src/lib/escalation.ts) (`escalateAndNotify`, new),
[`src/lib/tools.ts`](../src/lib/tools.ts) (tool #7),
[`src/lib/ai.ts`](../src/lib/ai.ts) (safety net),
[`src/lib/system-prompt.ts`](../src/lib/system-prompt.ts) (instruction).

- New tool **`escalate_to_human(reason?)`**: flips `conversations.mode` to `human`
  (agent stops auto-replying; staff take over from the dashboard) **and** alerts
  `STAFF_NOTIFY_NUMBER`. This wires up the previously-**dead** staff-notify number
  and fulfills the prompt's long-standing "escalate to a human" promise.
- **Safety net:** if the model *narrates* a handoff but doesn't call the tool,
  `finalize()` (via `ESCALATION_RE`) performs the handoff anyway. Same
  "code is the source of truth" principle as the booking gate.

**Verified live:** a *"ho un reclamo, voglio un operatore"* message flipped the
conversation to **`mode: human`** end-to-end.

---

## 5. New / changed files

| File | Change |
|---|---|
| `src/app/chat/page.tsx` | Scroll-gating + "Svuota chat" button |
| `src/app/api/conversations/[id]/messages/route.ts` | + `DELETE` (clear thread) |
| `src/lib/webhook.ts` | Ingest/reply split, coalescing, AI-failure staff alert |
| `src/lib/ai.ts` | DB-aware gate, escalation safety net |
| `src/lib/booking.ts` | + `hasRecentBooking`, + `escalateToHuman` |
| `src/lib/tools.ts` | + `escalate_to_human` tool + dispatcher (via `escalateAndNotify`) |
| `src/lib/whatsapp.ts` | + `notifyStaff` |
| `src/lib/escalation.ts` | **new** — `escalateAndNotify` shared helper |
| `src/lib/system-prompt.ts` | Stronger escalation instruction |
| `src/lib/*.test.ts` + `src/lib/escalation.test.ts` | +7 tests (88 total) |

**New env var:** `COALESCE_WINDOW_MS` (optional, default 2500). **Now used:**
`STAFF_NOTIFY_NUMBER` (was configured but referenced nowhere).

---

## 6. Tests & verification

- **Unit:** `npm test` → **88 passed** (was 81). New/updated coverage: DB-aware
  gate incl. the exact split-message case; coalescing (burst → single reply);
  AI-failure staff alert; escalation tool + "no alert if handoff failed" +
  enforcement net.
- **Types/build:** `npm run typecheck` clean; `npm run build` compiles.
- **Live E2E** against production Supabase (test phone `390000000199`/`188`,
  all rows deleted afterward): booking coalescing + confirmation, clear-chat
  endpoint (incl. 401-without-auth), and human escalation — all as expected.
- **How to re-verify yourself:** `npm test`; or run the app and send two quick
  WhatsApp messages that together form one booking → expect a single clean reply.

---

## 7. Known limitations & recommended follow-ups (not in this scope)

These remain open (documented, not fixed — they were outside "fix the gaps"):

1. **Voice notes** still get a "text only" reply — no transcription. Common on
   WhatsApp in Italy; a Whisper/Meta-media step would let voice customers book.
2. **Reminders** (`/api/cron/reminders`) send **plain text**, which Meta rejects
   outside the 24 h window (most reminders). Needs an **approved template**; also
   it isn't scheduled anywhere (manual external cron).
3. **Staff alerts / handoff** use plain text to `STAFF_NOTIFY_NUMBER` — reliable
   only if staff messaged the number within 24 h; otherwise needs a template.
4. **Single-instance assumption:** coalescing timers and `runSerial` locks are
   in-memory — correct for one persistent Node process (the deployment target),
   would need Redis/DB locks if scaled horizontally.
5. **No AI status on `/api/health`** yet — failures are surfaced via the staff
   alert only. A health field would let a dashboard show "AI: down".

---

## 8. Deployment note (unchanged)

Per decision, the app keeps **Supabase Cloud** and runs on **Hetzner** as it does
today — no infra migration was performed. `COALESCE_WINDOW_MS` and
`STAFF_NOTIFY_NUMBER` are the only new/now-relevant env vars to set (both
optional; see [07-configuration.md](07-configuration.md)).
