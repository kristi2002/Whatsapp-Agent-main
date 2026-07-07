"use client";

import { useEffect, useState, useCallback } from "react";
import { Check, ChevronLeft, Scissors, Clock } from "lucide-react";
import { Button, Input } from "@/components/ui";
import { DateField } from "@/components/pickers";

const TZ = "Europe/Rome";
const euro = (c: number | null) => (c == null ? "" : "€" + (c / 100).toFixed(2).replace(".", ","));
const todayStr = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
const maxStr = () => { const d = new Date(); d.setDate(d.getDate() + 60); return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); };

interface Svc { id: string; name: string; duration_min: number; price_cents: number | null }
interface Sty { id: string; name: string }
interface Opt { iso: string; label: string; stylists: string[] }

export default function PrenotaPage() {
  const [salon, setSalon] = useState<{ name: string; address: string; phone: string } | null>(null);
  const [services, setServices] = useState<Svc[]>([]);
  const [stylists, setStylists] = useState<Sty[]>([]);
  const [step, setStep] = useState(0);
  const [service, setService] = useState<Svc | null>(null);
  const [stylistId, setStylistId] = useState("");
  const [date, setDate] = useState(todayStr());
  const [options, setOptions] = useState<Opt[]>([]);
  const [slot, setSlot] = useState<Opt | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [booking, setBooking] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => { fetch("/api/public/setup").then((r) => r.json()).then((d) => { /* eslint-disable-next-line react-hooks/set-state-in-effect */ setSalon(d.salon); setServices(d.services); setStylists(d.stylists); }); }, []);

  const loadSlots = useCallback(async () => {
    if (!service) return;
    setLoadingSlots(true); setSlot(null);
    const p = new URLSearchParams({ service: service.id, date }); if (stylistId) p.set("stylist", stylistId);
    const d = await fetch(`/api/public/availability?${p}`).then((r) => r.json());
    setOptions(d.options ?? []); setLoadingSlots(false);
  }, [service, date, stylistId]);
  useEffect(() => { if (step === 3) loadSlots(); }, [step, loadSlots]);

  async function confirm() {
    if (!service || !slot) return;
    setBooking(true); setError("");
    const res = await fetch("/api/public/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ service: service.id, startIso: slot.iso, stylist: stylistId || null, customerName: name, customerPhone: phone }) });
    const d = await res.json(); setBooking(false);
    if (!res.ok || !d.ok) { setError(d.message || "Errore nella prenotazione."); loadSlots(); return; }
    setDone(d.message || "Prenotazione confermata!");
  }

  const steps = ["Servizio", "Operatore", "Data", "Orario", "Dati"];

  return (
    <div className="min-h-screen flex flex-col items-center px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl mx-auto flex items-center justify-center mb-2" style={{ background: "var(--accent)" }}><span className="text-lg font-bold" style={{ color: "var(--accent-fg)" }}>M</span></div>
          <h1 className="text-lg font-semibold" style={{ color: "var(--text)" }}>{salon?.name ?? "Prenota online"}</h1>
          {salon && <p className="text-xs text-muted">{salon.address}</p>}
        </div>

        {done ? (
          <div className="card p-8 text-center" style={{ boxShadow: "var(--shadow)" }}>
            <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center mb-3" style={{ background: "var(--success-soft)", color: "var(--success)" }}><Check size={28} /></div>
            <h2 className="text-base font-semibold mb-1" style={{ color: "var(--text)" }}>Prenotazione confermata</h2>
            <p className="text-sm text-muted mb-4">{done}</p>
            <Button variant="secondary" onClick={() => { setDone(null); setStep(0); setService(null); setStylistId(""); setSlot(null); setName(""); setPhone(""); }}>Nuova prenotazione</Button>
          </div>
        ) : (
          <div className="card p-5 sm:p-6" style={{ boxShadow: "var(--shadow)" }}>
            <div className="flex items-center gap-1.5 mb-5">
              {steps.map((s, i) => (<div key={s} className="flex-1 h-1 rounded-full" style={{ background: i <= step ? "var(--accent)" : "var(--surface-2)" }} />))}
            </div>
            {step > 0 && <button onClick={() => setStep((s) => s - 1)} className="inline-flex items-center gap-1 text-sm text-muted hover:text-accent mb-3"><ChevronLeft size={15} /> Indietro</button>}

            {step === 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>Scegli il servizio</p>
                {services.map((s) => (
                  <button key={s.id} onClick={() => { setService(s); setStep(1); }} className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover-surface" style={{ border: "1px solid var(--border)" }}>
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent-soft-fg)" }}><Scissors size={16} /></div>
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate" style={{ color: "var(--text)" }}>{s.name}</p><p className="text-xs text-muted flex items-center gap-1"><Clock size={11} /> {s.duration_min} min</p></div>
                    <span className="text-sm font-semibold" style={{ color: "var(--text)" }}>{euro(s.price_cents)}</span>
                  </button>
                ))}
              </div>
            )}

            {step === 1 && (
              <div className="space-y-2">
                <p className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>Scegli l&apos;operatore</p>
                <button onClick={() => { setStylistId(""); setStep(2); }} className="w-full p-3 rounded-xl text-left hover-surface text-sm" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>Qualsiasi operatore disponibile</button>
                {stylists.map((s) => (<button key={s.id} onClick={() => { setStylistId(s.id); setStep(2); }} className="w-full p-3 rounded-xl text-left hover-surface text-sm" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>{s.name}</button>))}
              </div>
            )}

            {step === 2 && (
              <div>
                <p className="text-sm font-medium mb-2" style={{ color: "var(--text)" }}>Scegli la data</p>
                <DateField value={date} onChange={setDate} min={todayStr()} max={maxStr()} />
                <div className="flex justify-end mt-4"><Button onClick={() => setStep(3)}>Continua</Button></div>
              </div>
            )}

            {step === 3 && (
              <div>
                <p className="text-sm font-medium mb-3" style={{ color: "var(--text)" }}>Orari disponibili</p>
                {loadingSlots ? <p className="text-sm text-muted">Caricamento…</p> : options.length === 0 ? (
                  <p className="text-sm text-faint py-4 text-center">Nessun orario libero. Prova un&apos;altra data.</p>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {options.map((o) => (<button key={o.iso} onClick={() => { setSlot(o); setStep(4); }} className="py-2 rounded-lg text-sm font-medium hover-surface" style={{ border: "1px solid var(--border)", color: "var(--text)" }}>{o.label.split(", ")[1] ?? o.label}</button>))}
                  </div>
                )}
              </div>
            )}

            {step === 4 && slot && (
              <div className="space-y-3">
                <div className="p-3 rounded-xl mb-1" style={{ background: "var(--surface-2)" }}>
                  <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{service?.name}</p>
                  <p className="text-xs text-muted capitalize">{slot.label}{stylistId ? ` · ${stylists.find((s) => s.id === stylistId)?.name}` : ""}</p>
                </div>
                <Input placeholder="Il tuo nome" value={name} onChange={(e) => setName(e.target.value)} />
                <Input placeholder="Telefono (es. 3801234567)" value={phone} onChange={(e) => setPhone(e.target.value)} />
                {error && <p className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
                <Button className="w-full" onClick={confirm} disabled={booking || !name.trim() || !phone.trim()}>{booking ? "Prenotazione…" : "Conferma prenotazione"}</Button>
              </div>
            )}
          </div>
        )}
        <p className="text-center text-[11px] text-faint mt-4">{salon?.phone}</p>
      </div>
    </div>
  );
}
