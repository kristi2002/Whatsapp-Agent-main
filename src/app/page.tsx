"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import Shell from "@/components/Shell";
import type { OverviewStats, AppointmentWithRelations } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}

const STATUS_LABEL: Record<string, string> = {
  booked: "Prenotato",
  completed: "Completato",
  cancelled: "Annullato",
  no_show: "Assente",
};

function StatCard({ label, value, href }: { label: string; value: number; href?: string }) {
  const inner = (
    <div className="rounded-xl border border-white/[0.06] p-5 h-full transition-colors hover:border-white/[0.12]" style={{ background: "#141414" }}>
      <p className="text-3xl font-semibold text-white">{value}</p>
      <p className="text-xs text-white/40 mt-1">{label}</p>
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/overview");
    const data = await res.json();
    setStats(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const today: AppointmentWithRelations[] = stats?.today ?? [];

  return (
    <Shell title="Panoramica" subtitle={new Date().toLocaleDateString("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" })}>
      {loading ? (
        <p className="text-sm text-white/40">Caricamento…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            <StatCard label="Appuntamenti oggi" value={stats?.todayCount ?? 0} href="/calendar" />
            <StatCard label="Prossimi 7 giorni" value={stats?.upcomingCount ?? 0} href="/calendar" />
            <StatCard label="Servizi attivi" value={stats?.activeServices ?? 0} href="/services" />
            <StatCard label="Staff attivo" value={stats?.activeStylists ?? 0} href="/stylists" />
          </div>

          <h2 className="text-sm font-semibold text-white/80 mb-3">Appuntamenti di oggi</h2>
          <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "#141414" }}>
            {today.length === 0 ? (
              <p className="text-sm text-white/30 px-5 py-8 text-center">Nessun appuntamento per oggi.</p>
            ) : (
              today.map((a) => (
                <div key={a.id} className="flex items-center gap-4 px-5 py-3 border-b border-white/[0.05] last:border-0">
                  <span className="text-sm font-medium text-emerald-400 w-14 tabular-nums">{fmtTime(a.starts_at)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white/90 truncate">{a.service?.name ?? "Servizio"}</p>
                    <p className="text-xs text-white/40 truncate">{a.customer_name || a.customer_phone} · {a.stylist?.name ?? ""}</p>
                  </div>
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded bg-white/[0.06] text-white/50">{STATUS_LABEL[a.status] ?? a.status}</span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </Shell>
  );
}
