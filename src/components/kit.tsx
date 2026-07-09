"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";

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
