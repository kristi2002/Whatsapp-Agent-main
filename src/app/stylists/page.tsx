"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, Pencil, Users } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Modal, Field, Input, Select } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import { StatCard, Avatar } from "@/components/kit";
import type { ServiceRow } from "@/lib/gestionale-types";

const initials = (name: string) => name.split(" ").map((w) => w[0]).slice(0, 2).join("");

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
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("active");

  const load = useCallback(async () => {
    const [st, sv] = await Promise.all([fetch("/api/stylists").then((r) => r.json()), fetch("/api/services").then((r) => r.json())]);
    setStylists(st); setServices((sv as ServiceRow[]).filter((s) => s.active)); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const filtered = useMemo(() => stylists.filter((s) => {
    if (status === "active" && !s.active) return false;
    if (status === "inactive" && s.active) return false;
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [stylists, q, status]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 12);
  const activeFilters = (q ? 1 : 0) + (status !== "active" ? 1 : 0);
  const summary = useMemo(() => ({ active: stylists.filter((s) => s.active).length, total: stylists.length }), [stylists]);

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
    <AppShell title="Staff" subtitle="Chi lavora e cosa esegue determina cosa può prenotare l'assistente." actions={<Button size="sm" onClick={openNew}><Plus size={15} /> <span className="hidden sm:inline">Aggiungi</span></Button>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Users} value={summary.active} label="Staff attivo" />
        <StatCard icon={Users} value={summary.total} label="Totale" />
      </div>

      <Filters activeCount={activeFilters} onReset={() => { setQ(""); setStatus("active"); }}>
        <FilterField label="Cerca"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome" /></FilterField>
        <FilterField label="Stato"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Attivi</option><option value="inactive">Disattivati</option><option value="all">Tutti</option></Select></FilterField>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageItems.map((s) => (
              <Card key={s.id} className={`p-4 ${s.active ? "" : "opacity-40"}`}>
                <Link href={`/stylists/${s.id}`} className="flex items-center gap-3 mb-3 group">
                  <Avatar initials={initials(s.name)} size={44} />
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate group-hover:text-accent transition-colors" style={{ color: "var(--text)" }}>{s.name}</p><p className="text-xs text-muted">{s.service_ids.length === 0 ? "Tutti i servizi" : `${s.service_ids.length} servizi`}</p></div>
                </Link>
                <div className="flex items-center gap-3 justify-end">
                  <button onClick={() => toggleActive(s)} className="text-xs text-muted hover:opacity-70">{s.active ? "Disattiva" : "Attiva"}</button>
                  <button onClick={() => openEdit(s)} className="text-accent hover:opacity-70" title="Modifica"><Pencil size={14} /></button>
                </div>
              </Card>
            ))}
          </div>
          {filtered.length === 0 && <p className="text-sm text-faint py-8 text-center">Nessun membro dello staff.</p>}
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
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
