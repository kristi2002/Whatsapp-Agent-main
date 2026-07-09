"use client";

import * as React from "react";
import { ArrowUp, ArrowDown, type LucideIcon } from "lucide-react";

/**
 * Trend pill for a period-over-period PERCENTAGE change. GREEN up / RED down /
 * muted flat. `value` is a REAL delta computed from data — never a placeholder.
 * Callers should omit the pill entirely when there is no prior-period base
 * (value would be null). Pass `title` for the comparison context.
 */
export function Delta({ value, title }: { value: number; title?: string }) {
  const tone =
    value > 0
      ? { bg: "var(--success-soft)", fg: "var(--success)" }
      : value < 0
      ? { bg: "var(--danger-soft)", fg: "var(--danger)" }
      : { bg: "var(--surface-2)", fg: "var(--text-muted)" };
  return (
    <span
      title={title}
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {value > 0 ? <ArrowUp size={11} /> : value < 0 ? <ArrowDown size={11} /> : null}
      {value > 0 ? `+${value}%` : value < 0 ? `${value}%` : "—"}
    </span>
  );
}

/**
 * Summary "stat" card used in the strips at the top of the dashboard pages
 * (Panoramica, Calendario, Clienti, …). Icon chip + big tabular number + label.
 * Values are always real, page-computed data — no fabricated trends.
 */
export function StatCard({
  icon: Icon,
  value,
  label,
  accent = false,
}: {
  icon?: LucideIcon;
  value: React.ReactNode;
  label: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div className="card p-4 flex items-center gap-3" style={{ boxShadow: "var(--shadow)" }}>
      {Icon && (
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}
        >
          <Icon size={17} />
        </div>
      )}
      <div className="min-w-0">
        <p
          className="text-xl font-semibold tabular-nums leading-none"
          style={{ color: accent ? "var(--accent)" : "var(--text)" }}
        >
          {value}
        </p>
        <p className="text-[11.5px] text-muted mt-1 truncate">{label}</p>
      </div>
    </div>
  );
}

/** Round avatar with initials, optionally ringed by a loyalty-tier gradient. */
export function Avatar({
  initials,
  size = 44,
  ring,
}: {
  initials: string;
  size?: number;
  ring?: "oro" | "platino" | "argento" | null;
}) {
  const gradient =
    ring === "oro"
      ? "conic-gradient(#d4a13a,#f0cf7a,#d4a13a)"
      : ring === "platino"
      ? "conic-gradient(#9db4c6,#dfe9f0,#9db4c6)"
      : ring === "argento"
      ? "conic-gradient(#b9b4bd,#e3dfe6,#b9b4bd)"
      : "var(--accent-soft)";
  return (
    <div className="rounded-full shrink-0" style={{ width: size, height: size, padding: 2, background: gradient }}>
      <div
        className="w-full h-full rounded-full flex items-center justify-center font-semibold"
        style={{
          background: "var(--accent-soft)",
          color: "var(--accent-soft-fg)",
          border: "2px solid var(--surface)",
          fontSize: size * 0.3,
        }}
      >
        {initials}
      </div>
    </div>
  );
}
