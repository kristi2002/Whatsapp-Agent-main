"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2 } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input } from "@/components/ui";
import type { AppointmentWithRelations, ServiceRow } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const shiftDay = (d: string, n: number) => { const [y, m, dd] = d.split("-").map(Number); return new Intl.DateTimeFormat("en-CA", { timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, dd + n))); };
const prettyDate = (d: string) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)).toLocaleDateString("it-IT", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }); };
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };

interface Stylist { id: string; name: string; active: boolean; service_ids: string[] }

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

  const load = useCallback(async () => {
    const [st, sv] = await Promise.all([fetch(`/api/stylists/${id}`).then((r) => r.json()), fetch("/api/services").then((r) => r.json())]);
    setStylist(st); setServices((sv as ServiceRow[]).filter((s) => s.active)); setLoading(false);
  }, [id]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  useEffect(() => { fetch(`/api/appointments?from=${date}&to=${date}`).then((r) => r.json()).then((d) => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ setAppts((Array.isArray(d) ? d : []).filter((a: AppointmentWithRelations) => a.stylist_id === id && a.status !== "cancelled")); }); }, [date, id]);

  function openEdit() { if (!stylist) return; setName(stylist.name); setServiceIds(stylist.service_ids); setEdit(true); }
  async function save() {
    setSaving(true);
    await fetch(`/api/stylists/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, service_ids: serviceIds }) });
    setSaving(false); setEdit(false); load();
  }
  async function remove() {
    if (!confirm("Disattivare questo membro dello staff? Non comparirà più nelle prenotazioni.")) return;
    await fetch(`/api/stylists/${id}`, { method: "DELETE" });
    router.push("/stylists");
  }

  const serviceNames = (stylist?.service_ids ?? []).map((sid) => services.find((s) => s.id === sid)?.name).filter(Boolean) as string[];

  return (
    <AppShell title="Staff" subtitle={stylist?.name} actions={stylist && <><Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} /> <span className="hidden sm:inline">Modifica</span></Button><Button size="sm" variant="danger" onClick={remove}><Trash2 size={14} /></Button></>}>
      <Link href="/stylists" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent mb-4"><ArrowLeft size={15} /> Staff</Link>
      {loading || !stylist ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="grid lg:grid-cols-3 gap-4">
          <Card className="p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{stylist.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
              <div><p className="text-base font-semibold" style={{ color: "var(--text)" }}>{stylist.name}</p><Badge tone={stylist.active ? "success" : "neutral"}>{stylist.active ? "Attivo" : "Disattivato"}</Badge></div>
            </div>
            <p className="text-xs uppercase tracking-wide text-faint mb-2">Servizi eseguiti</p>
            <div className="flex flex-wrap gap-1.5">
              {serviceNames.length === 0 ? <span className="text-sm text-muted">Tutti i servizi</span> : serviceNames.map((n) => <Badge key={n} tone="accent">{n}</Badge>)}
            </div>
          </Card>

          <Card className="lg:col-span-2 p-5">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <h2 className="text-sm font-semibold mr-auto" style={{ color: "var(--text)" }}>Appuntamenti</h2>
              <button onClick={() => setDate(shiftDay(date, -1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronLeft size={15} /></button>
              <button onClick={() => setDate(shiftDay(date, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface" style={{ border: "1px solid var(--border)" }}><ChevronRight size={15} /></button>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 px-2 rounded-lg text-sm" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
            </div>
            <p className="text-xs text-muted mb-3 capitalize">{prettyDate(date)}</p>
            {appts.length === 0 ? <p className="text-sm text-faint py-6 text-center">Nessun appuntamento in questa data.</p> : (
              <div className="space-y-1">
                {appts.map((a) => (
                  <div key={a.id} className="flex items-center gap-4 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                    <span className="text-sm font-semibold text-accent w-12 tabular-nums">{fmtTime(a.starts_at)}</span>
                    <div className="flex-1 min-w-0"><p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name}</p><p className="text-xs text-muted truncate">{a.customer_name || a.customer_phone}</p></div>
                    <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title="Modifica membro">
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="text-xs text-muted mt-4 mb-2">Servizi eseguiti (nessuno = tutti)</p>
        <div className="max-h-56 overflow-y-auto thin-scroll space-y-0.5 pr-1">
          {services.map((sv) => (
            <label key={sv.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover-surface cursor-pointer">
              <input type="checkbox" checked={serviceIds.includes(sv.id)} onChange={() => setServiceIds((p) => (p.includes(sv.id) ? p.filter((x) => x !== sv.id) : [...p, sv.id]))} style={{ accentColor: "var(--accent)" }} />
              <span className="text-sm" style={{ color: "var(--text)" }}>{sv.name}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEdit(false)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>
    </AppShell>
  );
}
