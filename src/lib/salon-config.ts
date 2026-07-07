/**
 * Salon configuration — EDIT THIS FILE for your business.
 *
 * Dynamic data (services, stylists, opening hours) lives in the database so the
 * gestionale can manage it. This file holds the static identity + booking rules
 * the AI needs but that rarely change.
 */

export const SALON = {
  name: "Max&Tony Nazionale",
  // Salone donna + make-up. Address/phone migrated from the old n8n business_info.
  address: "Piazza Nazionale 92, 80143 Napoli (NA)",
  phone: "081 2356402",
  // No email in the old data; there was a WhatsApp contact 377 3377705.
  email: "",
  // IANA timezone — all appointment math and date formatting use this.
  timezone: "Europe/Rome",
  locale: "it-IT",
} as const;

/**
 * Values taken from the existing n8n workflow (workflow.v3.json).
 * The Meta phone-number ID is NOT a secret; the access token IS and is not in
 * that file — it's stored inside n8n and must be copied from there into .env.
 */
export const WHATSAPP = {
  phoneNumberId: "1142465592289974", // -> also set WHATSAPP_PHONE_NUMBER_ID in .env
  staffNotifyNumber: "393802871060", // WhatsApp number for staff handoff alerts
} as const;

export const BOOKING = {
  /** Slot granularity in minutes — start times are aligned to this grid. */
  slotGranularityMin: 15,
  /** Earliest lead time before an appointment can start, in minutes. */
  minLeadTimeMin: 60,
  /** How many days ahead customers may book. */
  maxAdvanceDays: 60,
  /** Max slots to offer per availability answer (keeps WhatsApp replies short). */
  maxSlotsReturned: 6,
} as const;
