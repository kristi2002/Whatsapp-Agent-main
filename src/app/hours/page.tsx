"use client";

import { useEffect, useState, useCallback } from "react";
import Shell from "@/components/Shell";
import type { BusinessHours } from "@/lib/types";

const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // display Monday-first

function hhmm(t: string | null) {
  return t ? t.slice(0, 5) : "";
}

export default function HoursPage() {
  const [rows, setRows] = useState<Record<number, BusinessHours>>({});
  const [loading, setLoading] = useState(true);
  const [savingDay, setSavingDay] = useState<number | null>(null);
  const [savedDay, setSavedDay] = useState<number | null>(null);

  const load = useCallback(async () => {
    const data: BusinessHours[] = await fetch("/api/hours").then((r) => r.json());
    const map: Record<number, BusinessHours> = {};
    for (let d = 0; d < 7; d++) {
      map[d] = data.find((r) => r.day_of_week === d) ?? { day_of_week: d, is_closed: true, open_time: null, close_time: null, break_start: null, break_end: null };
    }
    setRows(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function update(day: number, patch: Partial<BusinessHours>) {
    setRows((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function save(day: number) {
    setSavingDay(day);
    const r = rows[day];
    await fetch("/api/hours", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        day_of_week: day,
        is_closed: r.is_closed,
        open_time: hhmm(r.open_time) || null,
        close_time: hhmm(r.close_time) || null,
        break_start: hhmm(r.break_start) || null,
        break_end: hhmm(r.break_end) || null,
      }),
    });
    setSavingDay(null);
    setSavedDay(day);
    setTimeout(() => setSavedDay((d) => (d === day ? null : d)), 1500);
  }

  return (
    <Shell title="Orari di apertura" subtitle="Gli orari determinano gli slot disponibili proposti in chat.">
      {loading ? (
        <p className="text-sm text-white/40">Caricamento…</p>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "#141414" }}>
          {ORDER.map((day) => {
            const r = rows[day];
            return (
              <div key={day} className="flex flex-wrap items-center gap-4 px-5 py-3.5 border-b border-white/[0.05] last:border-0">
                <span className="text-sm text-white/90 w-28">{DAYS[day]}</span>
                <label className="flex items-center gap-2 text-xs text-white/50">
                  <input type="checkbox" checked={r.is_closed} onChange={(e) => update(day, { is_closed: e.target.checked })} className="accent-emerald-500" />
                  Chiuso
                </label>
                {!r.is_closed && (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-white/50">
                    <span>Apertura</span>
                    <input type="time" value={hhmm(r.open_time)} onChange={(e) => update(day, { open_time: e.target.value })} className="tinp" />
                    <span>Chiusura</span>
                    <input type="time" value={hhmm(r.close_time)} onChange={(e) => update(day, { close_time: e.target.value })} className="tinp" />
                    <span className="ml-2">Pausa</span>
                    <input type="time" value={hhmm(r.break_start)} onChange={(e) => update(day, { break_start: e.target.value })} className="tinp" />
                    <span>–</span>
                    <input type="time" value={hhmm(r.break_end)} onChange={(e) => update(day, { break_end: e.target.value })} className="tinp" />
                  </div>
                )}
                <button onClick={() => save(day)} disabled={savingDay === day} className="ml-auto px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-xs text-white/80 disabled:opacity-40">
                  {savingDay === day ? "…" : savedDay === day ? "✓ Salvato" : "Salva"}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <style>{`.tinp{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:4px 8px;font-size:12px;color:#fff;outline:none}.tinp:focus{border-color:rgba(16,185,129,0.5)}`}</style>
    </Shell>
  );
}
