"use client";

import * as React from "react";
import { SlidersHorizontal, ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";

/** Collapsible filter panel. `activeCount` shows a badge; `onReset` clears. */
export function Filters({ activeCount = 0, onReset, children }: { activeCount?: number; onReset?: () => void; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className="mb-4">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-2 h-9 px-3 rounded-lg text-sm font-medium hover-surface transition-colors" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>
          <SlidersHorizontal size={15} /> Filtri
          {activeCount > 0 && <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold" style={{ background: "var(--accent)", color: "var(--accent-fg)" }}>{activeCount}</span>}
          <ChevronDown size={14} className="transition-transform" style={{ transform: open ? "rotate(180deg)" : "none" }} />
        </button>
        {activeCount > 0 && onReset && (
          <button onClick={onReset} className="inline-flex items-center gap-1 h-9 px-2.5 rounded-lg text-xs text-muted hover-surface"><X size={13} /> Azzera</button>
        )}
      </div>
      {/* Animate to auto height via the grid-rows 0fr↔1fr trick — no JS height
          measurement, so custom pickers/selects can't be clipped mid-render
          (which made the panel look like it rendered behind the table). */}
      <div className="grid transition-all duration-200 ease-out" style={{ gridTemplateRows: open ? "1fr" : "0fr", opacity: open ? 1 : 0 }}>
        <div className="overflow-hidden min-h-0">
          <div className="card mt-2 p-4" style={{ boxShadow: "var(--shadow)" }}>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Client-side pagination controls. */
export function Pagination({ page, pageCount, total, onPage }: { page: number; pageCount: number; total: number; onPage: (p: number) => void }) {
  if (pageCount <= 1) return <p className="text-xs text-faint mt-3">{total} risultat{total === 1 ? "o" : "i"}</p>;
  return (
    <div className="flex items-center justify-between gap-3 mt-4">
      <span className="text-xs text-faint">{total} risultati</span>
      <div className="flex items-center gap-1.5">
        <button onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1} className="w-8 h-8 rounded-lg flex items-center justify-center hover-surface disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronLeft size={16} /></button>
        <span className="text-xs text-muted tabular-nums px-1">{page} / {pageCount}</span>
        <button onClick={() => onPage(Math.min(pageCount, page + 1))} disabled={page >= pageCount} className="w-8 h-8 rounded-lg flex items-center justify-center hover-surface disabled:opacity-30" style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}

/** Paginate an array client-side; resets to page 1 when the list identity/length changes. */
export function usePagination<T>(items: T[], perPage = 12) {
  const [page, setPage] = React.useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / perPage));
  React.useEffect(() => { if (page > pageCount) setPage(1); }, [pageCount, page]);
  const start = (page - 1) * perPage;
  return { page, setPage, pageItems: items.slice(start, start + perPage), pageCount, total: items.length };
}

/** A labelled filter field for use inside <Filters>. */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] uppercase tracking-wide text-faint mb-1">{label}</span>
      {children}
    </label>
  );
}
