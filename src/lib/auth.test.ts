import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  checkPassword,
  SESSION_TTL_SECONDS,
} from "@/lib/auth";

// AUTH_SECRET / DASHBOARD_PASSWORD come from vitest.config.ts `env`.

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe("session tokens", () => {
  it("creates a token that verifies", async () => {
    const token = await createSessionToken();
    expect(await verifySessionToken(token)).toBe(true);
  });

  it("rejects a tampered signature", async () => {
    const token = await createSessionToken();
    const [exp] = token.split(".");
    const forged = `${exp}.deadbeef`;
    expect(await verifySessionToken(forged)).toBe(false);
  });

  it("rejects a token with a bumped expiry (signature no longer matches)", async () => {
    const token = await createSessionToken();
    const sig = token.slice(token.indexOf(".") + 1);
    const future = Math.floor(Date.now() / 1000) + 999999;
    expect(await verifySessionToken(`${future}.${sig}`)).toBe(false);
  });

  it("rejects an expired token", async () => {
    const token = await createSessionToken();
    // Advance time past the TTL.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + (SESSION_TTL_SECONDS + 60) * 1000);
    expect(await verifySessionToken(token)).toBe(false);
  });

  it("rejects empty / malformed tokens", async () => {
    expect(await verifySessionToken(null)).toBe(false);
    expect(await verifySessionToken("")).toBe(false);
    expect(await verifySessionToken("nodot")).toBe(false);
    expect(await verifySessionToken(".onlysig")).toBe(false);
  });
});

describe("checkPassword", () => {
  it("accepts the configured password", async () => {
    expect(await checkPassword("test-password")).toBe(true);
  });

  it("rejects a wrong password", async () => {
    expect(await checkPassword("nope")).toBe(false);
    expect(await checkPassword("")).toBe(false);
  });

  it("throws when DASHBOARD_PASSWORD is unset", async () => {
    vi.stubEnv("DASHBOARD_PASSWORD", "");
    await expect(checkPassword("anything")).rejects.toThrow();
  });
});
