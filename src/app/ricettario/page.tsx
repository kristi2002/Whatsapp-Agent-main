"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Droplet, Search } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Badge, Input, Select } from "@/components/ui";
import { Filters, FilterField } from "@/components/data-ui";
import type { ColorSession, ColorSessionItem } from "@/lib/gestionale-types";

type Row = ColorSession & { items?: ColorSessionItem[]; client?: { id: string; name: string | null; phone: string } | null; stylist?: { name: string } | null };
const fmtDate = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
const SERVICE_TYPES = ["Ritocco radici", "Colore completo", "Balayage", "Decolorazione", "Toner", "Colpi di sole"];
const TECHNIQUES = ["Radici", "Lunghezze", "Foil", "Mano libera"];

function formula(items: ColorSessionItem[] | undefined) {
  const its = items ?? [];
  const colors = its.filter((i) => i.role !== "ossigeno").map((i) => `${i.brand ? i.brand + " " : ""}${i.tone ?? ""}${i.quantity ? ` ${i.quantity}g` : ""}`.trim()).filter(Boolean);
  const ox = its.filter((i) => i.role === "ossigeno").map((i) => `Oss. ${i.volumes ?? "?"}vol`);
  return [colors.join(" + "), ox.join(" ")].filter(Boolean).join(" · ");
}

export default function RicettarioPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [tone, setTone] = useState(""); const [brand, setBrand] = useState(""); const [base, setBase] = useState(""); const [technique, setTechnique] = useState(""); const [serviceType, setServiceType] = useState(""); const [withPhotos, setWithPhotos] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const p = new URLSearchParams();
    if (q) p.set("q", q); if (tone) p.set("tone", tone); if (brand) p.set("brand", brand); if (base) p.set("base", base); if (technique) p.set("technique", technique); if (serviceType) p.set("service_type", serviceType); if (withPhotos) p.set("withPhotos", "1");
    const data = await fetch(`/api/color-sessions?${p.toString()}`).then((r) => r.json());
    setRows(Array.isArray(data) ? data : []); setLoading(false);
  }, [q, tone, brand, base, technique, serviceType, withPhotos]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);
  const activeFilters = [tone, brand, base, technique, serviceType].filter(Boolean).length + (withPhotos ? 1 : 0);

  return (
    <AppShell title="Ricettario del salone" subtitle="Cerca tra tutte le formule colore realizzate.">
      <div className="flex items-center gap-2 h-10 px-3 rounded-xl mb-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <Search size={16} className="text-faint shrink-0" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca per cliente, risultato, note…" className="flex-1 bg-transparent text-sm outline-none" style={{ color: "var(--text)" }} />
      </div>
      <Filters activeCount={activeFilters} onReset={() => { setTone(""); setBrand(""); setBase(""); setTechnique(""); setServiceType(""); setWithPhotos(false); }}>
        <FilterField label="Tono target"><Input value={tone} onChange={(e) => setTone(e.target.value)} placeholder="es. 8.1" /></FilterField>
        <FilterField label="Marca"><Input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="es. Wella" /></FilterField>
        <FilterField label="Base naturale"><Input type="number" value={base} onChange={(e) => setBase(e.target.value)} placeholder="1-10" /></FilterField>
        <FilterField label="Tecnica"><Select value={technique} onChange={(e) => setTechnique(e.target.value)}><option value="">Tutte</option>{TECHNIQUES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></FilterField>
        <FilterField label="Servizio"><Select value={serviceType} onChange={(e) => setServiceType(e.target.value)}><option value="">Tutti</option>{SERVICE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select></FilterField>
        <label className="flex items-center gap-2 text-sm text-muted self-end"><input type="checkbox" checked={withPhotos} onChange={(e) => setWithPhotos(e.target.checked)} style={{ accentColor: "var(--accent)" }} /> Solo con foto</label>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : rows.length === 0 ? <p className="text-sm text-faint py-8 text-center">Nessuna formula trovata.</p> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {rows.map((s) => (
            <Card key={s.id} className="overflow-hidden">
              {s.after_photo_url ? <img src={s.after_photo_url} alt="" className="w-full h-40 object-cover" /> : <div className="w-full h-40 flex items-center justify-center" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Droplet size={28} /></div>}
              <div className="p-4">
                <p className="text-sm font-semibold" style={{ color: "var(--text)" }}>{formula(s.items) || "Formula"}</p>
                <div className="flex flex-wrap gap-1.5 my-2">
                  {s.base_level != null && <Badge tone="neutral">base {s.base_level}</Badge>}
                  {s.service_type && <Badge tone="accent">{s.service_type}</Badge>}
                  {s.technique && <Badge tone="neutral">{s.technique}</Badge>}
                </div>
                {s.result && <p className="text-xs text-muted line-clamp-2">{s.result}</p>}
                <p className="text-[11px] text-faint mt-2">{fmtDate(s.date)}{s.stylist?.name ? ` · ${s.stylist.name}` : ""}{s.client ? <> · <Link href={`/clienti/${s.client.id}`} className="text-accent hover:underline">{s.client.name || s.client.phone}</Link></> : ""}</p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
