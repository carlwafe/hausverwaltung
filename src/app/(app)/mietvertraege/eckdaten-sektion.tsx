import Link from "next/link";

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

function Feld({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-neutral-400">{label}</p>
      <p className="mt-0.5 text-sm text-white">{value}</p>
    </div>
  );
}

/**
 * Zeigt die Vertrags-Eckdaten als reinen Lesetext. Bearbeiten (Formular + Mieterhöhungen +
 * Löschen-Knopf) passiert auf einer eigenen Unterseite (/mietvertraege/[id]/bearbeiten) statt
 * eingeklappt auf dieser Seite — die normale Ansicht bleibt dadurch aufgeräumt und zeigt keinen
 * Löschen-Knopf mehr.
 */
export function EckdatenSektion({
  mietvertragId,
  einheitLabel,
  mieterNamen,
  beginnText,
  endeText,
  kaltmieteText,
  nebenkostenText,
  mehrwertsteuerText,
  status,
  saldovortragText,
  kaution,
  letzteErhoehungText,
}: {
  mietvertragId: string;
  einheitLabel: string;
  mieterNamen: string;
  beginnText: string;
  endeText: string;
  kaltmieteText: string;
  nebenkostenText: string;
  mehrwertsteuerText: string | null;
  status: string;
  saldovortragText: string;
  kaution: { betragText: string; anlageform: string; zinssatzText: string } | null;
  // Fliesstext-Hinweis auf die letzte Mieterhöhung (z.B. "Miete zuletzt zum 1.5.2026 auf 620,00 €
  // erhöht") — die volle Historie/Erfassung steht auf der Bearbeiten-Unterseite.
  letzteErhoehungText: string | null;
}) {
  return (
    <div className="mb-6 rounded-lg border border-neutral-800 p-4">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-medium text-white">Vertragsdaten</h2>
        <Link
          href={`/mietvertraege/${mietvertragId}/bearbeiten`}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Bearbeiten
        </Link>
      </div>

      <div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Feld label="Einheit" value={einheitLabel} />
          <Feld label="Mieter" value={mieterNamen} />
          <Feld label="Mietbeginn" value={beginnText} />
          <Feld label="Mietende" value={endeText} />
          <Feld label="Kaltmiete" value={kaltmieteText} />
          <Feld label="NK-Vorauszahlung" value={nebenkostenText} />
          {mehrwertsteuerText && <Feld label="Mehrwertsteuer" value={mehrwertsteuerText} />}
          <Feld label="Status" value={STATUS_LABEL[status] ?? status} />
          <Feld label="Saldovortrag" value={saldovortragText} />
          {kaution && (
            <>
              <Feld label="Kaution" value={kaution.betragText} />
              <Feld label="Kaution-Anlageform" value={ANLAGEFORM_LABEL[kaution.anlageform] ?? kaution.anlageform} />
              <Feld label="Kaution-Zinssatz" value={kaution.zinssatzText} />
            </>
          )}
        </div>
        {letzteErhoehungText && (
          <p className="mt-4 text-xs text-neutral-400">
            {letzteErhoehungText} — Historie und Erfassung unter &bdquo;Bearbeiten&ldquo;.
          </p>
        )}
      </div>
    </div>
  );
}
