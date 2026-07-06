import type { Metadata } from "next";
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
    <main className="mx-auto max-w-3xl px-6 py-12 text-gray-800 leading-relaxed">
      <h1 className="text-3xl font-bold text-gray-900">Informativa sulla Privacy</h1>
      <p className="mt-2 text-sm text-gray-500">Ultimo aggiornamento: {updated}</p>

      <p className="mt-6">
        La presente informativa descrive come {SALON.name} (&ldquo;noi&rdquo;)
        tratta i dati personali dei clienti che ci contattano tramite il nostro
        assistente su WhatsApp per prenotare, modificare o annullare appuntamenti
        e per richiedere informazioni sui nostri servizi.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Titolare del trattamento</h2>
      <p className="mt-2">
        {SALON.name}
        <br />
        {SALON.address}
        <br />
        Tel: {SALON.phone}
        {SALON.email ? (
          <>
            <br />
            Email: {SALON.email}
          </>
        ) : null}
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Dati che raccogliamo</h2>
      <ul className="mt-2 list-disc pl-6 space-y-1">
        <li>Il tuo numero di telefono WhatsApp e il nome del profilo.</li>
        <li>Il contenuto dei messaggi che ci invii e delle nostre risposte.</li>
        <li>
          I dettagli delle prenotazioni (servizio richiesto, data e ora,
          parrucchiere).
        </li>
      </ul>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Finalità e base giuridica</h2>
      <p className="mt-2">
        Trattiamo questi dati per gestire le tue richieste e prenotazioni e per
        fornirti assistenza. La base giuridica è l&rsquo;esecuzione di misure
        precontrattuali e contrattuali da te richieste (art. 6.1.b GDPR) e, ove
        applicabile, il nostro legittimo interesse a rispondere alle tue
        richieste (art. 6.1.f GDPR).
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Fornitori e destinatari</h2>
      <p className="mt-2">
        Per erogare il servizio ci avvaliamo di fornitori che agiscono come
        responsabili del trattamento: Meta Platforms (WhatsApp Business API) per
        lo scambio dei messaggi, un fornitore di modelli di intelligenza
        artificiale per generare le risposte, e un servizio di hosting del
        database per conservare conversazioni e appuntamenti. Non vendiamo i tuoi
        dati a terzi.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Conservazione</h2>
      <p className="mt-2">
        Conserviamo i messaggi e i dati delle prenotazioni per il tempo
        necessario a gestire il rapporto con il cliente e ad adempiere agli
        obblighi di legge, dopodiché vengono cancellati o anonimizzati.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">I tuoi diritti</h2>
      <p className="mt-2">
        Hai diritto di accedere ai tuoi dati, chiederne la rettifica o la
        cancellazione, limitarne o opporti al trattamento e richiederne la
        portabilità. Per esercitare questi diritti puoi contattarci ai recapiti
        indicati sopra. Hai inoltre diritto di proporre reclamo al Garante per la
        protezione dei dati personali.
      </p>

      <h2 className="mt-8 text-xl font-semibold text-gray-900">Contatti</h2>
      <p className="mt-2">
        Per qualsiasi domanda su questa informativa o sul trattamento dei tuoi
        dati, contatta {SALON.name} al numero {SALON.phone}.
      </p>
    </main>
  );
}
