"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarDays, CalendarClock, Sparkles, Users, ArrowRight } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Badge } from "@/components/ui";
import type { OverviewStats, AppointmentWithRelations } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };

const KPIS = [
  { key: "todayCount", label: "Appuntamenti oggi", icon: CalendarDays, href: "/calendar" },
  { key: "upcomingCount", label: "Prossimi 7 giorni", icon: CalendarClock, href: "/calendar" },
  { key: "activeServices", label: "Servizi attivi", icon: Sparkles, href: "/services" },
  { key: "activeStylists", label: "Staff attivo", icon: Users, href: "/stylists" },
] as const;

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats & { week?: { label: string; count: number }[] } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch("/api/overview");
    setStats(await res.json());
    setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);

  const today: AppointmentWithRelations[] = stats?.today ?? [];
  const week = stats?.week ?? [];
  const maxWeek = Math.max(1, ...week.map((w) => w.count));
  const subtitle = new Date().toLocaleDateString("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });

  return (
    <AppShell title="Panoramica" subtitle={subtitle.charAt(0).toUpperCase() + subtitle.slice(1)}>
      {loading ? (
        <p className="text-sm text-muted">Caricamento…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {KPIS.map((k, i) => {
              const Icon = k.icon;
              const value = (stats as unknown as Record<string, number>)?.[k.key] ?? 0;
              return (
                <motion.div key={k.key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
                  <Link href={k.href}>
                    <Card className="p-5 h-full transition-transform hover:-translate-y-0.5">
                      <div className="flex items-center justify-between mb-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Icon size={18} /></div>
                      </div>
                      <p className="text-3xl font-semibold" style={{ color: "var(--text)" }}>{value}</p>
                      <p className="text-xs text-muted mt-1">{k.label}</p>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Appuntamenti di oggi</h2>
                <Link href="/calendar" className="text-xs flex items-center gap-1 text-accent hover:opacity-80">Calendario <ArrowRight size={13} /></Link>
              </div>
              {today.length === 0 ? (
                <p className="text-sm text-faint py-8 text-center">Nessun appuntamento per oggi.</p>
              ) : (
                <div className="space-y-1">
                  {today.map((a) => (
                    <div key={a.id} className="flex items-center gap-4 py-2.5 border-t first:border-t-0" style={{ borderColor: "var(--border)" }}>
                      <span className="text-sm font-semibold text-accent w-12 tabular-nums">{fmtTime(a.starts_at)}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name ?? "Servizio"}</p>
                        <p className="text-xs text-muted truncate">{a.customer_name || a.customer_phone} · {a.stylist?.name ?? ""}</p>
                      </div>
                      <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="p-5">
              <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Prossimi 7 giorni</h2>
              <div className="flex items-end justify-between gap-2 h-32">
                {week.map((w, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-2">
                    <div className="w-full flex items-end justify-center" style={{ height: "100%" }}>
                      <motion.div initial={{ height: 0 }} animate={{ height: `${(w.count / maxWeek) * 100}%` }} transition={{ delay: i * 0.04 }} className="w-full rounded-t-md min-h-[3px]" style={{ background: i === 0 ? "var(--accent)" : "var(--accent-soft)" }} title={`${w.count}`} />
                    </div>
                    <span className="text-[10px] text-faint">{w.label}</span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </>
      )}
    </AppShell>
  );
}
