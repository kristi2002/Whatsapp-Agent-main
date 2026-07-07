"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { Award, Star } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Badge, Input, Select } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import { loyaltyTier } from "@/lib/loyalty";
import type { ClientRow } from "@/lib/gestionale-types";

export default function FidelityPage() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(""); const [tier, setTier] = useState("");

  const load = useCallback(async () => { setClients(await fetch("/api/clients").then((r) => r.json())); setLoading(false); }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const ranked = useMemo(() => [...clients].sort((a, b) => b.loyalty_points - a.loyalty_points), [clients]);
  const filtered = useMemo(() => ranked.filter((c) => {
    if (tier && loyaltyTier(c.loyalty_points).name !== tier) return false;
    if (q && !`${c.name ?? ""} ${c.phone}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  }), [ranked, q, tier]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 15);
  const totalPoints = clients.reduce((t, c) => t + c.loyalty_points, 0);
  const withPoints = clients.filter((c) => c.loyalty_points > 0).length;

  return (
    <AppShell title="Fedeltà" subtitle="Programma punti: 1 punto per ogni euro speso.">
      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-4">
            <Card className="p-5"><div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Award size={18} /></div><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{totalPoints.toLocaleString("it-IT")}</p><p className="text-xs text-muted mt-1">Punti totali emessi</p></Card>
            <Card className="p-5"><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{withPoints}</p><p className="text-xs text-muted mt-1">Clienti con punti</p></Card>
            <Card className="p-5"><p className="text-2xl font-semibold" style={{ color: "var(--text)" }}>{clients.filter((c) => c.loyalty_points >= 300).length}</p><p className="text-xs text-muted mt-1">Oro e Platino</p></Card>
          </div>

          <Filters activeCount={(q ? 1 : 0) + (tier ? 1 : 0)} onReset={() => { setQ(""); setTier(""); }}>
            <FilterField label="Cerca"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nome o telefono" /></FilterField>
            <FilterField label="Livello"><Select value={tier} onChange={(e) => setTier(e.target.value)}><option value="">Tutti</option>{["Bronzo", "Argento", "Oro", "Platino"].map((t) => <option key={t} value={t}>{t}</option>)}</Select></FilterField>
          </Filters>

          <Card className="overflow-hidden">
            {pageItems.map((c, i) => {
              const t = loyaltyTier(c.loyalty_points);
              return (
                <Link key={c.id} href={`/clienti/${c.id}`} className="flex items-center gap-4 px-5 py-3 bd-b last:border-b-0 hover-surface transition-colors">
                  <span className="text-sm text-faint w-6 tabular-nums">{(page - 1) * 15 + i + 1}</span>
                  <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate flex items-center gap-1.5" style={{ color: "var(--text)" }}>{c.priority && <Star size={12} style={{ color: "var(--warning)", fill: "var(--warning)" }} />}{c.name || c.phone}</p><p className="text-xs text-muted truncate">{c.phone}</p></div>
                  <Badge tone={t.tone}>{t.name}</Badge>
                  <span className="text-sm font-semibold tabular-nums w-16 text-right" style={{ color: "var(--text)" }}>{c.loyalty_points} pt</span>
                </Link>
              );
            })}
            {filtered.length === 0 && <p className="text-sm text-faint py-8 text-center">Nessun cliente.</p>}
          </Card>
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}
    </AppShell>
  );
}
