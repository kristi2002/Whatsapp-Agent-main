"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Plus, StickyNote, Star } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Button, Modal, Field, Input } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import type { ClientRow } from "@/lib/gestionale-types";
import { loyaltyTier } from "@/lib/loyalty";
import { Badge } from "@/components/ui";

const initials = (name: string | null, phone: string) => (name ? name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : phone.slice(-2));

export default function ClientiPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [onlyNotes, setOnlyNotes] = useState(false);
  const [onlyPriority, setOnlyPriority] = useState(false);

  const load = useCallback(async () => { setClients(await fetch("/api/clients").then((r) => r.json())); setLoading(false); }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const filtered = useMemo(() => clients.filter((c) => {
    if (onlyNotes && !c.notes) return false;
    if (onlyPriority && !c.priority) return false;
    if (q && !(`${c.name ?? ""} ${c.phone} ${c.email ?? ""}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  }), [clients, q, onlyNotes, onlyPriority]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 12);
  const activeFilters = (q ? 1 : 0) + (onlyNotes ? 1 : 0) + (onlyPriority ? 1 : 0);

  async function create() {
    setSaving(true); setError("");
    const res = await fetch("/api/clients", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) { setError((await res.json()).error || "Errore."); return; }
    setAdding(false); setForm({ name: "", phone: "", email: "", notes: "" }); load();
  }

  return (
    <AppShell title="Clienti" subtitle={`${clients.length} clienti`} actions={<Button size="sm" onClick={() => { setForm({ name: "", phone: "", email: "", notes: "" }); setError(""); setAdding(true); }}><Plus size={15} /> <span className="hidden sm:inline">Aggiungi</span></Button>}>
      <Filters activeCount={activeFilters} onReset={() => { setQ(""); setOnlyNotes(false); setOnlyPriority(false); }}>
        <FilterField label="Cerca"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome, telefono, email" /></FilterField>
        <label className="flex items-center gap-2 text-sm text-muted self-end"><input type="checkbox" checked={onlyNotes} onChange={(e) => setOnlyNotes(e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Solo con note</label>
        <label className="flex items-center gap-2 text-sm text-muted self-end"><input type="checkbox" checked={onlyPriority} onChange={(e) => setOnlyPriority(e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Solo prioritari</label>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {pageItems.map((c) => (
              <Link key={c.id} href={`/clienti/${c.id}`}>
                <Card className="p-4 h-full transition-transform hover:-translate-y-0.5">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{initials(c.name, c.phone)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--text)" }}>{c.priority && <Star size={13} className="shrink-0" style={{ color: "var(--warning)", fill: "var(--warning)" }} />}{c.name || c.phone}</p>
                      <p className="text-xs text-muted truncate">{c.phone}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge tone={loyaltyTier(c.loyalty_points).tone}>{c.loyalty_points} pt</Badge>
                      {c.notes && <StickyNote size={13} className="text-faint" />}
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
          {filtered.length === 0 && <p className="text-sm text-faint py-8 text-center">Nessun cliente.</p>}
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}

      <Modal open={adding} onClose={() => setAdding(false)} title="Nuovo cliente">
        <div className="space-y-3">
          <Field label="Nome"><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Telefono"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="es. 393801234567" /></Field>
          <Field label="Email (opzionale)"><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Note (opzionale)"><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        {error && <p className="text-xs mt-3" style={{ color: "var(--danger)" }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-5"><Button variant="ghost" onClick={() => setAdding(false)}>Annulla</Button><Button onClick={create} disabled={saving}>{saving ? "Salvataggio…" : "Salva"}</Button></div>
      </Modal>
    </AppShell>
  );
}
