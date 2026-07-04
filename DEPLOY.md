# Deploy Guide — Max&Tony Nazionale WhatsApp Agent (Hetzner + Coolify)

Follow top to bottom. Steps 1–5 stand up the app; step 6 tests it on the WhatsApp
test number; step 7 covers going live. Copy-paste env block is in §5.

---

## 0. What you already have (from Meta)
- App ID: `4092647910866661`
- WhatsApp test number: `+1 (555) 652-3157`
- Phone Number ID: `1142465592289974`
- WhatsApp Business Account ID: `1041062138271233`
- Test access token: already in `.env.local` (⚠️ temporary — expires ~24h, see §7)

---

## 1. Hetzner server
1. Create a Hetzner Cloud server in an **EU location** (Falkenstein/Nuremberg) for
   GDPR. Size: **CPX31 / 4 vCPU / 8 GB RAM** or larger — self-hosted Supabase is
   ~10 containers and wants the RAM.
2. Ubuntu 22.04/24.04. Add your SSH key.
3. Point two DNS records at the server IP:
   - `bot.iltuosalone.it`  → the app
   - `db.iltuosalone.it`   → Supabase Studio/API

## 2. Install Coolify
SSH in and run:
```bash
curl -fsSL https://coolify.io/install.sh | bash
```
Open `http://SERVER_IP:8000`, create the admin account, and connect your Git
provider (GitHub/GitLab) so Coolify can pull this repo.

## 3. Self-host Supabase on Coolify  → produces the 3 missing keys
1. Coolify → **Projects → New → Resource → Service → Supabase**.
2. Set a strong Postgres password and let it generate `JWT_SECRET`, the `anon`
   key and the `service_role` key.
3. Assign domain `db.iltuosalone.it`, enable HTTPS (Let's Encrypt), deploy.
4. Once up, open **Supabase Studio** and note three values — these fill the blanks
   in `.env.local` / §5:
   - **Project/API URL**  → `NEXT_PUBLIC_SUPABASE_URL`  (e.g. `https://db.iltuosalone.it`)
   - **anon public key**  → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role key** → `SUPABASE_SERVICE_ROLE_KEY`
5. **Run the schema:** Studio → **SQL Editor** → paste the entire contents of
   `supabase-schema.sql` → **Run**. This creates the tables, the anti-double-booking
   constraint, Realtime, and seeds services/stylists/hours.
   > Validated: this schema was executed against a real Postgres here — tables,
   > seed, and the exclusion constraint all pass.
6. **Edit the seed to the real salon** (or manage later from the gestionale):
   update the `services` (names/prices/durations), `stylists` (real names), and
   `business_hours` rows to match Max&Tony Nazionale.

## 4. Deploy the Next.js app
1. Coolify → **New → Application → from Git repository** → pick this repo/branch.
2. Build pack: **Nixpacks** (auto-detects Next.js). Confirm:
   - Install: `npm install`
   - Build: `npm run build`
   - Start: `npm run start`
   - Port: `3000`
3. Assign domain `bot.iltuosalone.it`, enable HTTPS.
4. Add the environment variables (§5), then **Deploy**.
5. It runs as a persistent Node server, so the webhook's "reply 200 immediately,
   process in the background" works correctly (no Meta retry / duplicate replies).

## 5. Environment variables (paste into Coolify → app → Environment)

⚠️ **Secrets are intentionally NOT in this committed file.** The real, filled-in
values live in `.env.local` (gitignored) and were provided in chat. Copy them
from there into Coolify. Below is the template (structure only).

```
WHATSAPP_ACCESS_TOKEN=            # from .env.local (temporary test token — rotate, §7)
WHATSAPP_PHONE_NUMBER_ID=1142465592289974
WHATSAPP_BUSINESS_ACCOUNT_ID=1041062138271233
WHATSAPP_VERIFY_TOKEN=            # from .env.local
WHATSAPP_APP_SECRET=             # from Meta App settings (§7); optional
STAFF_NOTIFY_NUMBER=393802871060
OPENROUTER_API_KEY=              # from .env.local
AI_MODEL=google/gemini-2.5-flash
NEXT_PUBLIC_SUPABASE_URL=https://db.testdemo.it
NEXT_PUBLIC_SUPABASE_ANON_KEY=   # from Supabase service → Environment Variables (§3)
SUPABASE_SERVICE_ROLE_KEY=       # from Supabase service → Environment Variables (§3)
DASHBOARD_PASSWORD=              # from .env.local
AUTH_SECRET=                     # from .env.local
PORT=3000
NEXT_PUBLIC_APP_URL=https://agent.testdemo.it
```

Never commit real values here — keep them in `.env.local` and in Coolify only.

## 6. Connect + test on the WhatsApp test number
1. Meta App → **WhatsApp → Configuration → Webhook → Edit**:
   - Callback URL: `https://bot.iltuosalone.it/api/webhook`
   - Verify token: `salon-4fa0026916cca690`
   - Save (Meta calls GET to verify — should succeed instantly).
2. Under **Webhook fields**, subscribe to **messages**.
3. Meta App → **WhatsApp → API Setup → "To"**: add your own WhatsApp number to the
   allowed recipient list (test numbers can only message allow-listed numbers).
4. From your phone, WhatsApp the test number `+1 (555) 652-3157`. Try:
   *"Ciao, vorrei prenotare un taglio donna per venerdì pomeriggio"*.
5. Expected: an Italian reply proposing real free slots; pick one; it books.
   Verify the row lands in Supabase → `appointments`, and the dashboard shows the
   conversation live.

## 7. Before going live (real salon number)
- **Permanent WhatsApp token.** The token in §5 is the test-number token and
  **expires in ~24h**. For production, add the real business number, then Meta
  Business → **System Users → Generate token** with `whatsapp_business_messaging`
  + `whatsapp_business_management`, and replace `WHATSAPP_ACCESS_TOKEN`.
- **App Secret.** Meta App → App settings → Basic → **App secret** → put it in
  `WHATSAPP_APP_SECRET` so incoming webhooks are signature-verified.
- **Enable RLS** on Supabase (the dashboard uses the public anon key in the
  browser for Realtime; without RLS that key can read table data directly).
- **Re-point the webhook** to production and add real staff/services data.
- Don't cut the live customer number over until the test-number round-trip in §6
  works end-to-end.

---

## Verification already done (offline)
- Schema + seed + anti-double-booking constraint: **executed on real Postgres, 9/9 pass.**
- Availability slot engine (DST, breaks, overlaps, lead time): **11/11 pass.**
- Dashboard auth (sign/verify, tamper, expiry, password): **9/9 pass.**
- AI tool-loop orchestration: **6/6 pass.**
- TypeScript: **clean across all modules.**

## Not verifiable from here (verify during §6)
- Live model tool-calling on `google/gemini-2.5-flash` (OpenRouter is not
  reachable from the build sandbox). If the bot chats but never proposes/books,
  switch `AI_MODEL` to `anthropic/claude-3.7-sonnet` or `openai/gpt-4o` — both
  are more reliable at function-calling — and redeploy.
- The first real WhatsApp send (needs the live token + Meta webhook).
