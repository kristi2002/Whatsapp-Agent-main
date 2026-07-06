"use client";

import { useEffect, useState, useCallback } from "react";
import Shell from "@/components/Shell";
import type { ServiceRow } from "@/lib/gestionale-types";

interface StylistRow {
  id: string;
  name: string;
  active: boolean;
  service_ids: string[];
}

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
    setStylists(st);
    setServices((sv as ServiceRow[]).filter((s) => s.active));
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function openNew() {
    setName("");
    setServiceIds([]);
    setEditing("new");
    setError("");
  }
  function openEdit(s: StylistRow) {
    setName(s.name);
    setServiceIds(s.service_ids);
    setEditing(s.id);
    setError("");
  }
  function toggleService(id: string) {
    setServiceIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setError("");
    const payload = { name, service_ids: serviceIds };
    const url = editing === "new" ? "/api/stylists" : `/api/stylists/${editing}`;
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

  async function toggleActive(s: StylistRow) {
    await fetch(`/api/stylists/${s.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !s.active }) });
    load();
  }

  return (
    <Shell
      title="Staff"
      subtitle="I parrucchieri attivi e i servizi che eseguono determinano cosa può prenotare l'assistente."
      actions={<button onClick={openNew} className="px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium">+ Aggiungi</button>}
    >
      {loading ? (
        <p className="text-sm text-white/40">Caricamento…</p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {stylists.map((s) => (
            <div key={s.id} className={`rounded-xl border border-white/[0.06] p-4 ${s.active ? "" : "opacity-40"}`} style={{ background: "#141414" }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white/90">{s.name}</span>
                <div className="flex items-center gap-3">
                  <button onClick={() => toggleActive(s)} className="text-xs text-white/40 hover:text-white/80">{s.active ? "Disattiva" : "Attiva"}</button>
                  <button onClick={() => openEdit(s)} className="text-xs text-emerald-400 hover:text-emerald-300">Modifica</button>
                </div>
              </div>
              <p className="text-xs text-white/40 mt-2">
                {s.service_ids.length === 0 ? "Tutti i servizi" : `${s.service_ids.length} servizi`}
              </p>
            </div>
          ))}
          {stylists.length === 0 && <p className="text-sm text-white/30">Nessun membro dello staff.</p>}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl border border-white/[0.08] p-6" style={{ background: "#1a1a1a" }} onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-white mb-4">{editing === "new" ? "Nuovo membro" : "Modifica membro"}</h3>
            <label className="block mb-4">
              <span className="block text-xs text-white/50 mb-1.5">Nome</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="inp" />
            </label>
            <p className="text-xs text-white/50 mb-2">Servizi eseguiti (nessuno = tutti)</p>
            <div className="max-h-56 overflow-y-auto space-y-1 pr-1">
              {services.map((sv) => (
                <label key={sv.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer">
                  <input type="checkbox" checked={serviceIds.includes(sv.id)} onChange={() => toggleService(sv.id)} className="accent-emerald-500" />
                  <span className="text-sm text-white/80">{sv.name}</span>
                </label>
              ))}
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
