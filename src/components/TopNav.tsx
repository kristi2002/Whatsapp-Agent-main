"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Panoramica" },
  { href: "/calendar", label: "Calendario" },
  { href: "/chat", label: "Conversazioni" },
  { href: "/services", label: "Servizi" },
  { href: "/stylists", label: "Staff" },
  { href: "/hours", label: "Orari" },
];

export default function TopNav() {
  const pathname = usePathname();

  return (
    <header className="flex items-center gap-1 px-4 h-14 border-b border-white/[0.06] shrink-0" style={{ background: "#141414" }}>
      <div className="flex items-center gap-2.5 pr-4 mr-1">
        <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center flex-shrink-0">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </div>
        <span className="text-sm font-semibold text-white whitespace-nowrap hidden sm:block">Max&amp;Tony Nazionale</span>
      </div>

      <nav className="flex items-center gap-0.5 flex-1 overflow-x-auto">
        {LINKS.map((l) => {
          const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                active ? "bg-emerald-500/15 text-emerald-400" : "text-white/50 hover:text-white/90 hover:bg-white/[0.04]"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <button
        onClick={async () => {
          await fetch("/api/auth/logout", { method: "POST" });
          window.location.href = "/login";
        }}
        title="Esci"
        className="text-white/40 hover:text-white/90 transition-colors flex-shrink-0 ml-2"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" y1="12" x2="9" y2="12" />
        </svg>
      </button>
    </header>
  );
}
