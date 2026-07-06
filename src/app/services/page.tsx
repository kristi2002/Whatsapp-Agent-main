"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input } from "@/components/ui";
import type { ServiceRow } from "@/lib/gestionale-types";

const empty = { name: "", category: "", duration_min: "45", price_euro: "" };
const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => { setServices(await fetch("/api/services").then((r) => r.json())); setLoading(false); }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  function openNew() { setForm(empty); setEditing("new"); setError(""); }
  function openEdit(s: ServiceRow) { setForm({ name: s.name, category: s.category ?? "", duration_min: String(s.duration_min), price_euro: s.price_cents == null ? "" : (s.price_cents / 100).toFixed(2) }); setEditing(s.id); setError(""); }

  async function save() {
    setSaving(true); setError("");
    const payload = { name: form.name, category: form.category, duration_min: Number(form.duration_min), price_cents: form.price_euro === "" ? null : Math.round(Number(form.price_euro.replace(",", ".")) * 100) };
    const res = await fetch(editing === "new" ? "/api/services" : `/api/services/${editing}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || "Errore."); return; }
    setEditing(null); load();
  }
  async function toggle(s: ServiceRow) { await fetch(`/api/services/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) }); load(); }

  return (
    <AppShell title="Servizi" subtitle="I servizi attivi vengono proposti automaticamente in chat." actions={<Button size="sm" onClick={openNew}><Plus size={15} /> Aggiungi</Button>}>
      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 bd-b text-[11px] uppercase tracking-wide text-faint">
            <span>Nome</span><span>Categoria</span><span className="text-right">Durata</span><span className="text-right">Prezzo</span><span></span>
          </div>
          {services.map((s) => (
            <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3 bd-b last:border-b-0 ${s.active ? "" : "opacity-40"}`}>
              <span className="text-sm" style={{ color: "var(--text)" }}>{s.name}</span>
              <span>{s.category ? <Badge tone="accent">{s.category}</Badge> : <span className="text-faint text-xs">—</span>}</span>
              <span className="text-sm text-muted text-right tabular-nums">{s.duration_min}′</span>
              <span className="text-sm text-muted text-right tabular-nums">{euro(s.price_cents)}</span>
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => toggle(s)} className="text-xs text-muted hover:opacity-70">{s.active ? "Disattiva" : "Attiva"}</button>
                <button onClick={() => openEdit(s)} className="text-accent hover:opacity-70" title="Modifica"><Pencil size={14} /></button>
              </div>
            </div>
          ))}
          {services.length === 0 && <p className="text-sm text-faint px-5 py-8 text-center">Nessun servizio.</p>}
        </Card>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nuovo servizio" : "Modifica servizio"}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Categoria (es. taglio, colore, trucco)"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Durata (min)"><Input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></Field>
            <Field label="Prezzo (euro)"><Input value={form.price_euro} onChange={(e) => setForm({ ...form, price_euro: e.target.value })} placeholder="opzionale" /></Field>
          </div>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>
    </AppShell>
  );
}
