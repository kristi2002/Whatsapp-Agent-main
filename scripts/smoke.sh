#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Local smoke test — verifies a running dev/prod server answers the routes that
# do NOT require auth. Run `npm run dev` (or `npm start`) in another terminal
# first. This does NOT need real Meta/OpenRouter/Supabase credentials for the
# health + webhook-verify checks; the message POST needs the app fully wired.
#
#   BASE_URL=http://localhost:3000 ./scripts/smoke.sh
# ---------------------------------------------------------------------------
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
VERIFY_TOKEN="${WHATSAPP_VERIFY_TOKEN:-test-verify-token}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

echo "Smoke testing ${BASE_URL}"

# 1. Health endpoint (public) -> 200 {"status":"ok"}
echo "[1] GET /api/health"
body="$(curl -fsS "${BASE_URL}/api/health")" || fail "health request failed"
echo "$body" | grep -q '"status":"ok"' && pass "health ok" || fail "unexpected health body: $body"

# 2. Webhook verification (public) -> echoes hub.challenge when the token matches
echo "[2] GET /api/webhook (verification handshake)"
challenge="smoke-$RANDOM"
resp="$(curl -fsS "${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=${challenge}")" \
  || fail "webhook verify request failed (is WHATSAPP_VERIFY_TOKEN=${VERIFY_TOKEN} set?)"
[ "$resp" = "$challenge" ] && pass "challenge echoed" || fail "expected '$challenge', got '$resp'"

# 3. Webhook rejects a wrong verify token -> 403
echo "[3] GET /api/webhook with wrong token -> 403"
code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/webhook?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=x")"
[ "$code" = "403" ] && pass "rejected (403)" || fail "expected 403, got $code"

# 4. Inbound message POST -> 200 {"status":"received"} (needs WHATSAPP_APP_SECRET
#    unset locally so the signature check is skipped; otherwise sign the body).
echo "[4] POST /api/webhook (sample inbound message)"
resp="$(curl -fsS -X POST "${BASE_URL}/api/webhook" \
  -H 'Content-Type: application/json' \
  --data-binary @"${DIR}/sample-webhook-payload.json")" || fail "webhook POST failed"
echo "$resp" | grep -q '"status":"received"' && pass "message accepted" \
  || fail "unexpected POST body: $resp"

# 5. Protected route is gated -> 401 without a session cookie
echo "[5] GET /api/conversations without auth -> 401"
code="$(curl -s -o /dev/null -w '%{http_code}' "${BASE_URL}/api/conversations")"
[ "$code" = "401" ] && pass "protected (401)" || fail "expected 401, got $code"

echo
echo "All smoke checks passed."
