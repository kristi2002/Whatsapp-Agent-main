"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2, Plus, CalendarOff } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input } from "@/components/ui";
import type { AppointmentWithRelations, ServiceRow } from "@/lib/gestionale-types";
import type { BusinessHours } from "@/lib/types";
import { DateField, TimeField } from "@/components/pickers";

const TZ = "Europe/Rome";
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const shiftDay = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd + n))); };
const prettyDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtDT = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: TZ, day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : "");
const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };
const DAYS = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];
const ORDER = [1, 2, 3, 4, 5, 6, 0];

interface Stylist { id: string; name: string; active: boolean; service_ids: string[] }
interface Hours { day_of_week: number; is_working: boolean; open_time: string | null; close_time: string | null; break_start: string | null; break_end: string | null }
interface TimeOff { id: string; starts_at: string; ends_at: string; reason: string | null }

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [stylist, setStylist] = useState<Stylist | null>(null);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [date, setDate] = useState(todayLocal());
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  // turni
  const [hours, setHours] = useState<Record<number, Hours> | null>(null); // null = follows salon
  const [salon, setSalon] = useState<BusinessHours[]>([]);
  const [hoursSaved, setHoursSaved] = useState(false);
  // ferie
  const [timeOff, setTimeOff] = useState<TimeOff[]>([]);
  const [offOpen, setOffOpen] = useState(false);
  const emptyOff = { startDate: "", startTime: "09:00", endDate: "", endTime: "18:00", reason: "" };
  const [off, setOff] = useState(emptyOff);
  const [offErr, setOffErr] = useState("");

  const load = useCallback(async () => {
    const [st, sv, hr, so, to] = await Promise.all([
      fetch(`/api/stylists/${id}`).then((r) => r.json()),
      fetch("/api/services").then((r) => r.json()),
      fetch(`/api/stylists/${id}/hours`).then((r) => r.json()),
      fetch("/api/hours").then((r) => r.json()),
      fetch(`/api/stylists/${id}/timeoff`).then((r) => r.json()),
    ]);
    setStylist(st); setServices((sv as ServiceRow[]).filter((s) => s.active)); setSalon(so); setTimeOff(Array.isArray(to) ? to : []);
    if (Array.isArray(hr) && hr.length > 0) { const map: Record<number, Hours> = {}; for (const r of hr) map[r.day_of_week] = r; setHours(map); } else setHours(null);
    setLoading(false);
  }, [id]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  useEffect(() => { fetch(`/api/appointments?from=${date}&to=${date}`).then((r) => r.json()).then((d) => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ setAppts((Array.isArray(d) ? d : []).filter((a: AppointmentWithRelations) => a.stylist_id === id && a.status !== "cancelled")); }); }, [date, id]);

  function openEdit() { if (!stylist) return; setName(stylist.name); setServiceIds(stylist.service_ids); setEdit(true); }
  async function save() { setSaving(true); await fetch(`/api/stylists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, service_ids: serviceIds }) }); setSaving(false); setEdit(false); load(); }
  async function remove() { if (!confirm("Disattivare questo membro dello staff?")) return; await fetch(`/api/stylists/${id}`, { method: "DELETE" }); router.push("/stylists"); }

  function personalize() {
    const map: Record<number, Hours> = {};
    for (let d = 0; d < 7; d++) { const s = salon.find((x) => x.day_of_week === d); map[d] = { day_of_week: d, is_working: s ? !s.is_closed : false, open_time: s?.open_time ?? null, close_time: s?.close_time ?? null, break_start: s?.break_start ?? null, break_end: s?.break_end ?? null }; }
    setHours(map);
  }
  function updHours(d: number, patch: Partial<Hours>) { setHours((p) => (p ? { ...p, [d]: { ...p[d], ...patch } } : p)); }
  async function saveHours() {
    if (!hours) return;
    const rows = ORDER.map((d) => ({ day_of_week: d, is_working: hours[d].is_working, open_time: hhmm(hours[d].open_time) || null, close_time: hhmm(hours[d].close_time) || null, break_start: hhmm(hours[d].break_start) || null, break_end: hhmm(hours[d].break_end) || null }));
    await fetch(`/api/stylists/${id}/hours`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows }) });
    setHoursSaved(true); setTimeout(() => setHoursSaved(false), 1500);
  }
  async function resetHours() { if (!confirm("Ripristinare gli orari del salone per questo operatore?")) return; await fetch(`/api/stylists/${id}/hours`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reset: true }) }); setHours(null); }

  async function addOff() {
    setOffErr("");
    if (!off.startDate || !off.endDate) { setOffErr("Indica giorno di inizio e fine."); return; }
    const start = new Date(`${off.startDate}T${off.startTime || "00:00"}`);
    const end = new Date(`${off.endDate}T${off.endTime || "23:59"}`);
    const res = await fetch(`/api/stylists/${id}/timeoff`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ starts_at: start.toISOString(), ends_at: end.toISOString(), reason: off.reason }) });
    if (!res.ok) { setOffErr((await res.json()).error || "Errore."); return; }
    setOffOpen(false); setOff(emptyOff); load();
  }
  async function delOff(oid: string) { await fetch(`/api/timeoff/${oid}`, { method: "DELETE" }); load(); }

  const serviceNames = (stylist?.service_ids ?? []).map((sid) => services.find((s) => s.id === sid)?.name).filter(Boolean) as string[];

  return (
    <AppShell title="Staff" subtitle={stylist?.name} actions={stylist && <><Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} /> <span className="hidden sm:inline">Modifica</span></Button><Button size="sm" variant="danger" onClick={remove}><Trash2 size={14} /></Button></>}>
      <Link href="/stylists" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent mb-4"><ArrowLeft size={15} /> Staff</Link>
      {loading || !stylist ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="space-y-4">
          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{stylist.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                <div><p className="text-base font-semibold" style={{ color: "var(--text)" }}>{stylist.name}</p><Badge tone={stylist.active ? "success" : "neutral"}>{stylist.active ? "Attivo" : "Disattivato"}</Badge></div>
              </div>
              <p className="text-xs uppercase tracking-wide text-faint mb-2">Servizi eseguiti</p>
              <div className="flex flex-wrap gap-1.5">{serviceNames.length === 0 ? <span className="text-sm text-muted">Tutti i servizi</span> : serviceNames.map((n) => <Badge key={n} tone="accent">{n}</Badge>)}</div>
            </Card>

            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <h2 className="text-sm font-semibold mr-auto" style={{ color: "var(--text)" }}>Appuntamenti</h2>
                <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronLeft size={15} /></button>
                <button onClick={() => setDate(shiftDay(date, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronRight size={15} /></button>
                <div className="w-40"><DateField value={date} onChange={setDate} /></div>
              </div>
              <p className="text-xs text-muted mb-3 capitalize">{prettyDate(date)}</p>
              {appts.length === 0 ? <p className="text-sm text-faint py-6 text-center">Nessun appuntamento in questa data.</p> : (
                <div className="space-y-1">{appts.map((a) => (<div key={a.id} className="flex items-center gap-4 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}><span className="text-sm font-semibold text-accent w-12 tabular-nums">{fmtTime(a.starts_at)}</span><div className="flex-1 min-w-0"><p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name}</p><p className="text-xs text-muted truncate">{a.customer_name || a.customer_phone}</p></div><Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge></div>))}</div>
              )}
            </Card>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Turni settimanali</h2>
                {hours ? <button onClick={resetHours} className="text-xs text-muted hover:opacity-70">Usa orari salone</button> : <Button size="sm" variant="secondary" onClick={personalize}>Personalizza</Button>}
              </div>
              {!hours ? <p className="text-sm text-faint py-3">Segue gli orari di apertura del salone.</p> : (
                <>
                  <div className="space-y-1.5">
                    {ORDER.map((d) => (
                      <div key={d} className="flex flex-wrap items-center gap-2">
                        <span className="text-xs w-20" style={{ color: "var(--text)" }}>{DAYS[d]}</span>
                        <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={!hours[d].is_working} onChange={(e) => updHours(d, { is_working: !e.target.checked })} style={{ accentColor: "var(--accent)" }} />Off</label>
                        {hours[d].is_working && <>
                          <div className="w-24"><TimeField value={hhmm(hours[d].open_time)} onChange={(v) => updHours(d, { open_time: v })} /></div>
                          <span className="text-faint text-xs">–</span>
                          <div className="w-24"><TimeField value={hhmm(hours[d].close_time)} onChange={(v) => updHours(d, { close_time: v })} /></div>
                        </>}
                      </div>
                    ))}
                  </div>
                  <div className="flex justify-end mt-3"><Button size="sm" onClick={saveHours}>{hoursSaved ? "✓ Salvato" : "Salva turni"}</Button></div>
                </>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Ferie e assenze</h2>
                <Button size="sm" onClick={() => { setOff(emptyOff); setOffErr(""); setOffOpen(true); }}><Plus size={14} /> Aggiungi</Button>
              </div>
              {timeOff.length === 0 ? <p className="text-sm text-faint py-3 text-center">Nessuna assenza programmata.</p> : (
                <div className="space-y-1">{timeOff.map((t) => (<div key={t.id} className="flex items-center gap-3 py-2 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}><CalendarOff size={15} className="text-faint shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm" style={{ color: "var(--text)" }}>{fmtDT(t.starts_at)} → {fmtDT(t.ends_at)}</p>{t.reason && <p className="text-xs text-muted">{t.reason}</p>}</div><button onClick={() => delOff(t.id)} className="text-faint hover:text-[var(--danger)]"><Trash2 size={13} /></button></div>))}</div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title="Modifica membro">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="text-xs text-muted mt-4 mb-2">Servizi eseguiti (nessuno = tutti)</p>
        <div className="max-h-56 overflow-y-auto thin-scroll space-y-0.5 pr-1">{services.map((sv) => (<label key={sv.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover-surface cursor-pointer"><input type="checkbox" checked={serviceIds.includes(sv.id)} onChange={() => setServiceIds((p) => (p.includes(sv.id) ? p.filter((x) => x !== sv.id) : [...p, sv.id]))} style={{ accentColor: "var(--accent)" }} /><span className="text-sm" style={{ color: "var(--text)" }}>{sv.name}</span></label>))}</div>
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEdit(false)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>

      <Modal open={offOpen} onClose={() => setOffOpen(false)} title="Aggiungi assenza">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Dal giorno"><DateField value={off.startDate} onChange={(v) => setOff({ ...off, startDate: v })} min={todayLocal()} /></Field>
            <Field label="Ora inizio"><TimeField value={off.startTime} onChange={(v) => setOff({ ...off, startTime: v })} /></Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Al giorno"><DateField value={off.endDate} onChange={(v) => setOff({ ...off, endDate: v })} min={off.startDate || todayLocal()} /></Field>
            <Field label="Ora fine"><TimeField value={off.endTime} onChange={(v) => setOff({ ...off, endTime: v })} /></Field>
          </div>
          <Field label="Motivo (opzionale)"><Input value={off.reason} onChange={(e) => setOff({ ...off, reason: e.target.value })} placeholder="ferie, malattia…" /></Field>
        </div>
        {offErr && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{offErr}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOffOpen(false)}>Annulla</Button><Button onClick={addOff}>Salva</Button></div>
      </Modal>
    </AppShell>
  );
}
