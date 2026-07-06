"use client";

import { useEffect, useState, useCallback } from "react";
import AppShell from "@/components/AppShell";
import { Card } from "@/components/ui";
import type { BusinessHours } from "@/lib/types";

const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function HoursPage() {
  const [rows, setRows] = useState<Record<number, BusinessHours>>({});
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [savedDay, setSavedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data: BusinessHours[] = await fetch("/api/hours").then((r) => r.json());
    const map: Record<number, BusinessHours> = {};
    for (let d = 0; d < 7; d++) map[d] = data.find((r) => r.day_of_week === d) ?? { day_of_week: d, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null };
    setRows(map); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  function update(day: number, patch: Partial<BusinessHours>) { setRows((p) => ({ ...p, [day]: { ...p[day], ...patch } })); }

  async function save(day: number) {
    setSavingDay(day);
    const r = rows[day];
    await fetch("/api/hours", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ day_of_week: day, is_closed: r.is_closed, open_time: hhmm(r.open_time) || null, close_time: hhmm(r.close_time) || null, break_start: hhmm(r.break_start) || null, break_end: hhmm(r.break_end) || null }) });
    setSavingDay(null); setSavedDay(day); setTimeout(() => setSavedDay((d) => (d === day ? null : d)), 1500);
  }

  const tinp = { background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 8, padding: "5px 9px", fontSize: 13, color: "var(--text)", outline: "none" } as const;

  return (
    <AppShell title="Orari di apertura" subtitle="Gli orari determinano gli slot disponibili proposti in chat.">
      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <Card className="overflow-hidden">
          {ORDER.map((day) => {
            const r = rows[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-4 px-5 py-3.5 bd-b last:border-b-0">
                <span className="text-sm w-24 font-medium" style={{ color: "var(--text)" }}>{DAYS[day]}</span>
                <label className="flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={r.is_closed} onChange={(e) => update(day, { is_closed: e.target.checked })} style={{ accentColor: "var(--accent)" }} /> Chiuso</label>
                {!r.is_closed && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                    <span>Apertura</span><input type="time" value={hhmm(r.open_time)} onChange={(e) => update(day, { open_time: e.target.value })} style={tinp} />
                    <span>Chiusura</span><input type="time" value={hhmm(r.close_time)} onChange={(e) => update(day, { close_time: e.target.value })} style={tinp} />
                    <span className="ml-2">Pausa</span><input type="time" value={hhmm(r.break_start)} onChange={(e) => update(day, { break_start: e.target.value })} style={tinp} />
                    <span>–</span><input type="time" value={hhmm(r.break_end)} onChange={(e) => update(day, { break_end: e.target.value })} style={tinp} />
                  </div>
                )}
                <button onClick={() => save(day)} disabled={savingDay === day} className="ml-auto h-8 px-3 rounded-lg text-xs font-medium hover-surface disabled:opacity-40" style={{ border: "1px solid var(--border)", color: savedDay === day ? "var(--success)" : "var(--text-muted)" }}>{savingDay === day ? "…" : savedDay === day ? "✓ Salvato" : "Salva"}</button>
              </div>
            );
          })}
        </Card>
      )}
    </AppShell>
  );
}
