/**
 * Minimal session auth for the staff dashboard.
 *
 * A single shared password (DASHBOARD_PASSWORD) unlocks the dashboard. On login
 * we issue a signed, httpOnly cookie containing an expiry; middleware verifies
 * the signature on every protected request. Uses Web Crypto so the exact same
 * code runs in both the Edge middleware and Node route handlers.
 */

export const SESSION_COOKIE = "salon_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET is missing or too short (min 16 chars).");
  }
  return secret;
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(message)
  );
  return toHex(sig);
}

/** Constant-time string comparison. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Create a signed token that expires SESSION_TTL_SECONDS from now. */
export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const sig = await hmac(String(exp));
  return `${exp}.${sig}`;
}

/** Verify a token's signature and expiry. */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const exp = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) return false;
  const expected = await hmac(exp);
  return safeEqual(sig, expected);
}

/** Timing-safe check of a submitted password against DASHBOARD_PASSWORD. */
export async function checkPassword(input: string): Promise<boolean> {
  const expected = process.env.DASHBOARD_PASSWORD;
  if (!expected) throw new Error("DASHBOARD_PASSWORD is not set.");
  // Compare HMACs of both sides so length isn't leaked and timing is constant.
  const [a, b] = await Promise.all([hmac(input), hmac(expected)]);
  return safeEqual(a, b);
}
