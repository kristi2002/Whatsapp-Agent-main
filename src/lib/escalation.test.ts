import { describe, it, expect, vi, beforeEach } from "vitest";

const booking = vi.hoisted(() => ({ escalateToHuman: vi.fn() }));
const whatsapp = vi.hoisted(() => ({ notifyStaff: vi.fn() }));
vi.mock("@/lib/booking", () => booking);
vi.mock("@/lib/whatsapp", () => whatsapp);

import { escalateAndNotify } from "@/lib/escalation";

const base = { conversationId: "c1", customerPhone: "393330000000", customerName: "Mario" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("escalateAndNotify", () => {
  it("flips to human and alerts staff when the handoff succeeds", async () => {
    booking.escalateToHuman.mockResolvedValue({ ok: true, message: "Ho passato la conversazione a un operatore." });
    const res = await escalateAndNotify({ ...base, reason: "reclamo" });
    expect(res.ok).toBe(true);
    expect(booking.escalateToHuman).toHaveBeenCalledWith({ conversationId: "c1" });
    expect(whatsapp.notifyStaff).toHaveBeenCalledTimes(1);
    expect(whatsapp.notifyStaff.mock.calls[0][0]).toContain("Mario");
    expect(whatsapp.notifyStaff.mock.calls[0][0]).toContain("reclamo");
  });

  it("does NOT alert staff when the handoff failed", async () => {
    booking.escalateToHuman.mockResolvedValue({ ok: false, message: "problema" });
    const res = await escalateAndNotify(base);
    expect(res.ok).toBe(false);
    expect(whatsapp.notifyStaff).not.toHaveBeenCalled();
  });
});
