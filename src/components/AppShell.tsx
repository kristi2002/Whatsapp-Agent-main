"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu } from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { ThemeToggle } from "@/components/theme";

export default function AppShell({ title, subtitle, actions, bare, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  bare?: boolean;
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "var(--bg)" }}>
      <div className="hidden lg:flex shrink-0"><Sidebar /></div>

      <AnimatePresence>
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileOpen(false)} className="absolute inset-0" style={{ background: "rgba(10,6,12,0.5)" }} />
            <motion.div initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: "tween", duration: 0.2 }} className="relative z-10 h-full shadow-xl"><Sidebar onNavigate={() => setMobileOpen(false)} /></motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex items-center gap-3 h-14 px-4 sm:px-5 bd-b shrink-0" style={{ background: "var(--surface)" }}>
          <button onClick={() => setMobileOpen(true)} className="lg:hidden w-9 h-9 -ml-1 rounded-lg flex items-center justify-center text-muted hover-surface shrink-0" aria-label="Menu"><Menu size={19} /></button>
          <div className="min-w-0">
            <h1 className="text-[15px] font-semibold leading-tight truncate" style={{ color: "var(--text)" }}>{title}</h1>
            {subtitle && <p className="text-xs text-muted leading-tight truncate">{subtitle}</p>}
          </div>
          <div className="ml-auto flex items-center gap-2 sm:gap-2.5">{actions}<ThemeToggle /></div>
        </header>
        <main className={bare ? "flex-1 min-h-0 overflow-hidden" : "flex-1 min-h-0 overflow-y-auto thin-scroll"}>
          {bare ? children : <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-7">{children}</div>}
        </main>
      </div>
    </div>
  );
}
