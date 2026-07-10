# 02 — Agent Logic: The Full Scheme

> **This is the most important document in this set.** It explains, end to end,
> how the WhatsApp AI agent receives a message, decides what to do, talks to the
> database through tools, and replies — including every safety gate that keeps it
> from lying to a customer.

The agent is an **Italian-speaking hair-salon booking assistant** ("Max&Tony
Nazionale"). It runs entirely inside the Next.js app — there is no n8n, no
external orchestrator. A customer chats over WhatsApp; the agent answers, checks
real availability, and books/reschedules/cancels appointments in the shared
Supabase database that the staff dashboard (*gestionale*) also uses.

---

## 1. The 10,000-foot view

```
Customer (WhatsApp)
  │  "Ciao, vorrei un taglio donna venerdì pomeriggio"
  ▼
Meta WhatsApp Cloud API
  │  POST (signed) with the message payload
  ▼
POST /api/webhook  ──────────────►  returns 200 "received" in <1s (no waiting)
  │                                  (Meta retries if we're slow → duplicates)
  │  fire-and-forget
  ▼
processEvent()  ── per-phone serialization ──►  processMessage()
  │
  ├─ find/create conversation, store user message (dedup on whatsapp_msg_id)
  ├─ if mode = "human"  → STOP (staff replies from the dashboard)
  ├─ load last 20 messages as history
  ▼
getAIResponse(history, ctx)   ← the tool-calling loop (src/lib/ai.ts)
  │
  │  system prompt (Italian, salon identity, live opening hours, "now", name)
  │  + history + TOOL DEFINITIONS
  ▼
OpenRouter (AI_MODEL)  ⇄  tools: list_services / check_availability /
  │  (up to 5 rounds)       book_appointment / reschedule_appointment /
  │                         get_my_appointments / cancel_appointment
  │                              │
  │                              ▼  each tool runs REAL DB work via src/lib/booking.ts
  │                         (availability engine, exclusion constraint, etc.)
  ▼
finalize(reply)  ← safety gate: block a fake "prenotazione confermata"
  ▼
sendWhatsAppMessage(phone, reply)  → Meta Graph API → customer
  │
  └─ store assistant message, bump conversation.updated_at
        ▼
   Dashboard + gestionale update live (Supabase Realtime)
```

**Key design choices**
- **Reply 200 immediately, process in the background.** Meta's webhook timeout is
  ~5 s; if we blocked on the AI + booking we'd time out and Meta would re-deliver,
  causing duplicate replies. This only works because the app runs as a
  **persistent Node server** (Coolify), not serverless — `runtime = "nodejs"` is
  pinned on the webhook route.
- **The model never invents data.** Services, prices, availability and bookings
  all come from tools that hit the database. The prompt forbids fabricating times.
- **The code, not the model, is the source of truth for "did it book?"** A final
  gate blocks any confirmation message unless a booking tool actually succeeded.

---

## 2. Files that make up the agent

| File | Responsibility |
|---|---|
| `src/app/api/webhook/route.ts` | Thin HTTP wrapper: GET verification, POST signature-check + fire-and-forget. |
| `src/lib/webhook.ts` | `verifySignature`, `processEvent`, `ingestMessage`, `scheduleReply` (coalescing, §3.4), `generateAndSendReply`, per-phone serialization, AI-failure staff alert. The testable core. |
| `src/lib/ai.ts` | `getAIResponse` — the tool-calling loop + the anti-hallucination confirmation gate (DB-aware, §4.3) + the escalation safety net (§9.2). |
| `src/lib/tools.ts` | Tool JSON schemas (`TOOL_DEFINITIONS`, 7 tools) + `executeTool` dispatcher. |
| `src/lib/escalation.ts` | `escalateAndNotify` — shared human-handoff (flip mode + alert staff), used by the tool and the safety net. |
| `src/lib/booking.ts` | Real DB access: services, availability, book/reschedule/cancel, opening-hours text. |
| `src/lib/availability.ts` | Pure slot-computation engine (no I/O). |
| `src/lib/timezone.ts` | DST-safe UTC ⇄ Europe/Rome helpers (Intl only, no deps). |
| `src/lib/system-prompt.ts` | Builds the Italian system prompt (injects now, name, live hours). |
| `src/lib/salon-config.ts` | Static salon identity + booking rules (granularity, lead time, etc.). |
| `src/lib/whatsapp.ts` | `sendWhatsAppMessage` — Meta Graph API POST; throws on non-2xx. |
| `src/lib/supabase.ts` | Lazily-constructed service-role Supabase client. |

---

## 3. Inbound path in detail (`src/lib/webhook.ts`)

### 3.1 Signature verification (route)
`POST /api/webhook` reads the **raw** body (needed for HMAC) and calls
`verifySignature(rawBody, "x-hub-signature-256")`:
- Computes `sha256=HMAC(WHATSAPP_APP_SECRET, rawBody)` and compares with
  `crypto.timingSafeEqual`.
- **If `WHATSAPP_APP_SECRET` is unset → verification is skipped (returns `true`).**
  This is deliberate so local dev / the smoke test work without signing. **Set it
  in production.**
- Invalid signature → `401`, nothing processed.

Then it `JSON.parse`s and calls `processEvent(body)` **without awaiting** (returns
`{status:"received"}` right away).

### 3.2 Per-phone serialization (`runSerial`)
Meta can deliver several messages for the same customer nearly simultaneously.
Processing them concurrently could double-book or interleave the conversation.
`runSerial(phone, task)` keeps an **in-memory `Map<phone, Promise>`** and chains
each new task after the previous one for that phone. Correct for a **single
persistent Node instance** (the deployment target). It would need Redis/DB locks
if scaled horizontally.

### 3.3 `processEvent` → `ingestMessage` → (debounced) `generateAndSendReply`
Inbound handling is split into a fast **ingest** step and a debounced **reply**
step so a burst of messages is stored in order but answered once (see §3.4).

- `processEvent` ignores anything that isn't `object ===
  "whatsapp_business_account"`, and iterates **every** message in the batch (Meta
  may send several) so one bad message can't drop the others.
- **`ingestMessage(value, message)`** — serialized per phone (`runSerial`), fast,
  never runs the AI:
  1. **Find or create** the `conversations` row by `phone`. If the WhatsApp
     profile name changed, update it.
  2. **Non-text messages** (voice/image/location): if not in human mode, send a
     one-line "I can only read text" reply and stop. The AI is never run on them.
  3. **Store the user message** in `messages`. Insert error code `23505`
     (unique violation on `whatsapp_msg_id`) ⇒ **duplicate delivery → return**.
     This is the idempotency guard against Meta retries.
  4. Bump `conversation.updated_at`.
  5. **Human mode gate:** if `conversation.mode === "human"`, **return without
     replying** — staff will answer from the dashboard.
  6. **Typing indicator:** fire `sendTypingIndicator(whatsappMsgId)`
     (fire-and-forget) so the customer sees a native "typing…" bubble. See §9.1.
  7. **Schedule the debounced reply** (`scheduleReply`) — see §3.4.
- **`generateAndSendReply(snap)`** — runs after the coalescing window, serialized
  per phone:
  1. **Load history:** the most recent **20** messages, re-ordered chronologically
     (so a coalesced burst is answered together).
  2. Call `getAIResponse(history, ctx)`. Any thrown error → a safe Italian
     fallback message (the customer is *never* left without a reply) **and a
     rate-limited staff alert** via `STAFF_NOTIFY_NUMBER` (see §10).
  3. `sendWhatsAppMessage(phone, reply)`.
  4. Store the assistant message and bump `updated_at`.

**`ToolContext` (`ctx`) passed into the AI:**
```ts
{ customerPhone, customerName, conversationId, now: new Date() }
```

### 3.4 Message coalescing (debounced reply)
People type on WhatsApp in **bursts** — e.g. *"Vorrei un appuntamento oggi alle
16 per una piega a nome di Maria Paola"* immediately followed by *"Con Genny"*.
Answering each message as its own AI turn double-processes one intent: the agent
would book on the first turn, then produce a second (un-backed) "confermato" that
the safety gate turned into a confusing *"Scusa, non sono riuscito…"*.

`scheduleReply(phone)` fixes this at the root. Every ingested text message (agent
mode) **(re)starts a per-phone timer** of `COALESCE_WINDOW_MS` (default **2500 ms**,
`0` disables). Each new message within the window `clearTimeout`s the previous
timer, so **only the last message in a burst triggers the reply**, and the reply
sees the full history. Guarantees:

- **Nothing is dropped** — every message is still stored at ingest.
- **One reply per burst** — not one per message.
- The reply is wrapped in `runSerial(phone, …)` so two bursts can't produce
  overlapping answers, and it runs after any in-flight ingest for that phone.
- In-memory timers → correct for a **single persistent Node instance** (the
  deployment target), like `runSerial`.

---

## 4. The tool-calling loop (`src/lib/ai.ts`)

`getAIResponse` is where the "intelligence" lives. It is an **OpenAI-compatible
chat-completions loop** pointed at OpenRouter (`baseURL:
https://openrouter.ai/api/v1`), model from `AI_MODEL` (default in code:
`anthropic/claude-sonnet-4-20250514`; the deploy default is
`google/gemini-2.5-flash`).

### 4.1 Setup
1. Read the salon's **live opening hours** (`formatBusinessHours()`) and inject
   them into the system prompt so the model won't offer a closed day. Non-fatal:
   if it fails, the tools remain the hard guard.
2. Build messages: `[ system prompt , ...history ]`.

### 4.2 The loop (max `MAX_TOOL_ROUNDS = 5`)
For each round:
```
completion = openai.chat.completions.create({ model, messages, tools, tool_choice:"auto" })
choice = completion.choices[0].message
  ├─ no tool_calls → return finalize(choice.content)   // model is done, plain answer
  └─ has tool_calls:
       push the assistant turn (with its tool_calls) onto messages
       for each tool call:
         args = JSON.parse(call.function.arguments)
         result = executeTool(name, args, ctx, track)   // REAL DB work
         push { role:"tool", tool_call_id, content: result }
       // loop again so the model can read tool results and continue
```
If 5 rounds pass without a final text answer, it does **one more** completion
**without tools** to force a text reply, then `finalize()`s it.

### 4.3 The anti-hallucination confirmation gate (critical)
The model could *say* "Prenotazione confermata!" even if `book_appointment`
failed or was never called. That would be a lie to the customer. Two mechanisms
prevent it:

1. **`track()` callback** — every booking-mutating tool
   (`book_appointment`, `reschedule_appointment`) reports its real `ok` outcome.
   The loop records `bookingOk` / `bookingFailed` / `lastFailureMsg`.
2. **`finalize(text)`** — before returning any reply, if the text *looks like a
   fresh-booking confirmation* (matched by `CONFIRMATION_RE`, an Italian regex for
   "prenotazione confermata", "ho prenotato", "ti ho fissato l'appuntamento",
   etc.) **and** no booking actually succeeded this turn, the confirmation is
   **blocked** and replaced with the real failure message (or a safe retry
   prompt). A genuinely successful `book_appointment` sets `bookingOk = true`, so
   real bookings are never blocked.

> The regex is intentionally scoped to *new* bookings — reschedules say "spostato"
> and listings from `get_my_appointments` are not confirmations, so those pass.

**DB-aware exception (added).** A confirmation can be legitimate even when no
booking tool ran *this* turn — e.g. the customer split the request across two
messages, so the booking completed in the *previous* turn and this turn only
echoes "confermato". To avoid contradicting a real booking with a false "Scusa,
non sono riuscito…", the gate now checks the database before blocking: if
`hasRecentBooking(phone)` finds an upcoming appointment for that phone **created
in the last 5 minutes**, the confirmation is allowed through. It still blocks a
pure hallucination (no recent booking) and still blocks when a booking tool was
attempted and *failed* this turn (`bookingFailed`). See also the message
**coalescing** in §3.4, which prevents the split-message double-turn at the root.

---

## 5. The tools (`src/lib/tools.ts`)

The model is given seven functions. It decides *when* to call them; the code does
the real work and validation. All descriptions are in Italian (the model reads
them). Summary:

| Tool | Params | What it does | Mutates DB? |
|---|---|---|---|
| `list_services` | — | Returns the active service list with duration + price. | no |
| `check_availability` | `service`, `date` (YYYY-MM-DD), `stylist?` | Real free slots for that service/date. Returns **`options`** (a few curated times to suggest) **and `allFreeTimes`** (every free slot, with exact `iso`). | no |
| `book_appointment` | `service`, `startIso`, `stylist?`, `customerName?` | Re-checks the exact slot, resolves a free stylist, **inserts** the appointment. | **yes** |
| `reschedule_appointment` | `startIso`, `appointmentId?`, `stylist?`, `service?` | Moves an **existing** booking (same row) — never creates a duplicate. | **yes** |
| `get_my_appointments` | — | Lists the caller's future bookings (by phone). | no |
| `cancel_appointment` | `appointmentId?` | Cancels the caller's booking (sets status `cancelled`). | **yes** |
| `escalate_to_human` | `reason?` | Hands the conversation to a human: flips `conversations.mode` to `human` (agent stops auto-replying) and alerts `STAFF_NOTIFY_NUMBER`. See §9.2. | **yes** (mode) |

### 5.1 Why `check_availability` returns two lists
- **`options`** — a small, spread-across-the-day sample (max `BOOKING.maxSlotsReturned`
  = 6, prefers round `:00`/`:30` times) so the WhatsApp reply stays short and the
  model suggests 3–5 distinct times.
- **`allFreeTimes` / `allSlots`** — **every** genuinely-free start time. This lets
  the model correctly answer a *specific* request ("le 16:00?") — it looks up
  16:00 in `allFreeTimes` instead of wrongly assuming it's taken just because it
  wasn't in the suggested few. Booking validation also checks against this full
  list, so a free time is never wrongly rejected.

### 5.2 `executeTool` dispatcher
A `switch` on the tool name that calls the matching `booking.ts` function, wraps
booking-mutating results with `track()`, and returns a **string** back to the
model. Any thrown error is caught and returned as a generic Italian
"technical error, please retry / call the salon" message — the loop never crashes.

---

## 6. What the tools actually do — the booking layer (`src/lib/booking.ts`)

This is the bridge between the AI and the shared database. Because both the agent
and the gestionale write the **same `appointments` table**, a booking made by the
AI appears instantly in the staff calendar and vice-versa.

### 6.1 `checkAvailability`
1. Fuzzy-match the service name → service row (id/exact/substring both ways).
2. Validate the date window: not in the past, not beyond `BOOKING.maxAdvanceDays`
   (60 days).
3. Determine which stylists can do the service via `stylist_services`
   (**if a service has no rows there, everyone is capable**). If a specific
   stylist was requested but can't do it, say so and suggest who can.
4. Load the weekday's `business_hours` row; **closed** if missing / `is_closed` /
   no open+close time.
5. In parallel, load: existing `appointments` (`booked`+`completed`) overlapping
   the day, per-stylist `stylist_hours`, and `stylist_time_off` blocks.
6. Feed all of that to the pure `computeAvailability()` engine → free slots.
7. Group slots by time (which stylists are free at each), sample `options`, and
   expose `allSlots`.

### 6.2 `bookAppointment`
1. Match service, parse `startIso`, enforce `minLeadTimeMin` (60 min) lead time.
2. **Re-check availability at that exact slot** (defends against the slot being
   taken between suggestion and booking). Validates against `allSlots`.
3. If the exact time isn't free, return the **nearest free times** as
   `alternatives` (the model is told to offer these, not just say "unavailable").
4. Resolve the stylist (requested one, else first free at that slot).
5. `INSERT` into `appointments` with `source: "whatsapp"`, `status: "booked"`.
6. **The database is the final guard:** a Postgres **exclusion constraint**
   (`no_stylist_overlap`, via `btree_gist`) makes it *impossible* to double-book a
   stylist even under a race. A `23P01` error → clean "just taken, pick another".

### 6.3 `rescheduleAppointment`
Finds the appointment (by id, or the caller's single upcoming one), validates the
new slot **excluding this appointment's own current booking** (so a small shift is
allowed), and **updates the same row** (keeping the original stylist unless a new
one is asked for). Never creates a duplicate.

### 6.4 `cancelAppointment` / `getAppointmentsForPhone`
Self-service by phone number. Cancel sets `status = 'cancelled'` (soft — the row
stays for history). If the caller has multiple bookings and gives no id, the agent
asks which one.

---

## 7. Availability engine & timezone (`availability.ts`, `timezone.ts`)

`computeAvailability` is **pure** (no DB) and easy to test:
- Builds working intervals from the salon hours, **removing the midday break**
  (`break_start`/`break_end`, "pausa pranzo").
- Optionally intersects with **per-stylist hours** (`stylist_hours`); a stylist
  marked not-working that day is skipped.
- Walks the day on a `slotGranularityMin` (15 min) grid; a start is valid only if
  the **full service duration** fits before close and doesn't overlap any busy
  interval (appointments **or** time-off) for that stylist.
- Enforces `minLeadTimeMin` (no slots sooner than 60 min from now).
- All comparisons are on **absolute UTC instants**, so **DST is correct**
  (verified: 09:00 Rome = 07:00Z in July, 08:00Z in January).

`timezone.ts` does UTC ⇄ Europe/Rome using only `Intl.DateTimeFormat` (no
dependencies), with a two-pass correction so wall-clock times near DST boundaries
convert correctly.

---

## 8. The system prompt (`src/lib/system-prompt.ts`)

`buildSalonSystemPrompt(now, customerName, hoursLabel)` produces an Italian prompt
that is **rebuilt on every turn** so it always contains fresh context:
- **Current date/time** in `Europe/Rome` + today's ISO date (so the model can
  resolve "domani", "sabato prossimo").
- **The customer's name** from the WhatsApp profile ("don't ask for it, you know it").
- **Live opening hours** (from the DB) with a hard instruction never to offer a
  closed day / out-of-hours slot.
- **Salon identity** (name, address, phone, email) from `salon-config.ts`.
- **Booking rules of engagement**: always use tools, never invent times/prices;
  list *specific* distinct times (never ranges like "dalle 9 alle 11"); book
  immediately once the customer picks a time; only confirm after
  `book_appointment` succeeds; use `reschedule_appointment` for changes (never
  `book_appointment`, which would duplicate); one question at a time.
- **Limits**: no medical/dermatological advice; escalate hard cases to a phone
  call or a human operator.

---

## 9. Outbound & the human/agent handoff

- **Sending:** `sendWhatsAppMessage(to, body)` POSTs to
  `https://graph.facebook.com/v22.0/{PHONE_NUMBER_ID}/messages` with the access
  token; it **throws on non-2xx** so failures land in the logs.

### 9.1 Typing indicator (keeps the customer engaged during the tool loop)
The AI can take several seconds when it runs multiple tool rounds
(check_availability → book_appointment → …). To avoid leaving the customer
staring at a blank chat, `processMessage` fires
`sendTypingIndicator(whatsappMsgId)` **before** the AI loop (agent mode, text
messages only). It calls Meta's typing-indicator API
(`POST /messages` with `status:"read"`, the inbound `message_id`, and
`typing_indicator:{type:"text"}`), which shows a native "typing…" bubble for up
to **25 s or until the reply is sent** — whichever comes first — and also marks
the customer's message as **read**. It is **best-effort and never throws**, so it
can't delay or block the actual answer.

- **Two conversation modes** (`conversations.mode`):
  - **`agent`** (default) — the AI auto-replies as above.
  - **`human`** — the webhook stores the inbound message but does **not** run the
    AI. Staff read and reply from the dashboard chat (`/`), which calls
    `POST /api/conversations/[id]/send` (sends via Meta, stores as `assistant`).
    The mode is flipped with `PATCH /api/conversations/[id]`.
  - Staff can also send a manual message in **agent** mode (override) from the
    same UI.

### 9.2 AI-initiated escalation (`escalate_to_human`)
The agent can hand a conversation to staff **on its own** when the customer asks
for a person, is unhappy/angry, has a complaint, or the request is beyond the
tools. The model calls the `escalate_to_human` tool, which (via
`escalateAndNotify`, `src/lib/escalation.ts`):
1. Flips `conversations.mode` to `human` (`escalateToHuman` in `booking.ts`), so
   the webhook stops auto-replying and staff take over from the dashboard.
2. Sends a WhatsApp alert to **`STAFF_NOTIFY_NUMBER`** ("a customer needs an
   operator…") — best-effort, no-op if the number isn't set. This finally wires
   up the previously-dead staff-notify number.

**Enforcement safety net.** Models sometimes *narrate* a handoff ("ho inoltrato la
tua richiesta a un operatore") without actually calling the tool. Mirroring the
booking gate's "code is the source of truth" rule, `finalize()` in `ai.ts` runs an
`ESCALATION_RE` check: if the reply claims a handoff but `escalate_to_human` was
**not** called this turn, it performs the escalation anyway (flip mode + alert).
So a promised handoff always really happens. The system prompt also instructs the
model to always call the tool and never merely claim it.

### Appointment reminders (a second outbound channel)
`GET /api/cron/reminders?key=CRON_SECRET` (not automatic — you must schedule it)
messages booked appointments starting ~20–28 h out that haven't been reminded
(`reminder_sent_at IS NULL`), then stamps `reminder_sent_at`. Guarded by
`CRON_SECRET` (401 without it). **Outside Meta's 24 h service window this must use
an approved template, not plain text.**

---

## 10. Failure modes & guarantees

| Situation | Behaviour |
|---|---|
| Meta re-delivers a message | Duplicate `whatsapp_msg_id` → insert `23505` → ignored. |
| Two messages from the same phone at once | Serialized per phone (`runSerial`). |
| A burst of messages (one intent split across several) | **Coalesced** into a single AI turn (`COALESCE_WINDOW_MS`, §3.4) — one reply, no double-processing. |
| AI/model throws or times out | Customer gets the safe Italian fallback; nothing crashes; **staff alerted** (rate-limited, once / 15 min) via `STAFF_NOTIFY_NUMBER`. |
| OpenRouter key over quota / expired (HTTP 403) | Same as above — fallback to customer + staff alert. Fix the key/credit in OpenRouter. |
| Model claims a booking that didn't happen | Blocked by the `finalize()` confirmation gate — **unless** the DB shows a real recent booking for that phone (split-message case, §4.3), which is allowed through. |
| Model claims a human handoff without calling the tool | `finalize()` enforces it: flips to `human` + alerts staff (§9.2). |
| Slot taken between check and insert | DB exclusion constraint → clean "pick another". |
| Non-text message (voice/image) | One-line "text only" reply (agent mode); AI not run. |
| AI loop takes several seconds | Native "typing…" indicator shown up front (§9.1); customer isn't left staring at a blank chat. |
| Typing-indicator API fails | Swallowed (best-effort); the reply is unaffected. |
| `WHATSAPP_APP_SECRET` unset | Signature check skipped (dev only — set it in prod). |
| Tool errors internally | Caught; returns a generic error string to the model. |

---

## 11. Sequence diagram — a booking, start to finish

```
Customer        Meta         /api/webhook      webhook.ts        ai.ts + tools        booking.ts / DB
   │  "taglio    │                │                 │                  │                     │
   │   venerdì?" ├───POST────────►│                 │                  │                     │
   │             │                ├─verifySig, 200─►│ (fire & forget)  │                     │
   │             │                │                 ├─store user msg──────────────────────►  │
   │             │                │                 ├─mode=agent, history→ai.ts               │
   │             │                │                 │                  ├─LLM: check_availability
   │             │                │                 │                  ├──────────────────►  │ compute slots
   │             │                │                 │                  │◄──options+allSlots──┤
   │             │                │                 │                  ├─LLM proposes "10:00, 15:30, 17:00"
   │◄────────────┤◄───reply───────┤◄────────────────┤◄─sendWhatsApp────┤                     │
   │  "15:30"    ├───POST────────►│ ...             │                  ├─LLM: book_appointment(iso 15:30)
   │             │                │                 │                  ├──────────────────►  │ re-check + INSERT
   │             │                │                 │                  │◄──ok, apptId────────┤ (exclusion guard)
   │             │                │                 │                  ├─finalize(): bookingOk=true → allow
   │◄────────────┤◄─"Prenotazione confermata: …"────┤◄─sendWhatsApp────┤                     │
   │             │                │                 │                  │      → row visible in gestionale (Realtime)
```

---

## 12. Where to look next
- **Booking math & rules** in depth → [`03-booking-engine.md`](03-booking-engine.md).
- **Every table the tools read/write** → [`04-database-schema.md`](04-database-schema.md).
- **Config knobs** (model, lead time, salon identity, env) → [`07-configuration.md`](07-configuration.md).
- **System architecture / how the apps connect** → [`01-architecture.md`](01-architecture.md).
