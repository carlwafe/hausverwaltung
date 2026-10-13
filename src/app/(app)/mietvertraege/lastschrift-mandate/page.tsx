import { ladeMandatZeilen } from "@/lib/mandat-laden";
import { MandateTabelle } from "./mandate-tabelle";

export default async function LastschriftMandatePage() {
  const zeilen = await ladeMandatZeilen({ status: { in: ["AKTIV", "GEPLANT"] } });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Lastschrift-Mandate</h1>
        <p className="text-sm text-neutral-400">
          Vorübergehende Seite zum Erstellen der SEPA-Lastschriftmandate (Formular zum Ausdrucken, Mieter und Mietobjekt
          schon eingetragen; Kontoinhaber, Bank, IBAN, Datum und Unterschrift füllt der Mieter aus). „Erstellen“ öffnet das
          Mandat eines Vertrags; mehrere Zeilen ankreuzen druckt alle Mandate in einem Durchgang, je Mieter ein Blatt.
          Gezeigt werden aktive und geplante Mietverträge. Es wird nichts gespeichert — das unterschriebene Mandat
          als Scan in der Mieterakte ablegen (Dokumente). Die Mandatsreferenz ist je Einheit vorgeschlagen; für ein neues
          Mandat derselben Einheit die Endnummer von Hand hochzählen. Gläubiger, Zahlungsempfänger, Anschrift und Gläubiger-ID
          stehen beim Objekt (Verwaltung → Objekt → SEPA-Lastschrift) und sind in den Mandaten vorausgefüllt. Die Seite entfällt, sobald Mandate in der App erfasst werden.
        </p>
      </div>
      <MandateTabelle alle={zeilen} />
    </div>
  );
}
