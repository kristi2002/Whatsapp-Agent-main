"use client";

import * as React from "react";
import { Calendar as CalIcon, Clock, ChevronLeft, ChevronRight, X } from "lucide-react";

const TZ = "Europe/Rome";
const WD = ["lu", "ma", "me", "gi", "ve", "sa", "do"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];
const pad = (n: number) => String(n).padStart(2, "0");
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());

/** Lightweight themed popover with click-outside handling. */
function Popover({ trigger, children, open, setOpen }: { trigger: React.ReactNode; children: React.ReactNode; open: boolean; setOpen: (v: boolean) => void }) {
  return (
    <div className="relative">
      <div onClick={() => setOpen(!open)}>{trigger}</div>
      {open && (
        <>
          <button aria-hidden className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 rounded-xl p-2" style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "var(--shadow)" }}>{children}</div>
        </>
      )}
    </div>
  );
}

const triggerCls = "inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm cursor-pointer select-none w-full";
const triggerStyle: React.CSSProperties = { background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" };

export function DateField({ value, onChange, min, max, placeholder = "Seleziona data" }: { value: string; onChange: (v: string) => void; min?: string; max?: string; placeholder?: string }) {
  const [open, setOpen] = React.useState(false);
  const base = value || todayStr();
  const [vy, vm] = base.split("-").map(Number);
  const [view, setView] = React.useState({ y: vy, m: vm }); // m: 1-12
  React.useEffect(() => { if (open) { const b = (value || todayStr()).split("-").map(Number); setView({ y: b[0], m: b[1] }); } }, [open, value]);

  const first = new Date(Date.UTC(view.y, view.m - 1, 1));
  const startWd = (first.getUTCDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(Date.UTC(view.y, view.m, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(startWd).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const label = value ? new Date(value + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "long", year: "numeric" }) : placeholder;
  function shiftMonth(d: number) { let m = view.m + d, y = view.y; if (m < 1) { m = 12; y--; } if (m > 12) { m = 1; y++; } setView({ y, m }); }
  function pick(day: number) { const s = `${view.y}-${pad(view.m)}-${pad(day)}`; if ((min && s < min) || (max && s > max)) return; onChange(s); setOpen(false); }

  return (
    <Popover open={open} setOpen={setOpen} trigger={<div className={triggerCls} style={triggerStyle}><CalIcon size={15} className="text-muted shrink-0" /><span className={value ? "" : "text-faint"}>{label}</span></div>}>
      <div className="w-64">
        <div className="flex items-center justify-between px-1 mb-2">
          <span className="text-sm font-medium capitalize" style={{ color: "var(--text)" }}>{MONTHS[view.m - 1]} {view.y}</span>
          <div className="flex gap-1">
            <button onClick={() => shiftMonth(-1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover-surface"><ChevronLeft size={15} /></button>
            <button onClick={() => shiftMonth(1)} className="w-7 h-7 rounded-lg flex items-center justify-center text-muted hover-surface"><ChevronRight size={15} /></button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">{WD.map((w) => <div key={w} className="text-[10px] text-center text-faint uppercase">{w}</div>)}</div>
        <div className="grid grid-cols-7 gap-0.5">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const s = `${view.y}-${pad(view.m)}-${pad(d)}`;
            const sel = s === value, isToday = s === todayStr(), disabled = (min && s < min) || (max && s > max);
            return <button key={i} disabled={!!disabled} onClick={() => pick(d)} className="h-8 rounded-lg text-sm disabled:opacity-25 disabled:cursor-not-allowed transition-colors" style={sel ? { background: "var(--accent)", color: "var(--accent-fg)", fontWeight: 600 } : { color: "var(--text)", background: isToday ? "var(--surface-2)" : "transparent" }}>{d}</button>;
          })}
        </div>
        <div className="flex justify-between mt-2 px-1">
          <button onClick={() => { onChange(""); setOpen(false); }} className="text-xs text-muted hover:text-[var(--danger)]">Cancella</button>
          <button onClick={() => pick(Number(todayStr().split("-")[2]))} className="text-xs text-accent hover:opacity-70" onMouseDown={(e) => { e.preventDefault(); const t = todayStr(); setView({ y: Number(t.split("-")[0]), m: Number(t.split("-")[1]) }); onChange(t); setOpen(false); }}>Oggi</button>
        </div>
      </div>
    </Popover>
  );
}

export function TimeField({ value, onChange, minuteStep = 5, placeholder = "--:--", allowClear = true }: { value: string; onChange: (v: string) => void; minuteStep?: number; placeholder?: string; allowClear?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [h, m] = (value ? value.slice(0, 5) : ":").split(":");
  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: Math.ceil(60 / minuteStep) }, (_, i) => i * minuteStep);
  function setH(nh: number) { onChange(`${pad(nh)}:${m || "00"}`); }
  function setM(nm: number) { onChange(`${h || "00"}:${pad(nm)}`); setOpen(false); }
  return (
    <Popover open={open} setOpen={setOpen} trigger={<div className={triggerCls} style={triggerStyle}><Clock size={15} className="text-muted shrink-0" /><span className={value ? "" : "text-faint"}>{value ? value.slice(0, 5) : placeholder}</span>{allowClear && value && <button onClick={(e) => { e.stopPropagation(); onChange(""); }} className="ml-auto text-faint hover:text-[var(--danger)]"><X size={13} /></button>}</div>}>
      <div className="flex gap-1" style={{ width: 150 }}>
        <div className="flex-1 max-h-52 overflow-y-auto thin-scroll">
          {hours.map((hh) => <button key={hh} onClick={() => setH(hh)} className="w-full h-8 rounded-lg text-sm text-center transition-colors" style={pad(hh) === h ? { background: "var(--accent)", color: "var(--accent-fg)" } : { color: "var(--text)" }}>{pad(hh)}</button>)}
        </div>
        <div className="flex-1 max-h-52 overflow-y-auto thin-scroll">
          {minutes.map((mm) => <button key={mm} onClick={() => setM(mm)} className="w-full h-8 rounded-lg text-sm text-center transition-colors" style={pad(mm) === m ? { background: "var(--accent)", color: "var(--accent-fg)" } : { color: "var(--text)" }}>{pad(mm)}</button>)}
        </div>
      </div>
    </Popover>
  );
}
