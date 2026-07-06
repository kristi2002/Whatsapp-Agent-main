"use client";

import { useEffect, useState, useCallback } from "react";
import { Plus, Pencil } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Modal, Field, Input } from "@/components/ui";
import type { ServiceRow } from "@/lib/gestionale-types";

interface StylistRow { id: string; name: string; active: boolean; service_ids: string[] }

export default function StylistsPage() {
  const [stylists, setStylists] = useState<StylistRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [name, setName] = useState("");
  const [serviceIds, setServiceIds] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [st, sv] = await Promise.all([fetch("/api/stylists").then((r) => r.json()), fetch("/api/services").then((r) => r.json())]);
    setStylists(st); setServices((sv as ServiceRow[]).filter((s) => s.active)); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  function openNew() { setName(""); setServiceIds([]); setEditing("new"); setError(""); }
  function openEdit(s: StylistRow) { setName(s.name); setServiceIds(s.service_ids); setEditing(s.id); setError(""); }
  function toggleService(id: string) { setServiceIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id])); }

  async function save() {
    setSaving(true); setError("");
    const res = await fetch(editing === "new" ? "/api/stylists" : `/api/stylists/${editing}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, service_ids: serviceIds }) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || "Errore."); return; }
    setEditing(null); load();
  }
  async function toggleActive(s: StylistRow) { await fetch(`/api/stylists/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) }); load(); }

  return (
    <AppShell title="Staff" subtitle="Chi lavora e cosa esegue determina cosa può prenotare l'assistente." actions={<Button size="sm" onClick={openNew}><Plus size={15} /> Aggiungi</Button>}>
      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stylists.map((s) => (
            <Card key={s.id} className={`p-4 ${s.active ? "" : "opacity-40"}`}>
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{s.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
                <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{s.name}</p><p className="text-xs text-muted">{s.service_ids.length === 0 ? "Tutti i servizi" : `${s.service_ids.length} servizi`}</p></div>
              </div>
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => toggleActive(s)} className="text-xs text-muted hover:opacity-70">{s.active ? "Disattiva" : "Attiva"}</button>
                <button onClick={() => openEdit(s)} className="text-accent hover:opacity-70" title="Modifica"><Pencil size={14} /></button>
              </div>
            </Card>
          ))}
          {stylists.length === 0 && <p className="text-sm text-faint">Nessun membro dello staff.</p>}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nuovo membro" : "Modifica membro"}>
        <Field label="Nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <p className="text-xs text-muted mt-4 mb-2">Servizi eseguiti (nessuno = tutti)</p>
        <div className="max-h-56 overflow-y-auto thin-scroll space-y-0.5 pr-1">
          {services.map((sv) => (
            <label key={sv.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover-surface cursor-pointer">
              <input type="checkbox" checked={serviceIds.includes(sv.id)} onChange={() => toggleService(sv.id)} style={{ accentColor: "var(--accent)" }} />
              <span className="text-sm" style={{ color: "var(--text)" }}>{sv.name}</span>
            </label>
          ))}
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>
    </AppShell>
  );
}
