"use client";

import { useEffect, useState, useCallback } from "react";
import Shell from "@/components/Shell";
import type { AppointmentWithRelations, ServiceRow } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";

function todayLocal(): string {
  // YYYY-MM-DD in Rome time
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
}
function shiftDay(date: string, delta: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(dt);
}
function prettyDate(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" });
}

const STATUS: Record<string, { label: string; cls: string }> = {
  booked: { label: "Prenotato", cls: "bg-emerald-500/15 text-emerald-400" },
  completed: { label: "Completato", cls: "bg-sky-500/15 text-sky-400" },
  cancelled: { label: "Annullato", cls: "bg-white/10 text-white/40" },
  no_show: { label: "Assente", cls: "bg-amber-500/15 text-amber-400" },
};

interface Stylist { id: string; name: string; active: boolean }

const emptyForm = { service_id: "", stylist_id: "", time: "10:00", customer_name: "", customer_phone: "", notes: "" };

export default function CalendarPage() {
  const [date, setDate] = useState<string>(todayLocal());
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const loadAppts = useCallback(async (d: string) => {
    setLoading(true);
    const data = await fetch(`/api/appointments?from=${d}&to=${d}`).then((r) => r.json());
    setAppts(Array.isArray(data) ? data : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadAppts(date);
  }, [date, loadAppts]);

  useEffect(() => {
    Promise.all([fetch("/api/services").then((r) => r.json()), fetch("/api/stylists").then((r) => r.json())]).then(([sv, st]) => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setServices((sv as ServiceRow[]).filter((s) => s.active));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setStylists((st as Stylist[]).filter((s) => s.active));
    });
  }, []);

  async function setStatus(id: string, status: string) {
    await fetch(`/api/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    loadAppts(date);
  }
  async function cancel(id: string) {
    if (!confirm("Annullare questo appuntamento?")) return;
    await fetch(`/api/appointments/${id}`, { method: "DELETE" });
    loadAppts(date);
  }

  async function create() {
    setSaving(true);
    setError("");
    const res = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, date }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error || "Errore.");
      return;
    }
    setShowNew(false);
    setForm(emptyForm);
    loadAppts(date);
  }

  const visible = appts.filter((a) => a.status !== "cancelled");

  return (
    <Shell
      title="Calendario"
      actions={<button onClick={() => { setForm(emptyForm); setError(""); setShowNew(true); }} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">+ Nuovo appuntamento</button>}
    >
      <div className="flex items-center gap-2 mb-5">
        <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70">‹</button>
        <button onClick={() => setDate(shiftDay(date, 1))} className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70">›</button>
        <button onClick={() => setDate(todayLocal())} className="px-3 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] text-white/70 text-xs">Oggi</button>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="tinp ml-1" />
        <span className="text-sm text-white/50 ml-2 capitalize">{prettyDate(date)}</span>
      </div>

      {loading ? (
        <p className="text-sm text-white/40">Caricamento…</p>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-white/[0.06] py-12 text-center" style={{ background: "#141414" }}>
          <p className="text-sm text-white/30">Nessun appuntamento per questa data.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-5 py-3.5 rounded-xl border border-white/[0.06]" style={{ background: "#141414" }}>
              <div className="text-center w-16 shrink-0">
                <div className="text-sm font-semibold text-emerald-400 tabular-nums">{fmtTime(a.starts_at)}</div>
                <div className="text-[10px] text-white/30 tabular-nums">{fmtTime(a.ends_at)}</div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white/90 truncate">{a.service?.name ?? "Servizio"}</p>
                <p className="text-xs text-white/40 truncate">{a.customer_name || a.customer_phone} · {a.stylist?.name ?? ""} {a.source === "whatsapp" ? "· WhatsApp" : a.source === "gestionale" ? "· Gestionale" : ""}</p>
              </div>
              <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded shrink-0 ${STATUS[a.status]?.cls ?? ""}`}>{STATUS[a.status]?.label ?? a.status}</span>
              <div className="flex items-center gap-2 shrink-0">
                {a.status === "booked" && (
                  <>
                    <button onClick={() => setStatus(a.id, "completed")} title="Segna completato" className="text-xs text-sky-400 hover:text-sky-300">✓</button>
                    <button onClick={() => setStatus(a.id, "no_show")} title="Segna assente" className="text-xs text-amber-400 hover:text-amber-300">∅</button>
                  </>
                )}
                <button onClick={() => cancel(a.id)} title="Annulla" className="text-xs text-white/30 hover:text-red-400">✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showNew && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] p-6" style={{ background: "#1a1a1a" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-1">Nuovo appuntamento</h3>
            <p className="text-xs text-white/40 mb-4 capitalize">{prettyDate(date)}</p>
            <div className="space-y-3">
              <label className="block"><span className="block text-xs text-white/50 mb-1.5">Servizio</span>
                <select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })} className="inp">
                  <option value="">Seleziona…</option>
                  {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_min}′)</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="block text-xs text-white/50 mb-1.5">Parrucchiere</span>
                  <select value={form.stylist_id} onChange={(e) => setForm({ ...form, stylist_id: e.target.value })} className="inp">
                    <option value="">Seleziona…</option>
                    {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <label className="block"><span className="block text-xs text-white/50 mb-1.5">Ora</span>
                  <input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} className="inp" />
                </label>
              </div>
              <label className="block"><span className="block text-xs text-white/50 mb-1.5">Nome cliente</span>
                <input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="inp" />
              </label>
              <label className="block"><span className="block text-xs text-white/50 mb-1.5">Telefono</span>
                <input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="es. 393801234567" className="inp" />
              </label>
              <label className="block"><span className="block text-xs text-white/50 mb-1.5">Note (opzionale)</span>
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="inp" />
              </label>
            </div>
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowNew(false)} className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white">Annulla</button>
              <button onClick={create} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium">{saving ? "Salvataggio…" : "Prenota"}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-size:14px;color:#fff;outline:none}.inp:focus{border-color:rgba(16,185,129,0.5)}.tinp{background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:6px 10px;font-size:13px;color:#fff;outline:none}`}</style>
    </Shell>
  );
}
