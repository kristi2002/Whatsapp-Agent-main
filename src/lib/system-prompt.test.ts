import { describe, it, expect } from "vitest";
import { buildSalonSystemPrompt } from "@/lib/system-prompt";

describe("buildSalonSystemPrompt — upcoming-days calendar", () => {
  // Friday 10 July 2026 (Europe/Rome).
  const prompt = buildSalonSystemPrompt(new Date("2026-07-10T12:00:00Z"), null, null);

  it("labels today and tomorrow explicitly", () => {
    expect(prompt).toContain("venerdì 2026-07-10 (oggi)");
    expect(prompt).toContain("sabato 2026-07-11 (domani)");
  });

  it("maps giovedì to the correct date (16 July, NOT 17)", () => {
    expect(prompt).toContain("giovedì 2026-07-16");
    // 17 July is a Friday — it must never be labelled giovedì.
    expect(prompt).not.toContain("giovedì 2026-07-17");
  });

  it("instructs the model not to compute dates in its head", () => {
    expect(prompt).toContain("NON calcolare la data a mente");
  });
});
