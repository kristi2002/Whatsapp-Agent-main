"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Plus, FlaskConical, CalendarDays, Check, Clock, Euro } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Button, Modal, Field, Input, Select, Badge } from "@/components/ui";
import { Filters, FilterField } from "@/components/data-ui";
import { StatCard } from "@/components/kit";
import { DateField, TimeField } from "@/components/pickers";
import type { AppointmentWithRelations, ServiceRow } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const ROW_H = 64;

function todayLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date()); }
function shiftDay(date: string, d: number) { const [y, m, dd] = date.split("-").map(Number); const t = new Date(Date.UTC(y, m - 1, dd + d)); return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(t); }
function prettyDate(date: string) { const [y, m, d] = date.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); }
function localMinutes(iso: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(iso));
  let h = 0, m = 0; for (const p of parts) { if (p.type === "hour") h = +p.value; if (p.type === "minute") m = +p.value; } return (h % 24) * 60 + m;
}
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }); }

interface Stylist { id: string; name: string; active: boolean }
const STATUS_VAR: Record<string, string> = { booked: "var(--accent)", completed: "var(--info)", no_show: "var(--warning)" };
const emptyForm = { service_id: "", stylist_id: "", time: "10:00", customer_name: "", customer_phone: "", notes: "" };

export default function CalendarPage() {
  const [date, setDate] = useState(todayLocal());
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<AppointmentWithRelations | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [hStart, setHStart] = useState(8);
  const [hEnd, setHEnd] = useState(20);
  const [stylistFilter, setStylistFilter] = useState("");
  const router = useRouter();

  const loadAppts = useCallback(async (d: string, silent = false) => {
    if (!silent) setLoading(true);
    try {
      const data = await fetch(`/api/appointments?from=${d}&to=${d}`).then((r) => r.json());
      setAppts(Array.isArray(data) ? data.filter((a: AppointmentWithRelations) => a.status !== "cancelled") : []);
    } catch { /* keep last-known data on a transient fetch error */ }
    if (!silent) setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ loadAppts(date); }, [date, loadAppts]);
  // Silently re-fetch so appointments created/cancelled elsewhere (e.g. the
  // WhatsApp agent) appear without a manual refresh. Also refresh when the tab
  // regains focus so staff see changes the moment they return to the calendar.
  useEffect(() => {
    const t = setInterval(() => loadAppts(date, true), 20_000);
    const onFocus = () => loadAppts(date, true);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [date, loadAppts]);
  useEffect(() => {
    Promise.all([fetch("/api/stylists").then((r) => r.json()), fetch("/api/services").then((r) => r.json())]).then(([st, sv]) => {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setStylists((st as Stylist[]).filter((s) => s.active));
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setServices((sv as ServiceRow[]).filter((s) => s.active));
    });
  }, []);

  const daySummary = useMemo(() => {
    const list = appts.filter((a) => a.status !== "cancelled");
    const completati = list.filter((a) => a.status === "completed").length;
    const rimanenti = list.filter((a) => a.status === "booked").length;
    const incassoCents = list
      .filter((a) => a.status === "booked" || a.status === "completed")
      .reduce((s, a) => s + (a.service?.price_cents ?? 0), 0);
    return { total: list.length, completati, rimanenti, incasso: `€ ${Math.round(incassoCents / 100)}` };
  }, [appts]);
  const shown = useMemo(() => (stylistFilter ? stylists.filter((s) => s.id === stylistFilter) : stylists), [stylists, stylistFilter]);
  const hours = useMemo(() => Array.from({ length: Math.max(1, hEnd - hStart) }, (_, i) => hStart + i), [hStart, hEnd]);
  const nowMin = localMinutes(new Date().toISOString());
  const isToday = date === todayLocal();
  const activeFilters = (stylistFilter ? 1 : 0) + (hStart !== 8 || hEnd !== 20 ? 1 : 0);
  const hourOpts = Array.from({ length: 16 }, (_, i) => i + 6);

  function openNew(stylistId?: string, hour?: number) {
    setSelected(null);
    setForm({ ...emptyForm, stylist_id: stylistId ?? "", time: hour != null ? `${String(hour).padStart(2, "0")}:00` : "10:00" });
    setError(""); setOpen(true);
  }
  async function create() {
    setSaving(true); setError("");
    const res = await fetch("/api/appointments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, date }) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || "Errore."); return; }
    setOpen(false); loadAppts(date);
  }
  async function setStatus(id: string, status: string) { await fetch(`/api/appointments/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); setSelected(null); loadAppts(date); }
  async function cancel(id: string) {
    await fetch(`/api/appointments/${id}`, { method: "DELETE" }); setSelected(null); loadAppts(date);
    const wl = await fetch("/api/waitlist").then((r) => r.json()).catch(() => []);
    if (Array.isArray(wl) && wl.length > 0 && confirm(`Ci sono ${wl.length} clienti in lista d'attesa. Vuoi aprirla per riempire il posto?`)) router.push("/attesa");
  }

  const isColor = (a: AppointmentWithRelations | null) => !!(a?.service?.category && a.service.category.toLowerCase().includes("colore"));
  async function openColorSheet(a: AppointmentWithRelations) {
    const c = await fetch(`/api/clients?phone=${encodeURIComponent(a.customer_phone)}`).then((r) => r.json()).catch(() => null);
    if (c?.id) router.push(`/clienti/${c.id}?color=${a.id}&stylist=${a.stylist_id}`);
    else alert("Cliente non trovato per questo numero.");
  }
  async function completeAppt(a: AppointmentWithRelations) {
    await setStatus(a.id, "completed");
    if (isColor(a) && confirm("Compilare la scheda colore per questo cliente?")) openColorSheet(a);
  }

  return (
    <AppShell title="Calendario" actions={<Button size="sm" onClick={() => openNew()}><Plus size={15} /> <span className="hidden sm:inline">Nuovo</span></Button>}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <button onClick={() => setDate(shiftDay(date, -1))} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronLeft size={17} /></button>
        <button onClick={() => setDate(shiftDay(date, 1))} className="w-9 h-9 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronRight size={17} /></button>
        <button onClick={() => setDate(todayLocal())} className="h-9 px-3 rounded-lg text-xs font-medium text-muted hover-surface" style={{ border: "1px solid var(--border)" }}>Oggi</button>
        <div className="w-44"><DateField value={date} onChange={setDate} /></div>
        <span className="text-sm text-muted ml-1 capitalize hidden md:block">{prettyDate(date)}</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={CalendarDays} value={daySummary.total} label="Appuntamenti oggi" accent />
        <StatCard icon={Check} value={daySummary.completati} label="Completati" />
        <StatCard icon={Clock} value={daySummary.rimanenti} label="Rimanenti" />
        <StatCard icon={Euro} value={daySummary.incasso} label="Incasso previsto" />
      </div>

      <Filters activeCount={activeFilters} onReset={() => { setStylistFilter(""); setHStart(8); setHEnd(20); }}>
        <FilterField label="Parrucchiere"><Select value={stylistFilter} onChange={(e) => setStylistFilter(e.target.value)}><option value="">Tutti</option>{stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FilterField>
        <FilterField label="Dalle ore"><Select value={hStart} onChange={(e) => setHStart(Math.min(Number(e.target.value), hEnd - 1))}>{hourOpts.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></FilterField>
        <FilterField label="Alle ore"><Select value={hEnd} onChange={(e) => setHEnd(Math.max(Number(e.target.value), hStart + 1))}>{hourOpts.map((h) => <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>)}</Select></FilterField>
      </Filters>

      {shown.length === 0 ? (
        <p className="text-sm text-faint">{loading ? "Caricamento…" : "Nessun parrucchiere da mostrare."}</p>
      ) : (
        <div className="card overflow-hidden" style={{ boxShadow: "var(--shadow)", minHeight: 620 }}>
          <div className="overflow-x-auto thin-scroll">
            <div style={{ minWidth: 70 + shown.length * 150 }}>
              <div className="flex bd-b sticky top-0 z-10" style={{ background: "var(--surface)" }}>
                <div className="w-[70px] shrink-0" />
                {shown.map((s) => (<div key={s.id} className="flex-1 min-w-[140px] px-3 py-2.5 text-center text-sm font-medium bd-r last:border-r-0" style={{ color: "var(--text)" }}>{s.name}</div>))}
              </div>
              <div className="flex relative">
                <div className="w-[70px] shrink-0">
                  {hours.map((h) => (<div key={h} className="text-right pr-2 text-[11px] text-faint" style={{ height: ROW_H, transform: "translateY(-6px)" }}>{String(h).padStart(2, "0")}:00</div>))}
                </div>
                {shown.map((s) => (
                  <div key={s.id} className="flex-1 min-w-[140px] relative bd-r last:border-r-0">
                    {hours.map((h) => (<div key={h} onClick={() => openNew(s.id, h)} className="cursor-pointer hover:bg-[var(--surface-2)] transition-colors" style={{ height: ROW_H, borderTop: "1px solid var(--border)" }} />))}
                    {appts.filter((a) => a.stylist_id === s.id).map((a) => {
                      const start = localMinutes(a.starts_at), end = localMinutes(a.ends_at);
                      const top = ((start - hStart * 60) / 60) * ROW_H;
                      const height = Math.max(22, ((end - start) / 60) * ROW_H - 2);
                      if (start >= hEnd * 60 || end <= hStart * 60) return null;
                      const color = STATUS_VAR[a.status] ?? "var(--text-muted)";
                      return (
                        <button key={a.id} onClick={() => setSelected(a)} className="absolute left-1 right-1 rounded-lg px-2 py-1 text-left overflow-hidden transition-transform hover:scale-[1.01]" style={{ top, height, background: "var(--accent-soft)", borderLeft: `3px solid ${color}` }}>
                          <p className="text-[11px] font-semibold leading-tight truncate" style={{ color: "var(--accent-soft-fg)" }}>{fmtTime(a.starts_at)} · {a.service?.name}</p>
                          <p className="text-[10px] leading-tight truncate text-muted">{a.customer_name || a.customer_phone}</p>
                        </button>
                      );
                    })}
                    {isToday && nowMin >= hStart * 60 && nowMin <= hEnd * 60 && (<div className="absolute left-0 right-0 pointer-events-none z-[5]" style={{ top: ((nowMin - hStart * 60) / 60) * ROW_H }}><div style={{ height: 2, background: "var(--danger)" }} /></div>)}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Nuovo appuntamento" subtitle={prettyDate(date)}>
        <div className="space-y-3">
          <Field label="Servizio"><Select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}><option value="">Seleziona…</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.duration_min}′)</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Parrucchiere"><Select value={form.stylist_id} onChange={(e) => setForm({ ...form, stylist_id: e.target.value })}><option value="">Seleziona…</option>{stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
            <Field label="Ora"><TimeField value={form.time} onChange={(v) => setForm({ ...form, time: v })} /></Field>
          </div>
          <Field label="Nome cliente"><Input value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} /></Field>
          <Field label="Telefono"><Input value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} placeholder="es. 393801234567" /></Field>
          <Field label="Note (opzionale)"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button><Button onClick={create} disabled={saving}>{saving ? "Salvataggio…" : "Prenota"}</Button></div>
      </Modal>

      <Modal open={!!selected} onClose={() => setSelected(null)} title={selected?.service?.name ?? "Appuntamento"} subtitle={selected ? `${fmtTime(selected.starts_at)} · ${selected.stylist?.name ?? ""}` : ""}>
        {selected && (
          <div>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span className="text-muted">Cliente</span><span style={{ color: "var(--text)" }}>{selected.customer_name || "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted">Telefono</span><span style={{ color: "var(--text)" }}>{selected.customer_phone}</span></div>
              <div className="flex justify-between"><span className="text-muted">Origine</span><Badge tone="neutral">{selected.source === "whatsapp" ? "WhatsApp" : selected.source === "gestionale" ? "Gestionale" : selected.source === "online" ? "Online" : "Telefono"}</Badge></div>
              {selected.notes && <div className="flex justify-between gap-4"><span className="text-muted">Note</span><span className="text-right" style={{ color: "var(--text)" }}>{selected.notes}</span></div>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {isColor(selected) && <Button variant="secondary" size="sm" onClick={() => openColorSheet(selected)}><FlaskConical size={13} /> Scheda colore</Button>}
              {selected.status === "booked" && <><Button variant="secondary" size="sm" onClick={() => completeAppt(selected)}>Completato</Button><Button variant="secondary" size="sm" onClick={() => setStatus(selected.id, "no_show")}>Assente</Button></>}
              <Button variant="danger" size="sm" onClick={() => cancel(selected.id)}>Annulla appuntamento</Button>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
