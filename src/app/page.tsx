"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { CalendarDays, CalendarClock, Sparkles, Users, ArrowRight, Bot, User, MessageSquare } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Badge } from "@/components/ui";
import type { OverviewStats, AppointmentWithRelations } from "@/lib/gestionale-types";
import type { ConversationWithLastMessage } from "@/lib/types";

const TZ = "Europe/Rome";
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const initials = (name: string | null, fallback = "") => (name ? name.trim().split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() : fallback.slice(-2));

const STATUS: Record<string, "success" | "info" | "warning" | "neutral"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "neutral" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };
const STATUS_DOT: Record<string, string> = { booked: "var(--accent)", completed: "var(--info)", no_show: "var(--warning)", cancelled: "var(--text-faint)" };

const KPIS = [
  { key: "todayCount", label: "Appuntamenti oggi", icon: CalendarDays, href: "/calendar" },
  { key: "upcomingCount", label: "Prossimi 7 giorni", icon: CalendarClock, href: "/calendar" },
  { key: "activeServices", label: "Servizi attivi", icon: Sparkles, href: "/services" },
  { key: "activeStylists", label: "Staff attivo", icon: Users, href: "/stylists" },
] as const;

export default function OverviewPage() {
  const [stats, setStats] = useState<OverviewStats & { week?: { label: string; count: number }[] } | null>(null);
  const [convos, setConvos] = useState<ConversationWithLastMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (silent = false) => {
    try {
      const [s, c] = await Promise.all([
        fetch("/api/overview").then((r) => r.json()),
        fetch("/api/conversations").then((r) => r.json()).catch(() => []),
      ]);
      setStats(s);
      setConvos(Array.isArray(c) ? c.slice(0, 5) : []);
    } catch { /* keep last-known stats on a transient fetch error */ }
    if (!silent) setLoading(false);
  }, []);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  // Silently refresh so today's appointments, KPI counts and chats reflect changes
  // made elsewhere (e.g. the WhatsApp agent) without a manual reload.
  useEffect(() => {
    const t = setInterval(() => load(true), 20_000);
    const onFocus = () => load(true);
    window.addEventListener("focus", onFocus);
    return () => { clearInterval(t); window.removeEventListener("focus", onFocus); };
  }, [load]);

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
                      <p className="text-3xl font-semibold tabular-nums" style={{ color: "var(--text)" }}>{value}</p>
                      <p className="text-xs text-muted mt-1">{k.label}</p>
                    </Card>
                  </Link>
                </motion.div>
              );
            })}
          </div>

          <div className="grid lg:grid-cols-3 gap-4">
            {/* Today's appointments as a timeline agenda */}
            <Card className="lg:col-span-2 p-5">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>Appuntamenti di oggi</h2>
                <Link href="/calendar" className="text-xs flex items-center gap-1 text-accent hover:opacity-80">Calendario <ArrowRight size={13} /></Link>
              </div>
              {today.length === 0 ? (
                <p className="text-sm text-faint py-8 text-center">Nessun appuntamento per oggi.</p>
              ) : (
                <div>
                  {today.map((a, i) => (
                    <div key={a.id} className="flex gap-3.5">
                      <span className="text-sm font-semibold text-accent w-11 tabular-nums pt-2.5 shrink-0">{fmtTime(a.starts_at)}</span>
                      <div className="relative flex justify-center w-3 shrink-0">
                        <span className="absolute w-px bg-[var(--border)]" style={{ top: i === 0 ? 14 : 0, bottom: i === today.length - 1 ? "auto" : 0, height: i === today.length - 1 ? 14 : "auto" }} />
                        <span className="w-2.5 h-2.5 rounded-full mt-2.5 z-10" style={{ background: "var(--surface)", border: `2px solid ${STATUS_DOT[a.status] ?? "var(--accent)"}` }} />
                      </div>
                      <div className="flex items-center gap-3 flex-1 min-w-0 py-2">
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}>{initials(a.stylist?.name ?? null, "–")}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm truncate" style={{ color: "var(--text)" }}>{a.service?.name ?? "Servizio"}</p>
                          <p className="text-xs text-muted truncate">{a.customer_name || a.customer_phone}{a.stylist?.name ? ` · ${a.stylist.name}` : ""}</p>
                        </div>
                        <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status] ?? a.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <div className="flex flex-col gap-4">
              {/* WhatsApp activity — the AI agent, surfaced */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold flex items-center gap-1.5" style={{ color: "var(--text)" }}><MessageSquare size={14} className="text-accent" /> Attività WhatsApp</h2>
                  <Link href="/chat" className="text-xs flex items-center gap-1 text-accent hover:opacity-80">Tutte <ArrowRight size={13} /></Link>
                </div>
                {convos.length === 0 ? (
                  <p className="text-sm text-faint py-4 text-center">Nessuna conversazione.</p>
                ) : (
                  <div className="space-y-0.5">
                    {convos.map((c) => (
                      <Link key={c.id} href="/chat" className="flex items-center gap-2.5 py-2 border-t first:border-t-0 hover-surface -mx-2 px-2 rounded-lg transition-colors" style={{ borderColor: "var(--border)" }}>
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>{initials(c.name, c.phone)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-[13px] font-medium truncate" style={{ color: "var(--text)" }}>{c.name || c.phone}</span>
                            <span className="text-[10px] text-faint shrink-0">{fmtTime(c.updated_at)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-0.5">
                            <span className="text-xs text-muted truncate">{c.last_message || ""}</span>
                            <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={c.mode === "agent" ? { background: "var(--success-soft)", color: "var(--success)" } : { background: "var(--warning-soft)", color: "var(--warning)" }}>
                              {c.mode === "agent" ? <Bot size={10} /> : <User size={10} />}{c.mode === "agent" ? "AI" : "Tu"}
                            </span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </Card>

              {/* Next 7 days */}
              <Card className="p-5">
                <h2 className="text-sm font-semibold mb-4" style={{ color: "var(--text)" }}>Prossimi 7 giorni</h2>
                <div className="flex items-end justify-between gap-2 h-28">
                  {week.map((w, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2">
                      <span className="text-[10px] font-semibold tabular-nums" style={{ color: "var(--text)" }}>{w.count}</span>
                      <div className="w-full flex items-end justify-center flex-1">
                        <motion.div initial={{ height: 0 }} animate={{ height: `${(w.count / maxWeek) * 100}%` }} transition={{ delay: i * 0.04 }} className="w-full rounded-t-md min-h-[3px]" style={{ background: i === 0 ? "var(--accent)" : "var(--accent-soft)" }} title={`${w.count}`} />
                      </div>
                      <span className="text-[10px] text-faint">{w.label}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </>
      )}
    </AppShell>
  );
}
