import { ladeMandatZeilen } from "@/lib/mandat-laden";
import { MandateTabelle } from "./mandate-tabelle";

export default async function LastschriftMandatePage() {
  const zeilen = await ladeMandatZeilen({ status: { in: ["AKTIV", "GEPLANT"] } });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Lastschrift-Mandate</h1>
        <p className="text-sm text-neutral-400">
          Vorübergehende Seite zum Erstellen von SEPA-Lastschriftmandaten (Formular zum Ausdrucken, Mieter und Mietobjekt
          schon eingetragen; Kontoinhaber, Bank, IBAN, Datum und Unterschrift füllt der Mieter aus). Gläubigerin ist die
          Vermieterin. Die bisherigen Lastschriften laufen unter ihrer Gläubiger-ID, die bestehenden Mandate bleiben
          deshalb gültig — ein neues Mandat brauchen nur Mieter ohne Mandat (Überweiser, die umstellen, neue Verträge) oder
          bei geändertem Gläubiger bzw. geänderter Gläubiger-Kontoverbindung. „Erstellen“ öffnet das Mandat eines Vertrags;
          mehrere Zeilen ankreuzen druckt alle in einem Durchgang, je Mieter ein Blatt. Gezeigt werden aktive und geplante
          Mietverträge. Es wird nichts gespeichert — das unterschriebene Mandat als Scan in der Mieterakte ablegen
          (Dokumente). Die Mandatsreferenz ist je Einheit vorgeschlagen; bei einem bestehenden Mandat die vorhandene
          Referenz aus dem Journal beibehalten. Gläubiger, Anschrift und Gläubiger-ID stehen beim Objekt (Verwaltung →
          Objekt → SEPA-Lastschrift). Die Seite entfällt, sobald Mandate in der App erfasst werden.
        </p>
      </div>
      <MandateTabelle alle={zeilen} />
    </div>
  );
}
