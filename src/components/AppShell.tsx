"use client";

import Sidebar from "@/components/Sidebar";
import { ThemeToggle } from "@/components/theme";

export default function AppShell({ title, subtitle, actions, bare, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  bare?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-4 h-14 px-5 bd-b shrink-0" style={{ background: "var(--surface)" }}>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--text)" }}>{title}</h1>
            {subtitle && <p className="text-xs text-muted leading-tight truncate">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {actions}
            <ThemeToggle />
          </div>
        </header>
        <main className={bare ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto thin-scroll"}>
          {bare ? children : <div className="max-w-6xl mx-auto px-6 py-7">{children}</div>}
        </main>
      </div>
    </div>
  );
}
