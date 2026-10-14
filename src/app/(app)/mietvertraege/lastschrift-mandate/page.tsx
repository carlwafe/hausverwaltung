import { ladeMandatZeilen } from "@/lib/mandat-laden";
import { MandateTabelle } from "./mandate-tabelle";

export default async function LastschriftMandatePage() {
  const zeilen = await ladeMandatZeilen({ status: { in: ["AKTIV", "GEPLANT"] } }, true);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Lastschrift-Mandate</h1>
        <p className="text-sm text-neutral-400">
          Hier lassen sich SEPA-Lastschriftmandate zum Ausdrucken erstellen (Mieter und Mietobjekt sind eingetragen;
          Kontoinhaber, Bank, IBAN, Datum und Unterschrift füllt der Mieter aus). Gläubigerin ist die Vermieterin;
          Gläubiger, Anschrift und Gläubiger-ID stehen beim Objekt (Verwaltung → Objekt → SEPA-Lastschrift). Es wird
          nichts gespeichert — das unterschriebene Mandat als Scan in der Mieterakte ablegen (Dokumente). Bei einem
          neuen Mandat die Mandatsreferenz je Einheit hochzählen.
        </p>
        <div className="mt-3 rounded-lg border border-green-900 bg-green-950/30 p-3 text-sm text-green-300">
          <p className="font-medium">Mieter, die schon per Lastschrift zahlen, haben bereits ein Mandat.</p>
          <p className="mt-1 text-green-300/80">
            Die bisherigen Einzüge laufen unter der Gläubiger-ID der Vermieterin, die bestehenden Mandate bleiben
            deshalb gültig — dafür ist <strong>kein neues Mandat</strong> nötig. Referenz, Gläubiger-ID und IBAN stehen
            am Mietvertrag (Abschnitt „Vertragsdaten“). Ein neues Mandat brauchen nur Mieter ohne Mandat
            (Überweiser, die auf Lastschrift umstellen, neue Verträge) oder bei geänderter Gläubigerin bzw. geänderter
            Gläubiger-Kontoverbindung. Standardmäßig zeigt die Liste deshalb nur Verträge ohne erfasstes Mandat, bei
            denen der Mieter die Miete selbst zahlt; Verträge, die Jobcenter oder Kreis Ostholstein bezahlt (Zahler aus den
            Mietzahlungen der letzten 12 Monate), stehen in einem eigenen Filter.
          </p>
        </div>
      </div>
      <MandateTabelle alle={zeilen} />
    </div>
  );
}
