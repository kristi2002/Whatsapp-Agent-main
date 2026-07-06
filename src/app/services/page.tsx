"use client";

import { useEffect, useState, useCallback } from "react";
import Shell from "@/components/Shell";
import type { ServiceRow } from "@/lib/gestionale-types";

const empty = { name: "", category: "", duration_min: "45", price_euro: "", active: true };
type Form = typeof empty;

function euro(cents: number | null) {
  return cents == null ? "—" : "€" + (cents / 100).toFixed(2).replace(".", ",");
}

export default function ServicesPage() {
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<Form>(empty);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/services");
    setServices(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function openNew() {
    setForm(empty);
    setEditing("new");
    setError("");
  }
  function openEdit(s: ServiceRow) {
    setForm({
      name: s.name,
      category: s.category ?? "",
      duration_min: String(s.duration_min),
      price_euro: s.price_cents == null ? "" : (s.price_cents / 100).toFixed(2),
      active: s.active,
    });
    setEditing(s.id);
    setError("");
  }

  async function save() {
    setSaving(true);
    setError("");
    const payload = {
      name: form.name,
      category: form.category,
      duration_min: Number(form.duration_min),
      price_cents: form.price_euro === "" ? null : Math.round(Number(form.price_euro.replace(",", ".")) * 100),
      active: form.active,
    };
    const url = editing === "new" ? "/api/services" : `/api/services/${editing}`;
    const method = editing === "new" ? "POST" : "PATCH";
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json()).error || "Errore nel salvataggio.");
      return;
    }
    setEditing(null);
    load();
  }

  async function toggleActive(s: ServiceRow) {
    await fetch(`/api/services/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) });
    load();
  }

  return (
    <Shell
      title="Servizi"
      subtitle="I servizi attivi vengono proposti automaticamente dall'assistente WhatsApp."
      actions={<button onClick={openNew} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">+ Aggiungi servizio</button>}
    >
      {loading ? (
        <p className="text-sm text-white/40">Caricamento…</p>
      ) : (
        <div className="rounded-xl border border-white/[0.06] overflow-hidden" style={{ background: "#141414" }}>
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-5 py-2.5 border-b border-white/[0.06] text-[11px] uppercase tracking-wide text-white/30">
            <span>Nome</span><span>Categoria</span><span className="text-right">Durata</span><span className="text-right">Prezzo</span><span></span>
          </div>
          {services.map((s) => (
            <div key={s.id} className={`grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 items-center px-5 py-3 border-b border-white/[0.05] last:border-0 ${s.active ? "" : "opacity-40"}`}>
              <span className="text-sm text-white/90">{s.name}</span>
              <span className="text-xs text-white/40">{s.category || "—"}</span>
              <span className="text-sm text-white/60 text-right tabular-nums">{s.duration_min}&#8242;</span>
              <span className="text-sm text-white/60 text-right tabular-nums">{euro(s.price_cents)}</span>
              <div className="flex items-center gap-3 justify-end">
                <button onClick={() => toggleActive(s)} className="text-xs text-white/40 hover:text-white/80">{s.active ? "Disattiva" : "Attiva"}</button>
                <button onClick={() => openEdit(s)} className="text-xs text-emerald-400 hover:text-emerald-300">Modifica</button>
              </div>
            </div>
          ))}
          {services.length === 0 && <p className="text-sm text-white/30 px-5 py-8 text-center">Nessun servizio.</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] p-6" style={{ background: "#1a1a1a" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">{editing === "new" ? "Nuovo servizio" : "Modifica servizio"}</h3>
            <div className="space-y-3">
              <Field label="Nome"><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="inp" /></Field>
              <Field label="Categoria (es. taglio, colore, trucco)"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="inp" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Durata (min)"><input type="number" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} className="inp" /></Field>
                <Field label="Prezzo (euro)"><input value={form.price_euro} onChange={(e) => setForm({ ...form, price_euro: e.target.value })} placeholder="opzionale" className="inp" /></Field>
              </div>
            </div>
            {error && <p className="text-xs text-red-400 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} className="px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white">Annulla</button>
              <button onClick={save} disabled={saving} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white text-sm font-medium">{saving ? "Salvataggio…" : "Salva"}</button>
            </div>
          </div>
        </div>
      )}
      <style>{`.inp{width:100%;background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:8px 12px;font-size:14px;color:#fff;outline:none}.inp:focus{border-color:rgba(16,185,129,0.5)}`}</style>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-white/50 mb-1.5">{label}</span>
      {children}
    </label>
  );
}
