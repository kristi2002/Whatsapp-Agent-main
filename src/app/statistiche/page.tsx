"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Euro, CalendarCheck, Receipt, UserPlus } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui";

const TZ = "Europe/Rome";
const euro = (c: number) => "€" + (c / 100).toFixed(2).replace(".", ",");
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); };

interface Stats {
  revenue_cents: number; salesCount: number; avgTicket_cents: number;
  apptTotal: number; completed: number; noShow: number; booked: number; noShowRate: number;
  newClients: number; returning: number;
  byOperator: { name: string; count: number }[]; byService: { name: string; count: number }[];
  daily: { label: string; revenue_cents: number; appts: number }[];
}
const PRESETS = [{ k: "7", label: "7 giorni", from: () => daysAgo(6) }, { k: "30", label: "30 giorni", from: () => daysAgo(29) }, { k: "90", label: "90 giorni", from: () => daysAgo(89) }];

function Bars({ data, valueKey, fmt }: { data: { label: string; revenue_cents: number; appts: number }[]; valueKey: "revenue_cents" | "appts"; fmt: (n: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d[valueKey]));
  return (
    <div className="flex items-end gap-1 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center justify-end group relative" style={{ height: "100%" }}>
          <div className="absolute -top-6 opacity-0 group-hover:opacity-100 transition-opacity text-[10px] px-1.5 py-0.5 rounded whitespace-nowrap" style={{ background: "var(--surface-2)", color: "var(--text)" }}>{fmt(d[valueKey])}</div>
          <motion.div initial={{ height: 0 }} animate={{ height: `${(d[valueKey] / max) * 100}%` }} transition={{ delay: i * 0.01 }} className="w-full rounded-t min-h-[2px]" style={{ background: "var(--accent)" }} />
        </div>
      ))}
    </div>
  );
}

function RankBars({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.name} className="flex items-center gap-3">
          <span className="text-sm w-28 truncate shrink-0" style={{ color: "var(--text)" }}>{it.name}</span>
          <div className="flex-1 h-5 rounded" style={{ background: "var(--surface-2)" }}><div className="h-5 rounded" style={{ width: `${(it.count / max) * 100}%`, background: "var(--accent-soft)" }} /></div>
          <span className="text-xs text-muted w-6 text-right tabular-nums">{it.count}</span>
        </div>
      ))}
      {items.length === 0 && <p className="text-sm text-faint">Nessun dato.</p>}
    </div>
  );
}

export default function StatistichePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState("30");
  const [metric, setMetric] = useState<"revenue_cents" | "appts">("revenue_cents");

  const load = useCallback(async () => {
    setLoading(true);
    const from = PRESETS.find((p) => p.k === preset)?.from() ?? daysAgo(29);
    const d = await fetch(`/api/stats?from=${from}&to=${todayStr()}`).then((r) => r.json());
    setStats(d); setLoading(false);
  }, [preset]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const kpis = stats ? [
    { label: "Incasso", value: euro(stats.revenue_cents), icon: Euro },
    { label: "Appuntamenti", value: String(stats.apptTotal), icon: CalendarCheck },
    { label: "Ticket medio", value: euro(stats.avgTicket_cents), icon: Receipt },
    { label: "Clienti nuovi", value: String(stats.newClients), icon: UserPlus },
  ] : [];

  return (
    <AppShell title="Statistiche" subtitle="Andamento del salone" actions={
      <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        {PRESETS.map((p) => (<button key={p.k} onClick={() => setPreset(p.k)} className="px-2.5 h-9 text-xs font-medium transition-colors" style={preset === p.k ? { background: "var(--accent)", color: "var(--accent-fg)" } : { color: "var(--text-muted)" }}>{p.label}</button>))}
      </div>
    }>
      {loading || !stats ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            {kpis.map((k) => { const Icon = k.icon; return (
              <Card key={k.label} className="p-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Icon size={18} /></div>
                <p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{k.value}</p>
                <p className="text-xs text-muted mt-1">{k.label}</p>
              </Card>
            ); })}
          </div>

          <Card className="p-5 mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Andamento</h2>
              <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <button onClick={() => setMetric("revenue_cents")} className="px-2.5 h-7 text-xs" style={metric === "revenue_cents" ? { background: "var(--accent)", color: "var(--accent-fg)" } : { color: "var(--text-muted)" }}>Incasso</button>
                <button onClick={() => setMetric("appts")} className="px-2.5 h-7 text-xs" style={metric === "appts" ? { background: "var(--accent)", color: "var(--accent-fg)" } : { color: "var(--text-muted)" }}>Appuntamenti</button>
              </div>
            </div>
            <Bars data={stats.daily} valueKey={metric} fmt={metric === "revenue_cents" ? euro : (n) => String(n)} />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="p-5"><h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Appuntamenti per operatore</h2><RankBars items={stats.byOperator} /></Card>
            <Card className="p-5"><h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Servizi più richiesti</h2><RankBars items={stats.byService} /></Card>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Card className="p-5"><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{stats.noShowRate}%</p><p className="text-xs text-muted mt-1">Tasso di no-show</p></Card>
            <Card className="p-5"><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{stats.completed}</p><p className="text-xs text-muted mt-1">Completati</p></Card>
            <Card className="p-5"><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{stats.newClients} / {stats.returning}</p><p className="text-xs text-muted mt-1">Nuovi / abituali</p></Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
