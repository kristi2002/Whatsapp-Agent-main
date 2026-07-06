"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, MessageSquare, Sparkles, Users, Clock, LogOut } from "lucide-react";
import { cn } from "@/lib/cn";

const NAV = [
  { href: "/", label: "Panoramica", icon: LayoutDashboard },
  { href: "/calendar", label: "Calendario", icon: CalendarDays },
  { href: "/chat", label: "Conversazioni", icon: MessageSquare },
  { href: "/services", label: "Servizi", icon: Sparkles },
  { href: "/stylists", label: "Staff", icon: Users },
  { href: "/hours", label: "Orari", icon: Clock },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex flex-col shrink-0 w-16 lg:w-60 bd-r" style={{ background: "var(--surface)" }}>
      <div className="flex items-center gap-2.5 h-14 px-3 lg:px-5 bd-b">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--accent)" }}>
          <span className="text-sm font-bold" style={{ color: "var(--accent-fg)" }}>M</span>
        </div>
        <div className="hidden lg:block leading-tight min-w-0">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>Max&amp;Tony</p>
          <p className="text-[10px] text-faint truncate">Nazionale</p>
        </div>
      </div>

      <nav className="flex-1 p-2 lg:p-3 space-y-1">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          const Icon = n.icon;
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              className={cn("flex items-center gap-3 h-10 px-2.5 lg:px-3 rounded-xl text-sm font-medium transition-colors justify-center lg:justify-start", active ? "" : "text-muted hover-surface")}
              style={active ? { background: "var(--accent-soft)", color: "var(--accent-soft-fg)" } : undefined}
            >
              <Icon size={18} className="shrink-0" />
              <span className="hidden lg:block">{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-2 lg:p-3 bd-b" style={{ borderBottom: "none", borderTop: "1px solid var(--border)" }}>
        <button
          onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }}
          className="flex items-center gap-3 h-10 w-full px-2.5 lg:px-3 rounded-xl text-sm font-medium text-muted hover-surface transition-colors justify-center lg:justify-start"
          title="Esci"
        >
          <LogOut size={18} className="shrink-0" />
          <span className="hidden lg:block">Esci</span>
        </button>
      </div>
    </aside>
  );
}
