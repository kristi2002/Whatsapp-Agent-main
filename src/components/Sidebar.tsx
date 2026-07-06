"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, Hourglass, MessageSquare, Users, FlaskConical, Sparkles, Scissors, Package, BarChart3, Clock, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Panoramica", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/attesa", label: "Lista d\u2019attesa", icon: Hourglass },
  { href: "/chat", label: "Conversazioni", icon: MessageSquare },
  { href: "/clienti", label: "Clienti", icon: Users },
  { href: "/ricettario", label: "Ricettario", icon: FlaskConical },
  { href: "/services", label: "Servizi", icon: Sparkles },
  { href: "/stylists", label: "Staff", icon: Scissors },
  { href: "/magazzino", label: "Magazzino", icon: Package },
  { href: "/statistiche", label: "Statistiche", icon: BarChart3 },
  { href: "/hours", label: "Orari", icon: Clock },
];

export default function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <div className="w-60 h-full flex flex-col bd-r" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-2.5 h-14 px-5 bd-b shrink-0">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
          <span className="text-sm font-bold" style={{ color: "var(--accent-fg)" }}>M</span>
        </div>
        <div className="leading-tight min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>Max&amp;Tony</p>
          <p className="text-[10px] text-faint truncate">Nazionale</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto thin-scroll">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link key={n.href} href={n.href} onClick={onNavigate} className={cn("flex items-center gap-3 h-10 px-3 rounded-xl text-sm font-medium transition-colors", active ? "" : "text-muted hover-surface")} style={active ? { background: "var(--accent-soft)", color: "var(--accent-soft-fg)" } : undefined}>
              <Icon size={18} className="shrink-0" /><span>{n.label}</span>
            </Link>
          );
        })}
      </nav>
      <div className="p-3 shrink-0" style={{ borderTop: "1px solid var(--border)" }}>
        <button onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }} className="flex items-center gap-3 h-10 w-full px-3 rounded-xl text-sm font-medium text-muted hover-surface transition-colors">
          <LogOut size={18} className="shrink-0" /><span>Esci</span>
        </button>
      </div>
    </div>
  );
}
