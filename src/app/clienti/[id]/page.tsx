"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, Plus, Receipt, X, Printer } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { SALON } from "@/lib/salon-config";
import type { ClientRow, Sale, SaleItem, ProductRow, ServiceRow, AppointmentWithRelations } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };

interface Line { key: string; kind: "product" | "service"; product_id?: string; service_id?: string; description: string; qty: number; unit_price_cents: number }

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [edit, setEdit] = useState(false);
  const [eform, setEform] = useState({ name: "", phone: "", email: "" });
  const [saleOpen, setSaleOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const d = await fetch(`/api/clients/${id}`).then((r) => r.json());
    setClient(d.client); setAppts(d.appointments ?? []); setSales(d.sales ?? []); setNotesDraft(d.client?.notes ?? ""); setLoading(false);
  }, [id]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  useEffect(() => {
    Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/services").then((r) => r.json())]).then(([p, s]) => {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setProducts((p as ProductRow[]).filter((x) => x.active));
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setServices((s as ServiceRow[]).filter((x) => x.active));
    });
  }, []);

  async function saveNotes() { await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesDraft }) }); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 1500); load(); }
  function openEdit() { if (!client) return; setEform({ name: client.name ?? "", phone: client.phone, email: client.email ?? "" }); setErr(""); setEdit(true); }
  async function saveEdit() { const res = await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eform) }); if (!res.ok) { setErr((await res.json()).error || "Errore."); return; } setEdit(false); load(); }
  async function remove() { if (!confirm("Eliminare definitivamente questo cliente?")) return; await fetch(`/api/clients/${id}`, { method: "DELETE" }); router.push("/clienti"); }

  function addLine() {
    if (!pick) return;
    const [kind, itemId] = pick.split(":");
    if (kind === "product") { const p = products.find((x) => x.id === itemId); if (p) setLines((l) => [...l, { key: Math.random().toString(36).slice(2), kind: "product", product_id: p.id, description: p.name, qty: 1, unit_price_cents: p.price_cents ?? 0 }]); }
    else { const s = services.find((x) => x.id === itemId); if (s) setLines((l) => [...l, { key: Math.random().toString(36).slice(2), kind: "service", service_id: s.id, description: s.name, qty: 1, unit_price_cents: s.price_cents ?? 0 }]); }
    setPick("");
  }
  const saleTotal = lines.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
  async function saveSale() {
    if (!client || lines.length === 0) return;
    await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: client.id, customer_phone: client.phone, items: lines.map((l) => ({ kind: l.kind, product_id: l.product_id, service_id: l.service_id, description: l.description, qty: l.qty, unit_price_cents: l.unit_price_cents })) }) });
    setSaleOpen(false); setLines([]); load();
  }

  return (
    <AppShell title="Clienti" subtitle={client?.name || client?.phone} actions={client && <><Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} /> <span className="hidden sm:inline">Modifica</span></Button><Button size="sm" variant="danger" onClick={remove}><Trash2 size={14} /></Button></>}>
      <Link href="/clienti" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent mb-4"><ArrowLeft size={15} /> Clienti</Link>
      {loading || !client ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{(client.name || client.phone).slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0"><p className="text-base font-semibold truncate" style={{ color: "var(--text)" }}>{client.name || "Senza nome"}</p><p className="text-sm text-muted">{client.phone}</p></div>
              </div>
              {client.email && <p className="text-sm text-muted">{client.email}</p>}
              <p className="text-xs text-faint mt-2">Cliente dal {fmtDate(client.created_at)}</p>
            </Card>

            <Card className="p-5">
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Note</p>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5} placeholder="Preferenze, allergie, colore abituale…" className="w-full rounded-lg text-sm p-3 outline-none resize-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <div className="flex justify-end mt-2"><Button size="sm" variant="secondary" onClick={saveNotes}>{notesSaved ? "✓ Salvato" : "Salva note"}</Button></div>
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Acquisti e ricevute</h2>
                <Button size="sm" onClick={() => { setLines([]); setSaleOpen(true); }}><Plus size={14} /> Vendita</Button>
              </div>
              {sales.length === 0 ? <p className="text-sm text-faint py-4 text-center">Nessun acquisto registrato.</p> : (
                <div className="space-y-1">
                  {sales.map((s) => (
                    <button key={s.id} onClick={() => setReceipt(s)} className="w-full flex items-center gap-3 py-2.5 border-t first:border-t-0 text-left hover:opacity-80" style={{ borderColor: "var(--border)" }}>
                      <Receipt size={16} className="text-faint shrink-0" />
                      <div className="flex-1 min-w-0"><p className="text-sm" style={{ color: "var(--text)" }}>{s.items?.length ?? 0} voci</p><p className="text-xs text-muted">{fmtDateTime(s.created_at)}</p></div>
                      <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{euro(s.total_cents)}</span>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Storico appuntamenti</h2>
              {appts.length === 0 ? <p className="text-sm text-faint py-4 text-center">Nessun appuntamento.</p> : (
                <div className="space-y-1">
                  {appts.map((a) => (
                    <div key={a.id} className="flex items-center gap-4 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <div className="flex-1 min-w-0"><p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name ?? "Servizio"}</p><p className="text-xs text-muted truncate">{fmtDateTime(a.starts_at)} · {a.stylist?.name ?? ""}</p></div>
                      <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title="Modifica cliente">
        <div className="space-y-3">
          <Field label="Nome"><Input value={eform.name} onChange={(e) => setEform({ ...eform, name: e.target.value })} /></Field>
          <Field label="Telefono"><Input value={eform.phone} onChange={(e) => setEform({ ...eform, phone: e.target.value })} /></Field>
          <Field label="Email"><Input value={eform.email} onChange={(e) => setEform({ ...eform, email: e.target.value })} /></Field>
        </div>
        {err && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEdit(false)}>Annulla</Button><Button onClick={saveEdit}>Salva</Button></div>
      </Modal>

      <Modal open={saleOpen} onClose={() => setSaleOpen(false)} title="Registra vendita">
        <div className="flex gap-2 mb-3">
          <Select value={pick} onChange={(e) => setPick(e.target.value)}>
            <option value="">Aggiungi prodotto o servizio…</option>
            <optgroup label="Prodotti">{products.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name} — {euro(p.price_cents)}</option>)}</optgroup>
            <optgroup label="Servizi">{services.map((s) => <option key={s.id} value={`service:${s.id}`}>{s.name} — {euro(s.price_cents)}</option>)}</optgroup>
          </Select>
          <Button variant="secondary" onClick={addLine}>Aggiungi</Button>
        </div>
        {lines.length === 0 ? <p className="text-sm text-faint py-3 text-center">Nessuna voce.</p> : (
          <div className="space-y-2 mb-3">
            {lines.map((l) => (
              <div key={l.key} className="flex items-center gap-2">
                <span className="flex-1 text-sm truncate" style={{ color: "var(--text)" }}>{l.description}</span>
                <input type="number" min={1} value={l.qty} onChange={(e) => setLines((arr) => arr.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-14 h-8 px-2 rounded-lg text-sm text-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
                <span className="w-16 text-right text-sm tabular-nums" style={{ color: "var(--text)" }}>{euro(l.unit_price_cents * l.qty)}</span>
                <button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="text-faint hover:text-[var(--danger)]"><X size={15} /></button>
              </div>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}>
          <span className="text-sm text-muted">Totale</span><span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{euro(saleTotal)}</span>
        </div>
        <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setSaleOpen(false)}>Annulla</Button><Button onClick={saveSale} disabled={lines.length === 0}>Registra</Button></div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Ricevuta" subtitle={receipt ? fmtDateTime(receipt.created_at) : ""}>
        {receipt && (
          <div>
            <div id="receipt-print" className="rounded-lg p-4" style={{ background: "var(--surface-2)" }}>
              <p className="text-center text-sm font-semibold" style={{ color: "var(--text)" }}>{SALON.name}</p>
              <p className="text-center text-xs text-muted mb-3">{SALON.address}</p>
              <div className="space-y-1">
                {(receipt.items ?? []).map((it: SaleItem) => (
                  <div key={it.id} className="flex justify-between text-sm"><span style={{ color: "var(--text)" }}>{it.qty}× {it.description}</span><span className="tabular-nums" style={{ color: "var(--text)" }}>{euro(it.unit_price_cents * it.qty)}</span></div>
                ))}
              </div>
              <div className="flex justify-between mt-3 pt-3 text-sm font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}><span>Totale</span><span className="tabular-nums">{euro(receipt.total_cents)}</span></div>
              <p className="text-center text-[10px] text-faint mt-3">Documento non fiscale</p>
            </div>
            <div className="flex justify-end gap-2 mt-4"><Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={14} /> Stampa</Button></div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
