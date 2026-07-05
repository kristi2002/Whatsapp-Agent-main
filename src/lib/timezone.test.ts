import { describe, it, expect } from "vitest";
import {
  zonedWallTimeToUtc,
  getZonedParts,
  timeToMinutes,
  formatTime,
  formatZoned,
} from "@/lib/timezone";

const TZ = "Europe/Rome";

describe("zonedWallTimeToUtc — DST correctness", () => {
  it("summer (CEST, UTC+2): 09:00 Rome = 07:00Z", () => {
    const utc = zonedWallTimeToUtc(2025, 7, 15, 9, 0, TZ);
    expect(utc.toISOString()).toBe("2025-07-15T07:00:00.000Z");
  });

  it("winter (CET, UTC+1): 09:00 Rome = 08:00Z", () => {
    const utc = zonedWallTimeToUtc(2025, 1, 15, 9, 0, TZ);
    expect(utc.toISOString()).toBe("2025-01-15T08:00:00.000Z");
  });

  it("midnight local maps to the correct instant", () => {
    const utc = zonedWallTimeToUtc(2025, 7, 15, 0, 0, TZ);
    expect(utc.toISOString()).toBe("2025-07-14T22:00:00.000Z");
  });
});

describe("getZonedParts", () => {
  it("returns wall-clock parts and weekday in the zone", () => {
    // 2025-07-15 12:00 Rome (Tuesday) == 10:00Z
    const instant = new Date("2025-07-15T10:00:00Z");
    const parts = getZonedParts(instant, TZ);
    expect(parts).toMatchObject({
      year: 2025,
      month: 7,
      day: 15,
      hour: 12,
      minute: 0,
      weekday: 2, // Tuesday
    });
  });

  it("weekday is 0 for Sunday", () => {
    // 2025-07-13 is a Sunday
    const instant = zonedWallTimeToUtc(2025, 7, 13, 12, 0, TZ);
    expect(getZonedParts(instant, TZ).weekday).toBe(0);
  });
});

describe("timeToMinutes", () => {
  it("parses HH:MM", () => {
    expect(timeToMinutes("09:30")).toBe(570);
  });
  it("parses HH:MM:SS (ignores seconds)", () => {
    expect(timeToMinutes("19:00:00")).toBe(1140);
  });
  it("handles midnight", () => {
    expect(timeToMinutes("00:00")).toBe(0);
  });
});

describe("formatting helpers", () => {
  it("formatTime renders the zoned wall-clock time", () => {
    expect(formatTime(new Date("2025-07-15T07:00:00Z"), TZ, "it-IT")).toBe("09:00");
  });
  it("formatZoned produces a non-empty localized string", () => {
    const s = formatZoned(new Date("2025-07-15T07:00:00Z"), TZ, "it-IT");
    expect(typeof s).toBe("string");
    expect(s.length).toBeGreaterThan(0);
    expect(s).toContain("09:00");
  });
});
