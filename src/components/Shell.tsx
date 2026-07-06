"use client";

import TopNav from "@/components/TopNav";

/** Page frame for gestionale pages: top nav + a scrollable, padded content area. */
export default function Shell({ title, subtitle, actions, children }: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-screen" style={{ background: "#0f0f0f" }}>
      <TopNav />
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div>
              <h1 className="text-xl font-semibold text-white">{title}</h1>
              {subtitle && <p className="text-sm text-white/40 mt-1">{subtitle}</p>}
            </div>
            {actions}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
