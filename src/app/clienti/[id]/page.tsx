"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Pencil, Trash2, Plus, Minus, Receipt, X, Printer, FlaskConical, ImagePlus, AlertCircle, Copy, Droplet, Star, Award } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Badge, Modal, Field, Input, Select } from "@/components/ui";
import { SALON } from "@/lib/salon-config";
import { loyaltyTier } from "@/lib/loyalty";
import type { ClientRow, Sale, SaleItem, ColorSession, ColorSessionItem, ProductRow, ServiceRow, AppointmentWithRelations } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const euro = (c: number | null) => (c == null ? "—" : "€" + (c / 100).toFixed(2).replace(".", ","));
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const fmtDateTime = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: TZ, day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };
const SERVICE_TYPES = ["Ritocco radici", "Colore completo", "Balayage", "Decolorazione", "Toner", "Colpi di sole"];
const TECHNIQUES = ["Radici", "Lunghezze", "Foil", "Mano libera"];
const HAIR_STATES = ["Naturale", "Colorato", "Decolorato"];

interface Line { key: string; kind: "product" | "service"; product_id?: string; service_id?: string; description: string; qty: number; unit_price_cents: number }
interface ItemRow { key: string; role: "colore" | "ossigeno" | "additivo"; brand: string; line: string; tone: string; quantity: string; volumes: string }
type Sess = ColorSession & { items?: ColorSessionItem[]; stylist?: { name: string } | null };

const emptySess = { date: todayStr(), service_type: "", base_level: "", white_pct: "", hair_state: "", technique: "", processing_min: "", result: "", notes: "", before_photo_url: "", after_photo_url: "", appointment_id: "", stylist_id: "" };
const nk = () => Math.random().toString(36).slice(2);

function summarize(items: ColorSessionItem[] | undefined, processingMin: number | null) {
  const its = items ?? [];
  const colors = its.filter((i) => i.role !== "ossigeno").map((i) => `${i.brand ? i.brand + " " : ""}${i.tone ?? ""}${i.quantity ? ` ${i.quantity}g` : ""}`.trim()).filter(Boolean);
  const ox = its.filter((i) => i.role === "ossigeno").map((i) => `Oss. ${i.volumes ?? "?"}vol`);
  const parts = [colors.join(" + "), ox.join(" "), processingMin ? `${processingMin}min` : ""].filter(Boolean);
  return parts.join(" · ") || "Formula";
}

export default function ClientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [client, setClient] = useState<ClientRow | null>(null);
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [sessions, setSessions] = useState<Sess[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [stylists, setStylists] = useState<{ id: string; name: string }[]>([]);
  const [options, setOptions] = useState<{ brands: string[]; lines: string[]; tones: string[] }>({ brands: [], lines: [], tones: [] });
  const [loading, setLoading] = useState(true);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaved, setNotesSaved] = useState(false);
  const [edit, setEdit] = useState(false);
  const [eform, setEform] = useState({ name: "", phone: "", email: "", allergies: "", patch_test_date: "", patch_test_result: "", birthdate: "" });
  const [saleOpen, setSaleOpen] = useState(false);
  const [lines, setLines] = useState<Line[]>([]);
  const [pick, setPick] = useState("");
  const [receipt, setReceipt] = useState<Sale | null>(null);
  // color session form
  const [ccOpen, setCcOpen] = useState(false);
  const [ccId, setCcId] = useState<string | null>(null);
  const [sess, setSess] = useState(emptySess);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [detail, setDetail] = useState<Sess | null>(null);
  const [err, setErr] = useState("");
  const [loyalty, setLoyalty] = useState<{ id: string; delta: number; reason: string | null; created_at: string }[]>([]);
  const [adjOpen, setAdjOpen] = useState(false);
  const [adj, setAdj] = useState({ delta: "", reason: "" });

  const load = useCallback(async () => {
    const d = await fetch(`/api/clients/${id}`).then((r) => r.json());
    setClient(d.client); setAppts(d.appointments ?? []); setSales(d.sales ?? []); setSessions(d.colorSessions ?? []); setTotalSpent(d.totalSpent ?? 0); setLoyalty(d.loyalty ?? []); setNotesDraft(d.client?.notes ?? ""); setLoading(false);
  }, [id]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  useEffect(() => {
    Promise.all([fetch("/api/products").then((r) => r.json()), fetch("/api/services").then((r) => r.json()), fetch("/api/stylists").then((r) => r.json()), fetch("/api/color-options").then((r) => r.json())]).then(([p, s, st, o]) => {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setProducts((p as ProductRow[]).filter((x) => x.active));
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setServices((s as ServiceRow[]).filter((x) => x.active));
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setStylists((st as { id: string; name: string; active: boolean }[]).filter((x) => x.active).map((x) => ({ id: x.id, name: x.name })));
      /* eslint-disable-next-line react-hooks/set-state-in-effect */ setOptions(o);
    });
  }, []);
  // Calendar hook: /clienti/[id]?color=<appointmentId>&stylist=<id> opens a new session.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("color")) { openSessNew(sp.get("color") || "", sp.get("stylist") || ""); router.replace(`/clienti/${id}`); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveNotes() { await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ notes: notesDraft }) }); setNotesSaved(true); setTimeout(() => setNotesSaved(false), 1500); load(); }
  function openEdit() { if (!client) return; setEform({ name: client.name ?? "", phone: client.phone, email: client.email ?? "", allergies: client.allergies ?? "", patch_test_date: client.patch_test_date ?? "", patch_test_result: client.patch_test_result ?? "", birthdate: client.birthdate ?? "" }); setErr(""); setEdit(true); }
  async function saveEdit() { const res = await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(eform) }); if (!res.ok) { setErr((await res.json()).error || "Errore."); return; } setEdit(false); load(); }
  async function remove() { if (!confirm("Eliminare definitivamente questo cliente?")) return; await fetch(`/api/clients/${id}`, { method: "DELETE" }); router.push("/clienti"); }
  async function togglePriority() { if (!client) return; await fetch(`/api/clients/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ priority: !client.priority }) }); load(); }
  async function adjustPoints() { const delta = Number(adj.delta); if (!delta) return; await fetch(`/api/clients/${id}/loyalty`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ delta, reason: adj.reason }) }); setAdjOpen(false); setAdj({ delta: "", reason: "" }); load(); }

  function addLine() { if (!pick) return; const [kind, itemId] = pick.split(":"); if (kind === "product") { const p = products.find((x) => x.id === itemId); if (p) setLines((l) => [...l, { key: nk(), kind: "product", product_id: p.id, description: p.name, qty: 1, unit_price_cents: p.price_cents ?? 0 }]); } else { const s = services.find((x) => x.id === itemId); if (s) setLines((l) => [...l, { key: nk(), kind: "service", service_id: s.id, description: s.name, qty: 1, unit_price_cents: s.price_cents ?? 0 }]); } setPick(""); }
  const saleTotal = lines.reduce((s, l) => s + l.unit_price_cents * l.qty, 0);
  async function saveSale() { if (!client || lines.length === 0) return; await fetch("/api/sales", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: client.id, customer_phone: client.phone, items: lines.map((l) => ({ kind: l.kind, product_id: l.product_id, service_id: l.service_id, description: l.description, qty: l.qty, unit_price_cents: l.unit_price_cents })) }) }); setSaleOpen(false); setLines([]); load(); }

  // ---- color sessions ----
  function toItemRows(its: ColorSessionItem[]): ItemRow[] { return its.map((i) => ({ key: nk(), role: i.role, brand: i.brand ?? "", line: i.line ?? "", tone: i.tone ?? "", quantity: i.quantity == null ? "" : String(i.quantity), volumes: i.volumes == null ? "" : String(i.volumes) })); }
  function openSessNew(appointmentId = "", stylistId = "") { setSess({ ...emptySess, appointment_id: appointmentId, stylist_id: stylistId }); setItems([{ key: nk(), role: "colore", brand: "", line: "", tone: "", quantity: "", volumes: "" }]); setCcId(null); setCcOpen(true); }
  function openSessEdit(s: Sess) { setSess({ date: s.date, service_type: s.service_type ?? "", base_level: s.base_level == null ? "" : String(s.base_level), white_pct: s.white_pct == null ? "" : String(s.white_pct), hair_state: s.hair_state ?? "", technique: s.technique ?? "", processing_min: s.processing_min == null ? "" : String(s.processing_min), result: s.result ?? "", notes: s.notes ?? "", before_photo_url: s.before_photo_url ?? "", after_photo_url: s.after_photo_url ?? "", appointment_id: s.appointment_id ?? "", stylist_id: s.stylist_id ?? "" }); setItems(toItemRows(s.items ?? [])); setCcId(s.id); setCcOpen(true); }
  function duplicateLast() { const last = sessions[0]; if (!last) return; setSess({ date: todayStr(), service_type: last.service_type ?? "", base_level: last.base_level == null ? "" : String(last.base_level), white_pct: last.white_pct == null ? "" : String(last.white_pct), hair_state: last.hair_state ?? "", technique: last.technique ?? "", processing_min: last.processing_min == null ? "" : String(last.processing_min), result: "", notes: "", before_photo_url: "", after_photo_url: "", appointment_id: "", stylist_id: last.stylist_id ?? "" }); setItems(toItemRows(last.items ?? [])); setCcId(null); setCcOpen(true); }
  function addItem(role: ItemRow["role"]) { setItems((l) => [...l, { key: nk(), role, brand: "", line: "", tone: "", quantity: "", volumes: role === "ossigeno" ? "20" : "" }]); }
  function updItem(key: string, patch: Partial<ItemRow>) { setItems((l) => l.map((x) => (x.key === key ? { ...x, ...patch } : x))); }
  async function saveSess() {
    const body: Record<string, unknown> = { ...sess, items: items.map((i) => ({ role: i.role, brand: i.brand, line: i.line, tone: i.tone, quantity: i.quantity, volumes: i.volumes })) };
    if (!ccId) body.client_id = id;
    await fetch(ccId ? `/api/color-sessions/${ccId}` : "/api/color-sessions", { method: ccId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setCcOpen(false); load();
  }
  async function deleteSess(sid: string) { if (!confirm("Eliminare questa scheda colore?")) return; await fetch(`/api/color-sessions/${sid}`, { method: "DELETE" }); setDetail(null); load(); }

  return (
    <AppShell title="Clienti" subtitle={client?.name || client?.phone} actions={client && <><button onClick={togglePriority} title="Cliente prioritario" className="w-9 h-9 rounded-lg flex items-center justify-center hover-surface" style={{ border: "1px solid var(--border)" }}><Star size={16} style={client.priority ? { color: "var(--warning)", fill: "var(--warning)" } : { color: "var(--text-muted)" }} /></button><Button size="sm" variant="secondary" onClick={openEdit}><Pencil size={14} /> <span className="hidden sm:inline">Modifica</span></Button><Button size="sm" variant="danger" onClick={remove}><Trash2 size={14} /></Button></>}>
      <Link href="/clienti" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-accent mb-4"><ArrowLeft size={15} /> Clienti</Link>
      {loading || !client ? <p className="text-sm text-muted">Caricamento…</p> : (
        <div className="grid lg:grid-cols-3 gap-4">
          <div className="space-y-4">
            <Card className="p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-14 h-14 rounded-full flex items-center justify-center text-lg font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{(client.name || client.phone).slice(0, 2).toUpperCase()}</div>
                <div className="min-w-0"><p className="text-base font-semibold truncate flex items-center gap-1.5" style={{ color: "var(--text)" }}>{client.priority && <Star size={14} className="shrink-0" style={{ color: "var(--warning)", fill: "var(--warning)" }} />}{client.name || "Senza nome"}</p><p className="text-sm text-muted">{client.phone}</p></div>
              </div>
              {client.email && <p className="text-sm text-muted mb-1">{client.email}</p>}
              <div className="flex items-center justify-between py-2 mt-2" style={{ borderTop: "1px solid var(--border)" }}><span className="text-xs text-muted">Spesa totale</span><span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{euro(totalSpent)}</span></div>
              {client.birthdate && <div className="flex items-center justify-between text-sm"><span className="text-xs text-muted">Compleanno</span><span style={{ color: "var(--text)" }}>{fmtDate(client.birthdate)}</span></div>}
              {(client.allergies || client.patch_test_date) && (
                <div className="mt-3 p-3 rounded-lg" style={{ background: "var(--warning-soft)" }}>
                  <div className="flex items-center gap-1.5 mb-1" style={{ color: "var(--warning)" }}><AlertCircle size={14} /><span className="text-xs font-semibold">Allergie / Patch test</span></div>
                  {client.allergies && <p className="text-xs" style={{ color: "var(--text)" }}>{client.allergies}</p>}
                  {client.patch_test_date && <p className="text-[11px] text-muted mt-0.5">Patch test: {fmtDate(client.patch_test_date)}{client.patch_test_result ? ` — ${client.patch_test_result}` : ""}</p>}
                </div>
              )}
              <p className="text-xs text-faint mt-3">Cliente dal {fmtDate(client.created_at.slice(0, 10))}</p>
            </Card>

            <Card className="p-5">
              <p className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>Note e preferenze</p>
              <textarea value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)} rows={5} placeholder="Preferenze, carattere, richieste…" className="w-full rounded-lg text-sm p-3 outline-none resize-none" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} />
              <div className="flex justify-end mt-2"><Button size="sm" variant="secondary" onClick={saveNotes}>{notesSaved ? "✓ Salvato" : "Salva note"}</Button></div>
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}><Award size={15} className="text-accent" /> Fedeltà</h2>
                <Badge tone={loyaltyTier(client.loyalty_points).tone}>{loyaltyTier(client.loyalty_points).name}</Badge>
              </div>
              <div className="flex items-end justify-between">
                <div><p className="text-3xl font-semibold" style={{ color: "var(--text)" }}>{client.loyalty_points}</p><p className="text-xs text-muted">punti</p></div>
                <Button size="sm" variant="secondary" onClick={() => { setAdj({ delta: "", reason: "" }); setAdjOpen(true); }}>Gestisci punti</Button>
              </div>
              {loyalty.length > 0 && (
                <div className="mt-3 pt-3 space-y-1 max-h-32 overflow-y-auto thin-scroll" style={{ borderTop: "1px solid var(--border)" }}>
                  {loyalty.map((l) => (<div key={l.id} className="flex items-center justify-between text-xs"><span className="text-muted">{l.reason || (l.delta > 0 ? "aggiunta" : "riscatto")}</span><span className="font-medium tabular-nums" style={{ color: l.delta > 0 ? "var(--success)" : "var(--danger)" }}>{l.delta > 0 ? "+" : ""}{l.delta}</span></div>))}
                </div>
              )}
            </Card>
          </div>

          <div className="lg:col-span-2 space-y-4">
            <Card className="p-5">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text)" }}><FlaskConical size={15} className="text-accent" /> Storico colore</h2>
                <div className="flex gap-2">
                  {sessions.length > 0 && <Button size="sm" variant="secondary" onClick={duplicateLast}><Copy size={13} /> Duplica ultima</Button>}
                  <Button size="sm" onClick={() => openSessNew()}><Plus size={14} /> Scheda</Button>
                </div>
              </div>
              {sessions.length === 0 ? <p className="text-sm text-faint py-4 text-center">Nessuna scheda colore.</p> : (
                <div className="space-y-2">
                  {sessions.map((s) => (
                    <button key={s.id} onClick={() => setDetail(s)} className="w-full text-left rounded-xl p-3 hover-surface transition-colors flex gap-3" style={{ background: "var(--surface-2)" }}>
                      {s.after_photo_url ? <img src={s.after_photo_url} alt="" className="w-12 h-12 rounded-lg object-cover shrink-0" /> : <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Droplet size={16} /></div>}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{summarize(s.items, s.processing_min)}</p>
                        <p className="text-xs text-muted truncate">{fmtDate(s.date)}{s.service_type ? ` · ${s.service_type}` : ""}{s.stylist?.name ? ` · ${s.stylist.name}` : ""}{s.base_level ? ` · base ${s.base_level}` : ""}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <div className="flex items-center justify-between mb-3"><h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Acquisti e ricevute</h2><Button size="sm" onClick={() => { setLines([]); setSaleOpen(true); }}><Plus size={14} /> Vendita</Button></div>
              {sales.length === 0 ? <p className="text-sm text-faint py-4 text-center">Nessun acquisto registrato.</p> : (
                <div className="space-y-1">{sales.map((s) => (<button key={s.id} onClick={() => setReceipt(s)} className="w-full flex items-center gap-3 py-2.5 border-t first:border-t-0 text-left hover:opacity-80" style={{ borderColor: "var(--border)" }}><Receipt size={16} className="text-faint shrink-0" /><div className="flex-1 min-w-0"><p className="text-sm" style={{ color: "var(--text)" }}>{s.items?.length ?? 0} voci</p><p className="text-xs text-muted">{fmtDateTime(s.created_at)}</p></div><span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{euro(s.total_cents)}</span></button>))}</div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-3" style={{ color: "var(--text)" }}>Storico appuntamenti</h2>
              {appts.length === 0 ? <p className="text-sm text-faint py-4 text-center">Nessun appuntamento.</p> : (
                <div className="space-y-1">{appts.map((a) => (<div key={a.id} className="flex items-center gap-4 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}><div className="flex-1 min-w-0"><p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name ?? "Servizio"}</p><p className="text-xs text-muted truncate">{fmtDateTime(a.starts_at)} · {a.stylist?.name ?? ""}</p></div><Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge></div>))}</div>
              )}
            </Card>
          </div>
        </div>
      )}

      <Modal open={edit} onClose={() => setEdit(false)} title="Modifica cliente">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3"><Field label="Nome"><Input value={eform.name} onChange={(e) => setEform({ ...eform, name: e.target.value })} /></Field><Field label="Telefono"><Input value={eform.phone} onChange={(e) => setEform({ ...eform, phone: e.target.value })} /></Field></div>
          <Field label="Email"><Input value={eform.email} onChange={(e) => setEform({ ...eform, email: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Compleanno"><Input type="date" value={eform.birthdate} onChange={(e) => setEform({ ...eform, birthdate: e.target.value })} /></Field><Field label="Data patch test"><Input type="date" value={eform.patch_test_date} onChange={(e) => setEform({ ...eform, patch_test_date: e.target.value })} /></Field></div>
          <Field label="Allergie / note mediche"><Input value={eform.allergies} onChange={(e) => setEform({ ...eform, allergies: e.target.value })} placeholder="es. allergia PPD" /></Field>
          <Field label="Esito patch test"><Input value={eform.patch_test_result} onChange={(e) => setEform({ ...eform, patch_test_result: e.target.value })} placeholder="es. negativo" /></Field>
        </div>
        {err && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{err}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setEdit(false)}>Annulla</Button><Button onClick={saveEdit}>Salva</Button></div>
      </Modal>

      <Modal open={ccOpen} onClose={() => setCcOpen(false)} title={ccId ? "Modifica scheda colore" : "Nuova scheda colore"}>
        <div className="space-y-4 max-h-[64vh] overflow-y-auto thin-scroll pr-1">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint mb-2">Diagnosi</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Data"><Input type="date" value={sess.date} onChange={(e) => setSess({ ...sess, date: e.target.value })} /></Field>
              <Field label="Operatore"><Select value={sess.stylist_id} onChange={(e) => setSess({ ...sess, stylist_id: e.target.value })}><option value="">—</option>{stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
              <Field label="Base naturale (1-10)"><Input type="number" value={sess.base_level} onChange={(e) => setSess({ ...sess, base_level: e.target.value })} /></Field>
              <Field label="% bianchi"><Input type="number" value={sess.white_pct} onChange={(e) => setSess({ ...sess, white_pct: e.target.value })} /></Field>
              <Field label="Stato capelli"><Select value={sess.hair_state} onChange={(e) => setSess({ ...sess, hair_state: e.target.value })}><option value="">—</option>{HAIR_STATES.map((h) => <option key={h} value={h}>{h}</option>)}</Select></Field>
              <Field label="Tipo servizio"><Select value={sess.service_type} onChange={(e) => setSess({ ...sess, service_type: e.target.value })}><option value="">—</option>{SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2"><p className="text-[11px] uppercase tracking-wide text-faint">Formula</p><div className="flex gap-1.5"><button onClick={() => addItem("colore")} className="text-xs px-2 py-1 rounded-lg hover-surface" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>+ Colore</button><button onClick={() => addItem("ossigeno")} className="text-xs px-2 py-1 rounded-lg hover-surface" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>+ Ossigeno</button></div></div>
            <div className="space-y-2">
              {items.map((it) => (
                <div key={it.key} className="rounded-lg p-2" style={{ background: "var(--surface-2)" }}>
                  <div className="flex items-center justify-between mb-1.5"><Badge tone={it.role === "ossigeno" ? "info" : "accent"}>{it.role}</Badge><button onClick={() => setItems((l) => l.filter((x) => x.key !== it.key))} className="text-faint hover:text-[var(--danger)]"><X size={14} /></button></div>
                  {it.role === "ossigeno" ? (
                    <div className="grid grid-cols-3 gap-2">
                      <Input value={it.brand} onChange={(e) => updItem(it.key, { brand: e.target.value })} placeholder="Marca" list="dl-brands" />
                      <Input value={it.volumes} onChange={(e) => updItem(it.key, { volumes: e.target.value })} placeholder="Volumi" type="number" />
                      <Input value={it.quantity} onChange={(e) => updItem(it.key, { quantity: e.target.value })} placeholder="ml" type="number" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <Input value={it.brand} onChange={(e) => updItem(it.key, { brand: e.target.value })} placeholder="Marca" list="dl-brands" />
                      <Input value={it.line} onChange={(e) => updItem(it.key, { line: e.target.value })} placeholder="Linea" list="dl-lines" />
                      <Input value={it.tone} onChange={(e) => updItem(it.key, { tone: e.target.value })} placeholder="Tono" list="dl-tones" />
                      <Input value={it.quantity} onChange={(e) => updItem(it.key, { quantity: e.target.value })} placeholder="grammi" type="number" />
                    </div>
                  )}
                </div>
              ))}
              {items.length === 0 && <p className="text-xs text-faint text-center py-2">Aggiungi i componenti della formula.</p>}
            </div>
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-wide text-faint mb-2">Chiusura</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Tecnica"><Select value={sess.technique} onChange={(e) => setSess({ ...sess, technique: e.target.value })}><option value="">—</option>{TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></Field>
              <Field label="Posa (min)"><Input type="number" value={sess.processing_min} onChange={(e) => setSess({ ...sess, processing_min: e.target.value })} /></Field>
            </div>
            <div className="mt-3"><Field label="Risultato / correzioni per la prossima volta"><Input value={sess.result} onChange={(e) => setSess({ ...sess, result: e.target.value })} /></Field></div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <PhotoField label="Foto prima" url={sess.before_photo_url} onChange={(u) => setSess({ ...sess, before_photo_url: u })} />
              <PhotoField label="Foto dopo" url={sess.after_photo_url} onChange={(u) => setSess({ ...sess, after_photo_url: u })} />
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setCcOpen(false)}>Annulla</Button><Button onClick={saveSess}>Salva</Button></div>
      </Modal>

      <Modal open={!!detail} onClose={() => setDetail(null)} title="Scheda colore" subtitle={detail ? `${fmtDate(detail.date)}${detail.stylist?.name ? " · " + detail.stylist.name : ""}` : ""}>
        {detail && (
          <div>
            <div className="rounded-lg p-3 mb-3" style={{ background: "var(--surface-2)" }}>
              <p className="text-sm font-medium mb-1" style={{ color: "var(--text)" }}>{summarize(detail.items, detail.processing_min)}</p>
              <p className="text-xs text-muted">{[detail.service_type, detail.base_level && `base ${detail.base_level}`, detail.white_pct != null && `${detail.white_pct}% bianchi`, detail.hair_state, detail.technique].filter(Boolean).join(" · ")}</p>
            </div>
            <div className="space-y-1 mb-3">
              {(detail.items ?? []).map((it) => (<div key={it.id} className="flex justify-between text-sm"><span style={{ color: "var(--text)" }}>{it.role === "ossigeno" ? `Ossigeno ${it.brand ?? ""}` : `${it.brand ?? ""} ${it.line ?? ""} ${it.tone ?? ""}`.trim()}</span><span className="text-muted">{it.role === "ossigeno" ? `${it.volumes ?? "?"}vol${it.quantity ? ` · ${it.quantity}ml` : ""}` : it.quantity ? `${it.quantity}g` : ""}</span></div>))}
            </div>
            {detail.result && <p className="text-sm mb-3" style={{ color: "var(--text)" }}><span className="text-muted">Risultato: </span>{detail.result}</p>}
            {(detail.before_photo_url || detail.after_photo_url) && (<div className="flex gap-2 mb-3">{detail.before_photo_url && <a href={detail.before_photo_url} target="_blank" rel="noreferrer"><img src={detail.before_photo_url} alt="prima" className="w-20 h-20 rounded-lg object-cover" /></a>}{detail.after_photo_url && <a href={detail.after_photo_url} target="_blank" rel="noreferrer"><img src={detail.after_photo_url} alt="dopo" className="w-20 h-20 rounded-lg object-cover" /></a>}</div>)}
            <div className="flex justify-end gap-2"><Button variant="danger" size="sm" onClick={() => deleteSess(detail.id)}><Trash2 size={13} /></Button><Button variant="secondary" size="sm" onClick={() => { openSessEdit(detail); setDetail(null); }}><Pencil size={13} /> Modifica</Button></div>
          </div>
        )}
      </Modal>

      <Modal open={saleOpen} onClose={() => setSaleOpen(false)} title="Registra vendita">
        <div className="flex gap-2 mb-3"><Select value={pick} onChange={(e) => setPick(e.target.value)}><option value="">Aggiungi prodotto o servizio…</option><optgroup label="Prodotti">{products.map((p) => <option key={p.id} value={`product:${p.id}`}>{p.name} — {euro(p.price_cents)}</option>)}</optgroup><optgroup label="Servizi">{services.map((s) => <option key={s.id} value={`service:${s.id}`}>{s.name} — {euro(s.price_cents)}</option>)}</optgroup></Select><Button variant="secondary" onClick={addLine}>Aggiungi</Button></div>
        {lines.length === 0 ? <p className="text-sm text-faint py-3 text-center">Nessuna voce.</p> : (<div className="space-y-2 mb-3">{lines.map((l) => (<div key={l.key} className="flex items-center gap-2"><span className="flex-1 text-sm truncate" style={{ color: "var(--text)" }}>{l.description}</span><input type="number" min={1} value={l.qty} onChange={(e) => setLines((arr) => arr.map((x) => (x.key === l.key ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x)))} className="w-14 h-8 px-2 rounded-lg text-sm text-center" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }} /><span className="w-16 text-right text-sm tabular-nums" style={{ color: "var(--text)" }}>{euro(l.unit_price_cents * l.qty)}</span><button onClick={() => setLines((arr) => arr.filter((x) => x.key !== l.key))} className="text-faint hover:text-[var(--danger)]"><X size={15} /></button></div>))}</div>)}
        <div className="flex items-center justify-between pt-3" style={{ borderTop: "1px solid var(--border)" }}><span className="text-sm text-muted">Totale</span><span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{euro(saleTotal)}</span></div>
        <div className="flex justify-end gap-2 mt-4"><Button variant="ghost" onClick={() => setSaleOpen(false)}>Annulla</Button><Button onClick={saveSale} disabled={lines.length === 0}>Registra</Button></div>
      </Modal>

      <Modal open={!!receipt} onClose={() => setReceipt(null)} title="Ricevuta" subtitle={receipt ? fmtDateTime(receipt.created_at) : ""}>
        {receipt && (<div><div className="rounded-lg p-4" style={{ background: "var(--surface-2)" }}><p className="text-center text-sm font-semibold" style={{ color: "var(--text)" }}>{SALON.name}</p><p className="text-center text-xs text-muted mb-3">{SALON.address}</p><div className="space-y-1">{(receipt.items ?? []).map((it: SaleItem) => (<div key={it.id} className="flex justify-between text-sm"><span style={{ color: "var(--text)" }}>{it.qty}× {it.description}</span><span className="tabular-nums" style={{ color: "var(--text)" }}>{euro(it.unit_price_cents * it.qty)}</span></div>))}</div><div className="flex justify-between mt-3 pt-3 text-sm font-semibold" style={{ borderTop: "1px solid var(--border)", color: "var(--text)" }}><span>Totale</span><span className="tabular-nums">{euro(receipt.total_cents)}</span></div><p className="text-center text-[10px] text-faint mt-3">Documento non fiscale</p></div><div className="flex justify-end gap-2 mt-4"><Button variant="secondary" size="sm" onClick={() => window.print()}><Printer size={14} /> Stampa</Button></div></div>)}
      </Modal>

      <Modal open={adjOpen} onClose={() => setAdjOpen(false)} title="Gestisci punti fedeltà">
        <div className="space-y-3">
          <Field label="Variazione punti (+ aggiungi / - riscatta)"><Input type="number" value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} placeholder="es. 50 oppure -100" /></Field>
          <Field label="Motivo"><Input value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} placeholder="es. premio, correzione" /></Field>
          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => setAdj({ ...adj, delta: String(Math.abs(Number(adj.delta) || 0)) })}><Plus size={13} /> Aggiungi</Button>
            <Button variant="secondary" className="flex-1" onClick={() => setAdj({ ...adj, delta: String(-Math.abs(Number(adj.delta) || 0)) })}><Minus size={13} /> Riscatta</Button>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setAdjOpen(false)}>Annulla</Button><Button onClick={adjustPoints}>Conferma</Button></div>
      </Modal>

      <datalist id="dl-brands">{options.brands.map((b) => <option key={b} value={b} />)}</datalist>
      <datalist id="dl-lines">{options.lines.map((b) => <option key={b} value={b} />)}</datalist>
      <datalist id="dl-tones">{options.tones.map((b) => <option key={b} value={b} />)}</datalist>
    </AppShell>
  );
}

function PhotoField({ label, url, onChange }: { label: string; url: string; onChange: (u: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  async function upload(file: File) { setBusy(true); const fd = new FormData(); fd.append("file", file); const res = await fetch("/api/upload", { method: "POST", body: fd }); setBusy(false); if (res.ok) onChange((await res.json()).url); }
  return (
    <div>
      <span className="block text-xs text-muted mb-1.5">{label}</span>
      <input ref={ref} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
      {url ? (<div className="relative w-full h-24 rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}><img src={url} alt={label} className="w-full h-full object-cover" /><button onClick={() => onChange("")} className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "rgba(0,0,0,0.6)", color: "#fff" }}><X size={13} /></button></div>) : (<button onClick={() => ref.current?.click()} disabled={busy} className="w-full h-24 rounded-lg flex flex-col items-center justify-center gap-1 text-muted hover-surface" style={{ border: "1px dashed var(--border)" }}><ImagePlus size={18} /><span className="text-[11px]">{busy ? "Caricamento…" : "Carica"}</span></button>)}
    </div>
  );
}
