import { describe, it, expect, vi, beforeEach } from "vitest";

const booking = vi.hoisted(() => ({
  listActiveServices: vi.fn(),
  formatServiceList: vi.fn(),
  checkAvailability: vi.fn(),
  bookAppointment: vi.fn(),
  rescheduleAppointment: vi.fn(),
  getAppointmentsForPhone: vi.fn(),
  cancelAppointment: vi.fn(),
}));
const escalation = vi.hoisted(() => ({ escalateAndNotify: vi.fn() }));

vi.mock("@/lib/booking", () => booking);
vi.mock("@/lib/escalation", () => escalation);

import { executeTool, TOOL_DEFINITIONS, type ToolContext } from "@/lib/tools";

const ctx: ToolContext = {
  customerPhone: "393330000000",
  customerName: "Mario",
  conversationId: "c1",
  now: new Date("2025-07-15T10:00:00Z"),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("TOOL_DEFINITIONS", () => {
  it("exposes the booking tools plus human escalation", () => {
    const names = TOOL_DEFINITIONS.filter((t) => t.type === "function")
      .map((t) => t.function.name)
      .sort();
    expect(names).toEqual([
      "book_appointment",
      "cancel_appointment",
      "check_availability",
      "escalate_to_human",
      "get_my_appointments",
      "list_services",
      "reschedule_appointment",
    ]);
  });
});

describe("executeTool routing", () => {
  it("list_services formats the active services", async () => {
    booking.listActiveServices.mockResolvedValue([{ name: "Taglio" }]);
    booking.formatServiceList.mockReturnValue("• Taglio");
    expect(await executeTool("list_services", {}, ctx)).toBe("• Taglio");
  });

  it("check_availability returns JSON with message/service/options", async () => {
    booking.checkAvailability.mockResolvedValue({
      ok: true,
      message: "Orari disponibili",
      serviceName: "Taglio donna",
      options: [{ iso: "2025-07-15T08:00:00.000Z", label: "10:00", stylists: ["Genny"] }],
    });
    const out = JSON.parse(await executeTool("check_availability", { service: "Taglio", date: "2025-07-15" }, ctx));
    expect(out).toEqual({
      message: "Orari disponibili",
      service: "Taglio donna",
      options: [{ iso: "2025-07-15T08:00:00.000Z", label: "10:00", stylists: ["Genny"] }],
      allFreeTimes: [],
    });
    expect(booking.checkAvailability).toHaveBeenCalledWith(
      expect.objectContaining({ service: "Taglio", date: "2025-07-15", now: ctx.now })
    );
  });

  it("book_appointment returns the booking message", async () => {
    booking.bookAppointment.mockResolvedValue({ ok: true, message: "Prenotazione confermata" });
    expect(
      await executeTool("book_appointment", { service: "Taglio", startIso: "2025-07-15T08:00:00.000Z" }, ctx)
    ).toBe("Prenotazione confermata");
  });

  it("get_my_appointments passes the customer phone", async () => {
    booking.getAppointmentsForPhone.mockResolvedValue("Nessun appuntamento");
    expect(await executeTool("get_my_appointments", {}, ctx)).toBe("Nessun appuntamento");
    expect(booking.getAppointmentsForPhone).toHaveBeenCalledWith("393330000000", ctx.now);
  });

  it("cancel_appointment returns the cancel message", async () => {
    booking.cancelAppointment.mockResolvedValue({ ok: true, message: "Appuntamento annullato" });
    expect(await executeTool("cancel_appointment", {}, ctx)).toBe("Appuntamento annullato");
  });

  it("escalate_to_human delegates to escalateAndNotify with the customer context", async () => {
    escalation.escalateAndNotify.mockResolvedValue({ ok: true, message: "Ho passato la conversazione a un operatore." });
    const out = await executeTool("escalate_to_human", { reason: "reclamo" }, ctx);
    expect(out).toContain("operatore");
    expect(escalation.escalateAndNotify).toHaveBeenCalledWith({
      conversationId: "c1",
      customerPhone: "393330000000",
      customerName: "Mario",
      reason: "reclamo",
    });
  });

  it("returns a message for an unknown tool", async () => {
    expect(await executeTool("does_not_exist", {}, ctx)).toContain("Strumento sconosciuto");
  });

  it("returns a safe fallback when a tool throws", async () => {
    booking.listActiveServices.mockRejectedValue(new Error("db down"));
    const out = await executeTool("list_services", {}, ctx);
    expect(out).toContain("errore tecnico");
  });
});
