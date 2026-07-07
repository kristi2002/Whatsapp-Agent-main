/** Loyalty tier from a points balance. tone maps to the Badge component tones. */
export function loyaltyTier(points: number): { name: string; tone: "neutral" | "warning" | "accent" | "info" } {
  if (points >= 600) return { name: "Platino", tone: "info" };
  if (points >= 300) return { name: "Oro", tone: "warning" };
  if (points >= 100) return { name: "Argento", tone: "neutral" };
  return { name: "Bronzo", tone: "accent" };
}
