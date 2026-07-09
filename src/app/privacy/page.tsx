import type { Metadata } from "next";
import Link from "next/link";
import { SALON } from "@/lib/salon-config";

export const metadata: Metadata = {
  title: `Privacy Policy — ${SALON.name}`,
  description: `Informativa sulla privacy per l'assistente WhatsApp di ${SALON.name}.`,
};

// Public page (see PUBLIC_PATHS in proxy.ts). Meta requires a reachable
// Privacy Policy URL before a WhatsApp app can be switched to Live mode.
export default function PrivacyPage() {
  const updated = "6 luglio 2026";

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
      {/* Header */}
      <header className="bd-b" style={{ background: "var(--surface)" }}>
        <div className="mx-auto max-w-3xl px-6 h-14 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-hover))" }}>
            <span className="text-[12px] font-bold tracking-tight" style={{ color: "#fff" }}>MT</span>
          </div>
          <span className="text-sm font-semibold">{SALON.name}</span>
          <Link href="/prenota" className="ml-auto text-xs text-muted hover:text-accent transition-colors">Prenota online →</Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-6 py-12 leading-relaxed flex-1">
        <h1 className="text-3xl font-bold tracking-tight" style={{ color: "var(--text)" }}>Informativa sulla Privacy</h1>
        <p className="mt-2 text-sm text-faint">Ultimo aggiornamento: {updated}</p>

        <p className="mt-6 text-muted">
          La presente informativa descrive come {SALON.name} (&ldquo;noi&rdquo;)
          tratta i dati personali dei clienti che ci contattano tramite il nostro
          assistente su WhatsApp per prenotare, modificare o annullare appuntamenti
          e per richiedere informazioni sui nostri servizi.
        </p>

        <Section title="Titolare del trattamento">
          {SALON.name}
          <br />
          {SALON.address}
          <br />
          Tel: {SALON.phone}
          {SALON.email ? (<><br />Email: {SALON.email}</>) : null}
        </Section>

        <Section title="Dati che raccogliamo">
          <ul className="list-disc pl-6 space-y-1">
            <li>Il tuo numero di telefono WhatsApp e il nome del profilo.</li>
            <li>Il contenuto dei messaggi che ci invii e delle nostre risposte.</li>
            <li>I dettagli delle prenotazioni (servizio richiesto, data e ora, parrucchiere).</li>
          </ul>
        </Section>

        <Section title="Finalità e base giuridica">
          Trattiamo questi dati per gestire le tue richieste e prenotazioni e per
          fornirti assistenza. La base giuridica è l&rsquo;esecuzione di misure
          precontrattuali e contrattuali da te richieste (art. 6.1.b GDPR) e, ove
          applicabile, il nostro legittimo interesse a rispondere alle tue
          richieste (art. 6.1.f GDPR).
        </Section>

        <Section title="Fornitori e destinatari">
          Per erogare il servizio ci avvaliamo di fornitori che agiscono come
          responsabili del trattamento: Meta Platforms (WhatsApp Business API) per
          lo scambio dei messaggi, un fornitore di modelli di intelligenza
          artificiale per generare le risposte, e un servizio di hosting del
          database per conservare conversazioni e appuntamenti. Non vendiamo i tuoi
          dati a terzi.
        </Section>

        <Section title="Conservazione">
          Conserviamo i messaggi e i dati delle prenotazioni per il tempo
          necessario a gestire il rapporto con il cliente e ad adempiere agli
          obblighi di legge, dopodiché vengono cancellati o anonimizzati.
        </Section>

        <Section title="I tuoi diritti">
          Hai diritto di accedere ai tuoi dati, chiederne la rettifica o la
          cancellazione, limitarne o opporti al trattamento e richiederne la
          portabilità. Per esercitare questi diritti puoi contattarci ai recapiti
          indicati sopra. Hai inoltre diritto di proporre reclamo al Garante per la
          protezione dei dati personali.
        </Section>

        <Section title="Contatti">
          Per qualsiasi domanda su questa informativa o sul trattamento dei tuoi
          dati, contatta {SALON.name} al numero {SALON.phone}.
        </Section>
      </main>

      {/* Footer */}
      <footer className="bd-b border-b-0" style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
        <div className="mx-auto max-w-3xl px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted">
          <span>© {new Date().getFullYear()} {SALON.name} — {SALON.address}</span>
          <span className="flex items-center gap-4">
            <Link href="/prenota" className="hover:text-accent transition-colors">Prenota</Link>
            <Link href="/login" className="hover:text-accent transition-colors">Accesso staff</Link>
          </span>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mt-8 text-xl font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
      <div className="mt-2 text-muted">{children}</div>
    </section>
  );
}
