"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { Plus, Pencil, Package, AlertTriangle, ArrowDownUp, ArrowUp, ArrowDown } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import type { ProductRow } from "@/lib/gestionale-types";

const empty = { name: "", brand: "", category: "", sku: "", price_euro: "", cost_euro: "", stock_qty: "0", low_stock_threshold: "3" };
const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));
const fmtDT = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
interface Mov { id: string; delta: number; reason: string | null; created_at: string }

export default function MagazzinoPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState(""); const [cat, setCat] = useState(""); const [stock, setStock] = useState(""); const [showInactive, setShowInactive] = useState(false);
  // movements
  const [mov, setMov] = useState<ProductRow | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [movQty, setMovQty] = useState("1"); const [movReason, setMovReason] = useState("");

  const load = useCallback(async () => { setProducts(await fetch("/api/products").then((r) => r.json())); setLoading(false); }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))) as string[], [products]);
  const filtered = useMemo(() => products.filter((p) => {
    if (!showInactive && !p.active) return false;
    if (q && !`${p.name} ${p.brand ?? ""} ${p.sku ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    if (cat && p.category !== cat) return false;
    if (stock === "low" && !(p.stock_qty <= p.low_stock_threshold && p.stock_qty > 0)) return false;
    if (stock === "out" && p.stock_qty > 0) return false;
    return true;
  }), [products, q, cat, stock, showInactive]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 12);
  const activeFilters = (q ? 1 : 0) + (cat ? 1 : 0) + (stock ? 1 : 0) + (showInactive ? 1 : 0);

  function openNew() { setForm(empty); setEditing("new"); setError(""); }
  function openEdit(p: ProductRow) { setForm({ name: p.name, brand: p.brand ?? "", category: p.category ?? "", sku: p.sku ?? "", price_euro: p.price_cents == null ? "" : (p.price_cents / 100).toFixed(2), cost_euro: p.cost_cents == null ? "" : (p.cost_cents / 100).toFixed(2), stock_qty: String(p.stock_qty), low_stock_threshold: String(p.low_stock_threshold) }); setEditing(p.id); setError(""); }
  async function save() {
    setSaving(true); setError("");
    const cents = (v: string) => (v === "" ? null : Math.round(Number(v.replace(",", ".")) * 100));
    const payload = { name: form.name, brand: form.brand, category: form.category, sku: form.sku, price_cents: cents(form.price_euro), cost_cents: cents(form.cost_euro), stock_qty: Number(form.stock_qty), low_stock_threshold: Number(form.low_stock_threshold) };
    const res = await fetch(editing === "new" ? "/api/products" : `/api/products/${editing}`, { method: editing === "new" ? "POST" : "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || "Errore."); return; }
    setEditing(null); load();
  }
  async function toggle(p: ProductRow) { await fetch(`/api/products/${p.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !p.active }) }); load(); }

  async function openMov(p: ProductRow) { setMov(p); setMovQty("1"); setMovReason(""); setMovs(await fetch(`/api/products/${p.id}/movement`).then((r) => r.json())); }
  async function doMove(sign: 1 | -1) {
    if (!mov) return;
    const delta = sign * Math.abs(Number(movQty) || 0);
    if (!delta) return;
    const res = await fetch(`/api/products/${mov.id}/movement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta, reason: movReason }) });
    if (res.ok) { const updated = await res.json(); setMov(updated); setMovs(await fetch(`/api/products/${mov.id}/movement`).then((r) => r.json())); setMovQty("1"); setMovReason(""); load(); }
  }

  return (
    <AppShell title="Magazzino" subtitle="Prodotti in vendita, scorte e movimenti." actions={<Button size="sm" onClick={openNew}><Plus size={15} /> <span className="hidden sm:inline">Aggiungi</span></Button>}>
      <Filters activeCount={activeFilters} onReset={() => { setQ(""); setCat(""); setStock(""); setShowInactive(false); }}>
        <FilterField label="Cerca"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, marca, SKU" /></FilterField>
        <FilterField label="Categoria"><Select value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Tutte</option>{categories.map((c) => <option key={c} value={c}>{c}</option>)}</Select></FilterField>
        <FilterField label="Scorte"><Select value={stock} onChange={(e) => setStock(e.target.value)}><option value="">Tutte</option><option value="low">In esaurimento</option><option value="out">Esaurite</option></Select></FilterField>
        <label className="flex items-center gap-2 text-sm text-muted self-end"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Mostra disattivati</label>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageItems.map((p) => {
              const out = p.stock_qty <= 0, low = !out && p.stock_qty <= p.low_stock_threshold;
              return (
                <Card key={p.id} className={`p-4 ${p.active ? "" : "opacity-40"}`}>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Package size={18} /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{p.name}</p><p className="text-xs text-muted truncate">{[p.brand, p.category].filter(Boolean).join(" · ") || "—"}</p></div>
                  </div>
                  <div className="flex items-center justify-between mt-3">
                    <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{euro(p.price_cents)}</span>
                    {out ? <Badge tone="danger"><AlertTriangle size={11} className="inline mr-1" />Esaurito</Badge> : low ? <Badge tone="warning">{p.stock_qty} rimasti</Badge> : <Badge tone="neutral">{p.stock_qty} in stock</Badge>}
                  </div>
                  <div className="flex items-center gap-3 justify-end mt-3 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
                    <button onClick={() => openMov(p)} className="text-xs text-muted hover:text-accent flex items-center gap-1"><ArrowDownUp size={13} /> Movimenti</button>
                    <button onClick={() => toggle(p)} className="text-xs text-muted hover:opacity-70">{p.active ? "Disattiva" : "Attiva"}</button>
                    <button onClick={() => openEdit(p)} className="text-accent hover:opacity-70" title="Modifica"><Pencil size={14} /></button>
                  </div>
                </Card>
              );
            })}
          </div>
          {filtered.length === 0 && <p className="text-sm text-faint py-8 text-center">Nessun prodotto.</p>}
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === "new" ? "Nuovo prodotto" : "Modifica prodotto"}>
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Marca"><Input value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} /></Field><Field label="Categoria"><Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Prezzo (euro)"><Input value={form.price_euro} onChange={(e) => setForm({ ...form, price_euro: e.target.value })} /></Field><Field label="Costo (euro)"><Input value={form.cost_euro} onChange={(e) => setForm({ ...form, cost_euro: e.target.value })} placeholder="opzionale" /></Field></div>
          <div className="grid grid-cols-2 gap-3"><Field label="Quantità in stock"><Input type="number" value={form.stock_qty} onChange={(e) => setForm({ ...form, stock_qty: e.target.value })} /></Field><Field label="Soglia scorta minima"><Input type="number" value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.value })} /></Field></div>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEditing(null)}>Annulla</Button><Button onClick={save} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>

      <Modal open={!!mov} onClose={() => setMov(null)} title={mov?.name ?? ""} subtitle={mov ? `${mov.stock_qty} in stock` : ""}>
        {mov && (
          <div>
            <div className="flex items-end gap-2 mb-4">
              <Field label="Quantità"><Input type="number" value={movQty} onChange={(e) => setMovQty(e.target.value)} /></Field>
              <Field label="Motivo"><Input value={movReason} onChange={(e) => setMovReason(e.target.value)} placeholder="opzionale" /></Field>
            </div>
            <div className="flex gap-2 mb-4">
              <Button variant="secondary" className="flex-1" onClick={() => doMove(1)}><ArrowUp size={14} /> Carico</Button>
              <Button variant="secondary" className="flex-1" onClick={() => doMove(-1)}><ArrowDown size={14} /> Scarico</Button>
            </div>
            <p className="text-xs uppercase tracking-wide text-faint mb-2">Movimenti recenti</p>
            <div className="max-h-52 overflow-y-auto thin-scroll space-y-1">
              {movs.length === 0 ? <p className="text-sm text-faint text-center py-2">Nessun movimento.</p> : movs.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                  <span className="text-muted">{fmtDT(m.created_at)}{m.reason ? ` · ${m.reason}` : ""}</span>
                  <span className="font-medium tabular-nums" style={{ color: m.delta > 0 ? "var(--success)" : "var(--danger)" }}>{m.delta > 0 ? "+" : ""}{m.delta}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
