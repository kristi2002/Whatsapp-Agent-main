"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { CalendarCheck, CalendarOff } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button } from "@/components/ui";
import { StatCard } from "@/components/kit";
import { TimeField } from "@/components/pickers";
import type { BusinessHours } from "@/lib/types";

const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function HoursPage() {
  const [rows, setRows] = useState<Record<number, BusinessHours>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const data: BusinessHours[] = await fetch("/api/hours").then((r) => r.json());
    const map: Record<number, BusinessHours> = {};
    for (let d = 0; d < 7; d++) map[d] = data.find((r) => r.day_of_week === d) ?? { day_of_week: d, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null };
    setRows(map); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  function update(day: number, patch: Partial<BusinessHours>) { setRows((p) => ({ ...p, [day]: { ...p[day], ...patch } })); }

  const summary = useMemo(() => {
    const all = Object.values(rows);
    return { open: all.filter((r) => !r.is_closed).length, closed: all.filter((r) => r.is_closed).length };
  }, [rows]);

  async function saveAll() {
    setSaving(true);
    for (const d of ORDER) {
      const r = rows[d];
      await fetch("/api/hours", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day_of_week: d, is_closed: r.is_closed, open_time: hhmm(r.open_time) || null, close_time: hhmm(r.close_time) || null, break_start: hhmm(r.break_start) || null, break_end: hhmm(r.break_end) || null }) });
    }
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 1800);
  }

  return (
    <AppShell title="Orari di apertura" subtitle="Gli orari determinano gli slot proposti in chat." actions={<Button size="sm" onClick={saveAll} disabled={saving}>{saving ? "Salvataggio…" : saved ? "✓ Salvato" : "Salva orari"}</Button>}>
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard icon={CalendarCheck} value={summary.open} label="Giorni aperti" />
          <StatCard icon={CalendarOff} value={summary.closed} label="Giorni di chiusura" />
        </div>
      )}
      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <Card className="divide-y" style={{ borderColor: "var(--border)" }}>
          {ORDER.map((day) => {
            const r = rows[day];
            const open = !r.is_closed;
            return (
              <div key={day} className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center gap-3" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="flex items-center gap-3 sm:w-44 shrink-0">
                  <span className="text-sm font-medium w-24" style={{ color: "var(--text)" }}>{DAYS[day]}</span>
                  <button onClick={() => update(day, { is_closed: open })} className="inline-flex items-center gap-2 h-7 px-2.5 rounded-full text-xs font-medium transition-colors" style={open ? { background: "var(--success-soft)", color: "var(--success)" } : { background: "var(--surface-2)", color: "var(--text-muted)" }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: open ? "var(--success)" : "var(--text-faint)" }} />{open ? "Aperto" : "Chiuso"}
                  </button>
                </div>
                {open ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-muted">
                    <div className="flex items-center gap-2"><span className="w-16 sm:w-auto">Apertura</span><div className="w-28"><TimeField value={hhmm(r.open_time)} onChange={(v) => update(day, { open_time: v })} /></div></div>
                    <div className="flex items-center gap-2"><span>Chiusura</span><div className="w-28"><TimeField value={hhmm(r.close_time)} onChange={(v) => update(day, { close_time: v })} /></div></div>
                    <div className="flex items-center gap-2 sm:ml-2"><span>Pausa</span><div className="w-28"><TimeField value={hhmm(r.break_start)} onChange={(v) => update(day, { break_start: v })} /></div><span>–</span><div className="w-28"><TimeField value={hhmm(r.break_end)} onChange={(v) => update(day, { break_end: v })} /></div></div>
                  </div>
                ) : <span className="text-sm text-faint">Chiuso tutto il giorno</span>}
              </div>
            );
          })}
        </Card>
      )}
    </AppShell>
  );
}
