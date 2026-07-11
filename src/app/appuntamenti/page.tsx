"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { CalendarClock, Hourglass, Check, X, Scissors, MessageCircle, Phone, Globe, Store, Clock, FileSpreadsheet, FileText, type LucideIcon } from "lucide-react";
import AppShell from "@/components/AppShell";
import { Card, Badge, Select, Button } from "@/components/ui";
import { Filters, FilterField, Pagination, usePagination } from "@/components/data-ui";
import { StatCard, Avatar } from "@/components/kit";
import { DateField } from "@/components/pickers";
import type { AppointmentWithRelations } from "@/lib/gestionale-types";

const TZ = "Europe/Rome";
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const plusDays = (n: number) => { const d = new Date(); d.setDate(d.getDate() + n); return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); };
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short" });
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtDayLong = (iso: string) => new Date(iso).toLocaleDateString("it-IT", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const fmtPrice = (cents: number) => (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: cents % 100 ? 2 : 0 });
const STATUS: Record<string, "success" | "info" | "warning" | "neutral" | "danger"> = { booked: "success", completed: "info", no_show: "warning", cancelled: "danger" };
const STATUS_LABEL: Record<string, string> = { booked: "Prenotato", completed: "Completato", cancelled: "Annullato", no_show: "Assente" };
const STATUS_COLOR: Record<string, string> = { booked: "var(--success)", completed: "var(--info)", no_show: "var(--warning)", cancelled: "var(--danger)" };
const SOURCE_LABEL: Record<string, string> = { whatsapp: "WhatsApp", gestionale: "Gestionale", online: "Online", phone: "Telefono" };
const SOURCE_ICON: Record<string, LucideIcon> = { whatsapp: MessageCircle, gestionale: Store, online: Globe, phone: Phone };

const initialsOf = (a: AppointmentWithRelations) => {
  const n = (a.customer_name ?? "").trim();
  if (!n) return "#";
  const parts = n.split(/\s+/);
  return ((parts[0][0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "#";
};

/** Compact appointment card for the phone layout (the table needs 720px+). */
function ApptCard({ a }: { a: AppointmentWithRelations }) {
  const SourceIcon = SOURCE_ICON[a.source] ?? Globe;
  const cancelled = a.status === "cancelled";
  return (
    <Card className="relative overflow-hidden p-4 pl-5" style={cancelled ? { opacity: 0.65 } : undefined}>
      <span aria-hidden className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ background: STATUS_COLOR[a.status] ?? "var(--border-strong)" }} />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="text-[17px] font-semibold text-accent tabular-nums leading-none">{fmtTime(a.starts_at)}</span>
          <span className="text-xs text-faint tabular-nums">– {fmtTime(a.ends_at)}</span>
          {a.service?.duration_min != null && (
            <span className="inline-flex items-center gap-1 text-[11px] text-faint ml-1"><Clock size={11} /> {a.service.duration_min} min</span>
          )}
        </div>
        <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge>
      </div>
      <div className="flex items-center gap-3 mt-3.5">
        <Avatar initials={initialsOf(a)} size={38} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold truncate" style={{ color: "var(--text)" }}>{a.customer_name || a.customer_phone}</p>
          <p className="text-[13px] text-muted truncate">{a.service?.name ?? "—"}</p>
        </div>
        {a.service?.price_cents != null && (
          <span className="text-sm font-semibold tabular-nums shrink-0" style={{ color: "var(--text)" }}>{fmtPrice(a.service.price_cents)}</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 mt-3.5 pt-3" style={{ borderTop: "1px solid var(--border)" }}>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted min-w-0">
          <Scissors size={12.5} className="shrink-0 text-faint" /><span className="truncate">{a.stylist?.name ?? "—"}</span>
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0" style={{ background: "var(--surface-2)", color: "var(--text-muted)" }}>
          <SourceIcon size={11.5} /> {SOURCE_LABEL[a.source] ?? a.source}
        </span>
      </div>
    </Card>
  );
}

export default function AppuntamentiPage() {
  const [appts, setAppts] = useState<AppointmentWithRelations[]>([]);
  const [stylists, setStylists] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(plusDays(30));
  const [status, setStatus] = useState(""); const [op, setOp] = useState(""); const [src, setSrc] = useState("");

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const d = await fetch(`/api/appointments?from=${from}&to=${to}`).then((r) => r.json());
      setAppts(Array.isArray(d) ? d : []);
    } catch { /* keep last-known data on a transient fetch error */ }
    if (!silent) setLoading(false);
  }, [from, to]);
  useEffect(() => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ load(); }, [load]);
  // Silently re-fetch so appointments created/cancelled elsewhere (e.g. the
  // WhatsApp agent) appear without a manual page refresh. Silent = no spinner.
  useEffect(() => { const t = setInterval(() => load(true), 20_000); return () => clearInterval(t); }, [load]);
  useEffect(() => { fetch("/api/stylists").then((r) => r.json()).then((st) => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ setStylists((st as { id: string; name: string }[]).map((s) => ({ id: s.id, name: s.name }))); }); }, []);

  const filtered = useMemo(() => appts.filter((a) => {
    // No explicit status filter: hide cancelled so a cancelled appointment
    // "disappears". Selecting "Annullato" in the filter still shows them.
    if (status) { if (a.status !== status) return false; }
    else if (a.status === "cancelled") return false;
    if (op && a.stylist_id !== op) return false;
    if (src && a.source !== src) return false;
    return true;
  }), [appts, status, op, src]);
  const { page, setPage, pageItems, pageCount, total } = usePagination(filtered, 20);
  // Phone layout groups the page's rows by day ("Oggi", "Domani", …); the API
  // returns rows ordered by starts_at, so Map insertion order is already right.
  const dayGroups = useMemo(() => {
    const m = new Map<string, AppointmentWithRelations[]>();
    for (const a of pageItems) {
      const k = dayKey(a.starts_at);
      const g = m.get(k);
      if (g) g.push(a); else m.set(k, [a]);
    }
    return [...m.entries()];
  }, [pageItems]);
  const today = todayStr(), tomorrow = plusDays(1);

  // Excel: CSV with UTF-8 BOM + ";" separator so Italian-locale Excel opens it
  // directly with correct accents and columns. Exports ALL filtered rows.
  const exportExcel = useCallback(() => {
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const rows = filtered.map((a) => [
      fmtDate(a.starts_at), fmtTime(a.starts_at), a.customer_name || a.customer_phone, a.customer_phone,
      a.service?.name ?? "", a.stylist?.name ?? "", STATUS_LABEL[a.status] ?? a.status, SOURCE_LABEL[a.source] ?? a.source,
      a.service?.price_cents != null ? (a.service.price_cents / 100).toFixed(2).replace(".", ",") : "",
    ]);
    const head = ["Data", "Ora", "Cliente", "Telefono", "Servizio", "Operatore", "Stato", "Origine", "Prezzo (EUR)"];
    const bom = String.fromCharCode(0xfeff); // UTF-8 BOM so Excel detects the encoding
    const csv = bom + [head, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `appuntamenti_${from}_${to}.csv`; link.click();
    URL.revokeObjectURL(url);
  }, [filtered, from, to]);

  // PDF: open a clean print document and trigger the browser's print dialog
  // ("Salva come PDF"). No PDF library needed.
  const exportPdf = useCallback(() => {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const totalCents = filtered.reduce((s, a) => s + (a.service?.price_cents ?? 0), 0);
    const body = filtered.map((a) => `<tr>
      <td class="cap">${esc(fmtDate(a.starts_at))}</td><td class="num">${fmtTime(a.starts_at)}</td>
      <td><strong>${esc(a.customer_name || a.customer_phone)}</strong></td>
      <td>${esc(a.service?.name ?? "—")}</td><td>${esc(a.stylist?.name ?? "—")}</td>
      <td><span class="badge b-${a.status}">${STATUS_LABEL[a.status] ?? esc(a.status)}</span></td>
      <td>${SOURCE_LABEL[a.source] ?? esc(a.source)}</td>
      <td class="num">${a.service?.price_cents != null ? esc(fmtPrice(a.service.price_cents)) : "—"}</td>
    </tr>`).join("");
    const html = `<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Appuntamenti ${from} → ${to}</title><style>
      body{font-family:-apple-system,"Segoe UI",Roboto,sans-serif;color:#2a2230;margin:28px;}
      h1{font-size:19px;margin:0;} .sub{color:#877c86;font-size:12px;margin:4px 0 18px;}
      table{width:100%;border-collapse:collapse;font-size:11.5px;}
      th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;color:#877c86;padding:6px 8px;border-bottom:1.5px solid #d8d2ce;}
      td{padding:7px 8px;border-bottom:1px solid #eee9e6;vertical-align:top;}
      tr:nth-child(even) td{background:#faf7f5;}
      .num{font-variant-numeric:tabular-nums;white-space:nowrap;} .cap{text-transform:capitalize;white-space:nowrap;}
      .badge{display:inline-block;padding:1px 7px;border-radius:8px;font-size:10px;font-weight:600;}
      .b-booked{background:#e2f3ea;color:#2e9e6b;} .b-completed{background:#e7eef6;color:#4a78b0;}
      .b-cancelled{background:#f9e6e9;color:#c4485b;} .b-no_show{background:#f7edda;color:#bd8226;}
      .tot{margin-top:14px;font-size:12px;color:#877c86;display:flex;justify-content:space-between;}
      @page{margin:14mm;}
    </style></head><body>
      <h1>Max&amp;Tony Nazionale — Appuntamenti</h1>
      <p class="sub">Periodo ${from} → ${to} · ${filtered.length} appuntamenti · generato il ${new Date().toLocaleString("it-IT", { timeZone: TZ })}</p>
      <table><thead><tr><th>Data</th><th>Ora</th><th>Cliente</th><th>Servizio</th><th>Operatore</th><th>Stato</th><th>Origine</th><th>Prezzo</th></tr></thead><tbody>${body}</tbody></table>
      <p class="tot"><span>${filtered.length} appuntamenti</span><span>Totale servizi: <strong>${esc(fmtPrice(totalCents))}</strong></span></p>
      <script>window.onload = () => window.print();</script>
    </body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }, [filtered, from, to]);
  const activeFilters = (status ? 1 : 0) + (op ? 1 : 0) + (src ? 1 : 0);
  const summary = useMemo(() => ({
    total: appts.length,
    booked: appts.filter((a) => a.status === "booked").length,
    completed: appts.filter((a) => a.status === "completed").length,
    cancelled: appts.filter((a) => a.status === "cancelled" || a.status === "no_show").length,
  }), [appts]);

  return (
    <AppShell title="Appuntamenti" subtitle={`${from} → ${to}`} actions={<>
      <Button size="sm" variant="secondary" onClick={exportExcel} disabled={loading || filtered.length === 0} title="Esporta in Excel (CSV)">
        <FileSpreadsheet size={15} /> <span className="hidden sm:inline">Excel</span>
      </Button>
      <Button size="sm" variant="secondary" onClick={exportPdf} disabled={loading || filtered.length === 0} title="Stampa / salva come PDF">
        <FileText size={15} /> <span className="hidden sm:inline">PDF</span>
      </Button>
    </>}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard icon={CalendarClock} value={summary.total} label="Totale" accent />
        <StatCard icon={Hourglass} value={summary.booked} label="Prenotati" />
        <StatCard icon={Check} value={summary.completed} label="Completati" />
        <StatCard icon={X} value={summary.cancelled} label="Annullati/Assenti" />
      </div>

      <Filters activeCount={activeFilters} onReset={() => { setStatus(""); setOp(""); setSrc(""); }}>
        <FilterField label="Dal"><DateField value={from} onChange={setFrom} max={to} /></FilterField>
        <FilterField label="Al"><DateField value={to} onChange={setTo} min={from} /></FilterField>
        <FilterField label="Stato"><Select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Tutti</option>{Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FilterField>
        <FilterField label="Operatore"><Select value={op} onChange={(e) => setOp(e.target.value)}><option value="">Tutti</option>{stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></FilterField>
        <FilterField label="Origine"><Select value={src} onChange={(e) => setSrc(e.target.value)}><option value="">Tutte</option>{Object.entries(SOURCE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></FilterField>
      </Filters>

      {loading ? <p className="text-sm text-muted">Caricamento…</p> : (
        <>
          {/* Phone: day-grouped cards (the table below needs 720px+ and would only pan). */}
          <div className="md:hidden space-y-5">
            {dayGroups.map(([key, list]) => (
              <section key={key}>
                <div className="flex items-baseline justify-between gap-3 px-1 mb-2">
                  <h3 className="text-[13px] font-semibold capitalize truncate" style={{ color: "var(--text)" }}>
                    {key === today ? <><span className="text-accent">Oggi</span><span className="font-normal text-faint"> · </span>{fmtDayLong(list[0].starts_at)}</>
                      : key === tomorrow ? <><span className="text-accent">Domani</span><span className="font-normal text-faint"> · </span>{fmtDayLong(list[0].starts_at)}</>
                      : fmtDayLong(list[0].starts_at)}
                  </h3>
                  <span className="text-[11px] text-faint tabular-nums shrink-0">{list.length} app.</span>
                </div>
                <div className="space-y-2.5">{list.map((a) => <ApptCard key={a.id} a={a} />)}</div>
              </section>
            ))}
            {filtered.length === 0 && (
              <Card className="py-10 px-5 text-center">
                <CalendarClock size={26} className="mx-auto text-faint mb-2" />
                <p className="text-sm text-faint">Nessun appuntamento nel periodo.</p>
              </Card>
            )}
          </div>

          <Card className="overflow-hidden hidden md:block">
            <div className="overflow-x-auto thin-scroll"><div className="min-w-[720px]">
              <div className="grid grid-cols-[110px_60px_1fr_1fr_1fr_auto_auto] gap-3 px-5 py-2.5 bd-b text-[11px] uppercase tracking-wide text-faint">
                <span>Data</span><span>Ora</span><span>Cliente</span><span>Servizio</span><span>Operatore</span><span>Stato</span><span>Origine</span>
              </div>
              {pageItems.map((a, i) => (
                <div key={a.id} className={`grid grid-cols-[110px_60px_1fr_1fr_1fr_auto_auto] gap-3 items-center px-5 py-3 bd-b last:border-b-0 ${i % 2 === 1 ? "zebra-alt" : ""}`}>
                  <span className="text-sm capitalize" style={{ color: "var(--text)" }}>{fmtDate(a.starts_at)}</span>
                  <span className="text-sm font-medium text-accent tabular-nums">{fmtTime(a.starts_at)}</span>
                  <span className="text-sm truncate" style={{ color: "var(--text)" }}>{a.customer_name || a.customer_phone}</span>
                  <span className="text-sm text-muted truncate">{a.service?.name ?? "—"}</span>
                  <span className="text-sm text-muted truncate">{a.stylist?.name ?? "—"}</span>
                  <Badge tone={STATUS[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                  <span className="text-xs text-faint">{SOURCE_LABEL[a.source] ?? a.source}</span>
                </div>
              ))}
              {filtered.length === 0 && <p className="text-sm text-faint px-5 py-8 text-center">Nessun appuntamento nel periodo.</p>}
            </div></div>
          </Card>
          <Pagination page={page} pageCount={pageCount} total={total} onPage={setPage} />
        </>
      )}
    </AppShell>
  );
}
