"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Trash2, MessageCircle, Check, Hourglass, Phone, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { StatCard } from "@/components/kit";
import { DateField } from "@/components/pickers";
import { SALON } from "@/lib/salon-config";
import type { ServiceRow } from "@/lib/gestionale-types";

const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(new Date());
const fmtDate = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
interface WL { id: string; name: string | null; phone: string; service_id: string | null; preferred_date: string | null; notes: string | null; status: string; service?: { name: string } | null }

export default function AttesaPage() {
  const [rows, setRows] = useState<WL[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", service_id: "", preferred_date: "", notes: "" });
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [w, s] = await Promise.all([fetch("/api/waitlist").then((r) => r.json()), fetch("/api/services").then((r) => r.json())]);
    setRows(Array.isArray(w) ? w : []); setServices((s as ServiceRow[]).filter((x) => x.active)); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  async function add() {
    setErr("");
    if (!form.phone.trim()) { setErr("Il telefono è obbligatorio."); return; }
    const res = await fetch("/api/waitlist", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    if (!res.ok) { setErr((await res.json()).error || "Errore."); return; }
    setOpen(false); setForm({ name: "", phone: "", service_id: "", preferred_date: "", notes: "" }); load();
  }
  const summary = useMemo(() => ({
    total: rows.length,
    attesa: rows.filter((w) => w.status === "attesa").length,
    contattato: rows.filter((w) => w.status === "contattato").length,
  }), [rows]);

  async function mark(id: string, status: string) { await fetch(`/api/waitlist/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); load(); }
  async function del(id: string) { await fetch(`/api/waitlist/${id}`, { method: "DELETE" }); load(); }
  function waLink(w: WL) { const msg = encodeURIComponent(`Ciao${w.name ? " " + w.name : ""}! Si è liberato un posto da ${SALON.name}. Ti interessa ancora un appuntamento? Fammi sapere.`); return `https://wa.me/${w.phone.replace(/[^0-9]/g, "")}?text=${msg}`; }

  return (
    <AppShell title="Lista d'attesa" subtitle="Clienti da richiamare quando si libera un posto." actions={<Button size="sm" onClick={() => { setForm({ name: "", phone: "", service_id: "", preferred_date: "", notes: "" }); setErr(""); setOpen(true); }}><Plus size={15} /> <span className="hidden sm:inline">Aggiungi</span></Button>}>
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatCard icon={Hourglass} value={summary.attesa} label="In attesa" accent />
        <StatCard icon={Phone} value={summary.contattato} label="Contattati" />
        <StatCard icon={Users} value={summary.total} label="Totale" />
      </div>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : rows.length === 0 ? <p className="text-sm text-faint py-8 text-center">Nessuno in lista d&apos;attesa.</p> : (
        <div className="space-y-2">
          {rows.map((w) => (
            <Card key={w.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2"><p className="text-sm font-medium" style={{ color: "var(--text)" }}>{w.name || w.phone}</p>{w.status === "contattato" && <Badge tone="info">Contattato</Badge>}</div>
                <p className="text-xs text-muted">{w.phone}{w.service?.name ? ` · ${w.service.name}` : ""}{w.preferred_date ? ` · preferisce ${fmtDate(w.preferred_date)}` : ""}</p>
                {w.notes && <p className="text-xs text-faint mt-0.5">{w.notes}</p>}
              </div>
              <div className="flex items-center gap-2">
                <a href={waLink(w)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 h-8 px-3 rounded-lg text-xs font-medium" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }} onClick={() => mark(w.id, "contattato")}><MessageCircle size={13} /> Contatta</a>
                <button onClick={() => mark(w.id, "chiuso")} className="w-8 h-8 rounded-lg flex items-center justify-center text-muted hover-surface" title="Chiudi" style={{ border: "1px solid var(--border)" }}><Check size={14} /></button>
                <button onClick={() => del(w.id)} className="w-8 h-8 rounded-lg flex items-center justify-center text-faint hover:text-[var(--danger)]" title="Rimuovi" style={{ border: "1px solid var(--border)" }}><Trash2 size={13} /></button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Aggiungi alla lista d'attesa">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field><Field label="Telefono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="es. 393801234567" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Servizio"><Select value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })}><option value="">Qualsiasi</option>{services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field><Field label="Data preferita"><DateField value={form.preferred_date} onChange={(v) => setForm({ ...form, preferred_date: v })} min={todayStr()} /></Field></div>
          <Field label="Note"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        {err && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setOpen(false)}>Annulla</Button><Button onClick={add}>Salva</Button></div>
      </Modal>
    </AppShell>
  );
}
