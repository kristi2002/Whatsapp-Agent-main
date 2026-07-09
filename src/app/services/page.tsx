"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, X, Sparkles, Layers, Clock, Euro } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import { StatCard } from "@/components/kit";
import type { ServiceRow, ProductRow } from "@/lib/gestionale-types";

const empty = { name: "", category: "", duration_min: "45", price_euro: "" };
const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));
interface Consumable { product_id: string; qty: number }

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [consumables, setConsumables] = useState<Consumable[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [status, setStatus] = useState("active");

  const load = useCallback(async () => {
    const [sv, pr] = await Promise.all([fetch("/api/services").then((r) => r.json()), fetch("/api/products").then((r) => r.json())]);
    setServices(sv); setProducts((pr as ProductRow[]).filter((p) => p.active)); setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const categories = useMemo(() => Array.from(new Set(services.map((s) => s.category).filter(Boolean))) as string[], [services]);
  const filtered = useMemo(() => services.filter((s) => {
    if (status === "active" && !s.active) return false;
    if (status === "inactive" && s.active) return false;
    if (cat && s.category !== cat) return false;
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [services, q, cat, status]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 12);
  const activeFilters = (q ? 1 : 0) + (cat ? 1 : 0) + (status !== "active" ? 1 : 0);
  const summary = useMemo(() => {
    const active = services.filter((s) => s.active);
    const priced = active.filter((s) => s.price_cents != null);
    const avgDur = active.length ? active.reduce((sum, s) => sum + s.duration_min, 0) / active.length : 0;
    const avgPrice = priced.length ? priced.reduce((sum, s) => sum + (s.price_cents ?? 0), 0) / priced.length : 0;
    return {
      active: active.length,
      categories: new Set(services.map((s) => s.category).filter(Boolean)).size,
      avgDur,
      hasPrice: priced.length,
      avgPrice,
    };
  }, [services]);

  function openNew() { setForm(empty); setConsumables([]); setEditing("new"); setError(""); }
  async function openEdit(s: ServiceRow) {
    setForm({ name: s.name, category: s.category ?? "", duration_min: String(s.duration_min), price_euro: s.price_cents == null ? "" : (s.price_cents / 100).toFixed(2) });
    setEditing(s.id); setError("");
    const cp = await fetch(`/api/services/${s.id}/products`).then((r) => r.json());
    setConsumables(Array.isArray(cp) ? cp.map((c: { product_id: string; qty: number }) => ({ product_id: c.product_id, qty: c.qty })) : []);
  }
  async function save() {
    setSaving(true); setError("");
    const payload = { name: form.name, category: form.category, duration_min: Number(form.duration_min), price_cents: form.price_euro === "" ? null : Math.round(Number(form.price_euro.replace(",", ".")) * 100) };
    const res = await fetch(editing === "new" ? "/api/services" : `/api/services/${editing}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (!res.ok) { setSaving(false); setError((await res.json()).error || "Errore."); return; }
    const svc = await res.json();
    const svcId = editing === "new" ? svc.id : editing;
    await fetch(`/api/services/${svcId}/products`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: consumables }) });
    setSaving(false); setEditing(null); load();
  }
  async function toggle(s: ServiceRow) { await fetch(`/api/services/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) }); load(); }
  function addConsumable() { const first = products.find((p) => !consumables.some((c) => c.product_id === p.id)); if (first) setConsumables((c) => [...c, { product_id: first.id, qty: 1 }]); }

  return (
    <AppShell title="Servizi" subtitle="I servizi attivi vengono proposti automaticamente in chat." actions={<Button size="sm" onClick={openNew}><Plus size={15} /> <span className="hidden sm:inline">Aggiungi</span></Button>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={Sparkles} value={summary.active} label="Servizi attivi" />
        <StatCard icon={Layers} value={summary.categories} label="Categorie" />
        <StatCard icon={Clock} value={summary.active ? `${Math.round(summary.avgDur)}′` : "—"} label="Durata media" />
        <StatCard icon={Euro} value={summary.hasPrice ? `€ ${Math.round(summary.avgPrice / 100)}` : "—"} label="Prezzo medio" />
      </div>

      <Filters activeCount={activeFilters} onReset={() => { setQ(""); setCat(""); setStatus("active"); }}>
        <FilterField label="Cerca"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome servizio" /></FilterField>
        <FilterField label="Categoria"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Tutte</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></FilterField>
        <FilterField label="Stato"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="active">Attivi</option><option value="inactive">Disattivati</option><option value="all">Tutti</option></Select></FilterField>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <Card className="overflow-hidden">
            <div className="overflow-x-auto thin-scroll"><div className="min-w-[520px]">
              <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 bd-b text-[11px] uppercase tracking-wide text-faint"><span>Nome</span><span>Categoria</span><span className="text-right">Durata</span><span className="text-right">Prezzo</span><span></span></div>
              {pageItems.map((s, i) => (
                <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3 bd-b last:border-b-0 ${i % 2 === 1 ? "zebra-alt" : ""} ${s.active ? "" : "opacity-40"}`}>
                  <span className="text-sm" style={{ color: "var(--text)" }}>{s.name}</span>
                  <span>{s.category ? <Badge tone="accent">{s.category}</Badge> : <span className="text-faint text-xs">—</span>}</span>
                  <span className="text-sm text-muted text-right tabular-nums">{s.duration_min}&#8242;</span>
                  <span className="text-sm text-muted text-right tabular-nums">{euro(s.price_cents)}</span>
                  <div className="flex items-center gap-3 justify-end"><button onClick={() => toggle(s)} className="text-xs text-muted hover:opacity-70">{s.active ? "Disattiva" : "Attiva"}</button><button onClick={() => openEdit(s)} className="text-accent hover:opacity-70" title="Modifica"><Pencil size={14} /></button></div>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-sm text-faint px-5 py-8 text-center">Nessun servizio.</p>}
            </div></div>
          </Card>
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nuovo servizio" : "Modifica servizio"}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Categoria (es. taglio, colore, trucco)"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Durata (min)"><Input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></Field><Field label="Prezzo (euro)"><Input value={form.price_euro} onChange={(e) => setForm({ ...form, price_euro: e.target.value })} placeholder="opzionale" /></Field></div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between mb-2"><p className="text-xs uppercase tracking-wide text-faint">Prodotti consumati (scarico automatico)</p><button onClick={addConsumable} className="text-xs text-accent hover:opacity-70">+ Aggiungi</button></div>
          {consumables.length === 0 ? <p className="text-xs text-faint">Nessuno. Alla chiusura del servizio non verrà scaricato nulla.</p> : (
            <div className="space-y-2">
              {consumables.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Select value={c.product_id} onChange={(e) => setConsumables((arr) => arr.map((x, j) => (j === i ? { ...x, product_id: e.target.value } : x)))}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
                  <input type="number" min={1} value={c.qty} onChange={(e) => setConsumables((arr) => arr.map((x, j) => (j === i ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-16 h-9 px-2 rounded-lg text-sm text-center shrink-0" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                  <button onClick={() => setConsumables((arr) => arr.filter((_, j) => j !== i))} className="text-faint hover:text-[var(--danger)] shrink-0"><X size={15} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>
    </AppShell>
  );
}
