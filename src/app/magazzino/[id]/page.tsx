"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Package, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Field, Input } from "@/components/ui";
import type { ProductRow } from "@/lib/gestionale-types";

const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));
const fmtDT = (iso: string) => new Date(iso).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
interface Mov { id: string; delta: number; reason: string | null; created_at: string }
type P = ProductRow & { consumedBy?: { qty: number; name: string }[] };

export default function ProductDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [p, setP] = useState<P | null>(null);
  const [movs, setMovs] = useState<Mov[]>([]);
  const [loading, setLoading] = useState(true);
  const [qty, setQty] = useState("1"); const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    const [prod, m] = await Promise.all([fetch(`/api/products/${id}`).then((r) => r.json()), fetch(`/api/products/${id}/movement`).then((r) => r.json())]);
    setP(prod); setMovs(Array.isArray(m) ? m : []); setLoading(false);
  }, [id]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  async function move(sign: 1 | -1) {
    const delta = sign * Math.abs(Number(qty) || 0);
    if (!delta) return;
    await fetch(`/api/products/${id}/movement`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta, reason }) });
    setQty("1"); setReason(""); load();
  }

  const out = p ? p.stock_qty <= 0 : false, low = p ? !out && p.stock_qty <= p.low_stock_threshold : false;

  return (
    <AppShell title="Magazzino" subtitle={p?.name}>
      <Link href="/magazzino" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent mb-4"><ArrowLeft size={15} /> Magazzino</Link>
      {loading || !p ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Package size={20} /></div>
                <div className="min-w-0"><p className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>{p.name}</p><p className="text-sm text-muted truncate">{[p.brand, p.category].filter(Boolean).join(" · ") || "—"}</p></div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted">Prezzo</span><span style={{ color: "var(--text)" }}>{euro(p.price_cents)}</span></div>
                <div className="flex justify-between"><span className="text-muted">Costo</span><span style={{ color: "var(--text)" }}>{euro(p.cost_cents)}</span></div>
                {p.sku && <div className="flex justify-between"><span className="text-muted">SKU</span><span style={{ color: "var(--text)" }}>{p.sku}</span></div>}
                <div className="flex justify-between items-center pt-2" style={{ borderTop: "1px solid var(--border)" }}><span className="text-muted">Scorta</span>{out ? <Badge tone="danger"><AlertTriangle size={11} className="inline mr-1" />Esaurito</Badge> : low ? <Badge tone="warning">{p.stock_qty} rimasti</Badge> : <Badge tone="neutral">{p.stock_qty} in stock</Badge>}</div>
                <div className="flex justify-between"><span className="text-muted">Soglia minima</span><span style={{ color: "var(--text)" }}>{p.low_stock_threshold}</span></div>
              </div>
            </Card>
            {p.consumedBy && p.consumedBy.length > 0 && (
              <Card className="p-5">
                <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Consumato dai servizi</p>
                <div className="space-y-1">{p.consumedBy.map((c, i) => (<div key={i} className="flex justify-between text-sm"><span style={{ color: "var(--text)" }}>{c.name}</span><span className="text-muted">{c.qty}×</span></div>))}</div>
              </Card>
            )}
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Carico / Scarico</p>
              <div className="flex items-end gap-2 flex-wrap">
                <Field label="Quantità"><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></Field>
                <Field label="Motivo"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="opzionale" /></Field>
                <Button variant="secondary" onClick={() => move(1)}><ArrowUp size={14} /> Carico</Button>
                <Button variant="secondary" onClick={() => move(-1)}><ArrowDown size={14} /> Scarico</Button>
              </div>
            </Card>
            <Card className="p-5">
              <p className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Storico movimenti</p>
              {movs.length === 0 ? <p className="text-sm text-faint py-3 text-center">Nessun movimento.</p> : (
                <div className="space-y-1">{movs.map((m) => (<div key={m.id} className="flex items-center justify-between text-sm py-2 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}><span className="text-muted">{fmtDT(m.created_at)}{m.reason ? ` · ${m.reason}` : ""}</span><span className="font-medium tabular-nums" style={{ color: m.delta > 0 ? "var(--success)" : "var(--danger)" }}>{m.delta > 0 ? "+" : ""}{m.delta}</span></div>))}</div>
              )}
            </Card>
          </div>
        </div>
      )}
    </AppShell>
  );
}
