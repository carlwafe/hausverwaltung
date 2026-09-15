"use client";

import { Fragment, useActionState, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  previewImport,
  commitZahlungen,
  commitKosten,
  commitMietweiterleitungen,
  commitKautionsbuchungen,
  commitNebenkostenausgleich,
  ladeBestehendeImportSets,
  type BestehendeImportSets,
} from "./actions";
import type { ParsedZahlungRow } from "@/lib/import/zahlungen-import";
import type { ParsedKostenRow } from "@/lib/import/kosten-import";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { useSpaltenSortierung, SortableTh } from "@/components/spalten-sortierung";
import { gruppiereKostenarten } from "@/lib/kostenart-gruppen";
import { gruppiereGebaeude, type EinheitMitAdresse } from "@/lib/gebaeude-gruppen";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { datumBetragSchluessel } from "@/lib/import/bank-csv";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ---------- Zahlungen ----------

// Jede Zeile bekommt genau eine primäre Hinweis-Kategorie (die Art der Buchung — Fehler,
// Eigentümer, Rücklastschrift, …) nach Priorität, plus unabhängig davon null oder mehrere
// Zusatz-Tags (Dedup-Warnungen), die zusätzlich zur Kategorie angezeigt werden. Eine
// Rücklastschrift, die schon als Zahlung existiert, zeigt so z.B. "Rücklastschrift" +
// "Bereits importiert (als Zahlung)" gleichzeitig, statt dass der Dedup-Hinweis von der
// Kategorie verdeckt wird.
type ZahlungHinweisKategorie =
  | "fehler"
  | "eigentuemer"
  | "kaution"
  | "kleinreparatur"
  | "pruefen"
  | "mehrdeutig"
  | "rueckbuchung"
  | "vorschlag";

type ZahlungHinweisTag =
  | "bereits_importiert"
  | "bereits_als_kosten_importiert"
  | "bereits_als_nebenkostenausgleich_importiert";

type ZahlungHinweisFilter = "alle" | ZahlungHinweisKategorie | ZahlungHinweisTag;

function ermittleZahlungHinweis(
  r: Pick<
    ParsedZahlungRow,
    | "errors"
    | "eigentuemerBuchung"
    | "kaution"
    | "kleinreparatur"
    | "ignorieren"
    | "rueckbuchung"
    | "mehrdeutig"
    | "vorgeschlagenerMietvertragId"
  >,
): ZahlungHinweisKategorie {
  if (r.errors.length > 0) return "fehler";
  if (r.eigentuemerBuchung) return "eigentuemer";
  if (r.kaution) return "kaution";
  if (r.kleinreparatur) return "kleinreparatur";
  if (r.ignorieren) return "pruefen";
  // Eine Rücklastschrift mit bereits eindeutig ermitteltem Mietvertrag (z.B. über die
  // Mandatsreferenz) braucht keine gesonderte manuelle Prüfung mehr — das negative Vorzeichen im
  // Betrag bleibt als Hinweis sichtbar, analog zur Gutschrift im Kosten-Import.
  if (r.vorgeschlagenerMietvertragId) return "vorschlag";
  if (r.rueckbuchung) return "rueckbuchung";
  if (r.mehrdeutig) return "mehrdeutig";
  return "pruefen";
}

function ermittleZahlungTags(
  bereitsImportiert: boolean,
  bereitsAlsKostenImportiert: boolean,
  bereitsAlsNebenkostenausgleichImportiert: boolean,
): ZahlungHinweisTag[] {
  const tags: ZahlungHinweisTag[] = [];
  // Gilt unabhängig von der Kategorie: sowohl eine normale ausgehende Buchung, die schon als
  // Kostenposition erfasst ist, als auch z.B. eine Rücklastschrift oder Gutschrift, die
  // ebenfalls schon dort steht.
  if (bereitsAlsKostenImportiert) tags.push("bereits_als_kosten_importiert");
  // Vorrang vor dem allgemeinen "bereits_importiert": eine Nebenkostenausgleich-Buchung landet
  // nie in Zahlung (siehe ignorieren in zahlungen-import.ts), "bereits_importiert" (als Zahlung)
  // kann für sie also gar nicht zutreffen — trotzdem beide unabhängig prüfen, falls sich das
  // einmal ändert.
  if (bereitsAlsNebenkostenausgleichImportiert) tags.push("bereits_als_nebenkostenausgleich_importiert");
  if (bereitsImportiert) tags.push("bereits_importiert");
  return tags;
}

const ZAHLUNG_HINWEIS_LABELS: Record<ZahlungHinweisKategorie | ZahlungHinweisTag, string> = {
  fehler: "Fehler",
  eigentuemer: "Eigentümer-Buchung",
  kaution: "Kaution",
  kleinreparatur: "Kleinreparatur-Erstattung",
  pruefen: "Bitte prüfen",
  mehrdeutig: "Mehrdeutig",
  rueckbuchung: "Rücklastschrift",
  vorschlag: "Vorschlag übernommen",
  bereits_importiert: "Bereits importiert (als Zahlung)",
  bereits_als_kosten_importiert: "Bereits importiert (als Kosten)",
  bereits_als_nebenkostenausgleich_importiert: "Bereits importiert (als Nebenkostenabrechnung)",
};

const ZAHLUNG_HINWEIS_FARBEN: Record<ZahlungHinweisKategorie | ZahlungHinweisTag, string> = {
  fehler: "text-red-400",
  eigentuemer: "text-neutral-500",
  kaution: "text-blue-400",
  kleinreparatur: "text-blue-400",
  pruefen: "text-neutral-500",
  mehrdeutig: "text-amber-400",
  rueckbuchung: "text-red-400",
  vorschlag: "text-green-400",
  bereits_importiert: "text-amber-400",
  bereits_als_kosten_importiert: "text-green-400",
  bereits_als_nebenkostenausgleich_importiert: "text-green-400",
};

const ZAHLUNG_HINWEIS_OPTIONEN: { value: ZahlungHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: ZAHLUNG_HINWEIS_LABELS.vorschlag },
  { value: "pruefen", label: ZAHLUNG_HINWEIS_LABELS.pruefen },
  { value: "mehrdeutig", label: ZAHLUNG_HINWEIS_LABELS.mehrdeutig },
  { value: "rueckbuchung", label: ZAHLUNG_HINWEIS_LABELS.rueckbuchung },
  { value: "bereits_importiert", label: ZAHLUNG_HINWEIS_LABELS.bereits_importiert },
  {
    value: "bereits_als_kosten_importiert",
    label: ZAHLUNG_HINWEIS_LABELS.bereits_als_kosten_importiert,
  },
  {
    value: "bereits_als_nebenkostenausgleich_importiert",
    label: ZAHLUNG_HINWEIS_LABELS.bereits_als_nebenkostenausgleich_importiert,
  },
  { value: "eigentuemer", label: ZAHLUNG_HINWEIS_LABELS.eigentuemer },
  { value: "kaution", label: ZAHLUNG_HINWEIS_LABELS.kaution },
  { value: "kleinreparatur", label: ZAHLUNG_HINWEIS_LABELS.kleinreparatur },
  { value: "fehler", label: ZAHLUNG_HINWEIS_LABELS.fehler },
];

type ZahlungEditRow = ParsedZahlungRow & {
  gewaehlterMietvertragId: string;
  periodeMonat: number;
  periodeJahr: number;
  ausgewaehlt: boolean;
};

function pruefeZahlungDuplikat(
  bestehendeZahlungen: Set<string>,
  mietvertragId: string,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!mietvertragId || !datum || betrag === null) return false;
  return bestehendeZahlungen.has(`${mietvertragId}|${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

// Prüft, ob eine Buchung bereits als Kostenposition importiert wurde — gleicher Dedup-Schlüssel
// wie kostenDedupSchluessel in actions.ts (Empfänger|Datum|Betrag|Verwendungszweck), nur mit
// umgedrehtem Vorzeichen: Kostenposition.betrag ist dort immer der negierte Rohbetrag (positiv
// bei ausgehenden Kosten, NEGATIV bei einer Gutschrift/Rücküberweisung), während Zahlungen hier
// das Vorzeichen der Rohbuchung unverändert behalten. Ein einfaches Math.abs() auf beiden Seiten
// würde für ausgehende Kosten zufällig passen, für Gutschriften aber nie matchen (-11,69 in
// Kosten vs. abs(11,69) hier) — deshalb bewusst negieren statt abs, das passt für beide Fälle.
function pruefeAlsKostenImportiert(
  bestehendeKosten: Set<string>,
  name: string,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeKosten.has(
    `${name.trim().toLowerCase()}|${datum}|${(-betrag).toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`,
  );
}

function toZahlungEditRow(
  r: ParsedZahlungRow,
  bestehendeZahlungen: Set<string>,
  bestehendeNebenkostenausgleich: Set<string>,
  skipDuplicates: boolean,
): ZahlungEditRow {
  const [jahr, monat] = r.datum ? r.datum.split("-").map(Number) : [new Date().getFullYear(), 1];
  const gewaehlterMietvertragId = r.vorgeschlagenerMietvertragId ?? "";
  const duplikat = pruefeZahlungDuplikat(
    bestehendeZahlungen,
    gewaehlterMietvertragId,
    r.datum,
    r.betrag,
    r.verwendungszweck,
  );
  // Zusätzlich zum Muster-Erkennungsflag r.nebenkostenausgleich (siehe NEBENKOSTENAUSGLEICH_PATTERN)
  // wird hier immer geprüft, ob Datum+Betrag bereits als Nebenkostenausgleich (sonstige Buchung
  // oder beglichene Position) erfasst sind — als Netz für frei formulierte Verwendungszwecke, die
  // das Muster nicht abdeckt (z.B. eine Mieter-Rückfrage zu einer Nachzahlung). Sonst würde eine
  // solche Buchung unbemerkt zusätzlich als normale Zahlung importiert, obwohl sie bereits korrekt
  // über den Nebenkostenausgleich-Import archiviert wurde.
  const bereitsAlsNebenkostenausgleich = pruefeNebenkostenausgleichDuplikat(
    bestehendeNebenkostenausgleich,
    r.datum,
    r.betrag,
  );
  const ausgewaehlt =
    r.errors.length === 0 &&
    !r.kaution &&
    !bereitsAlsNebenkostenausgleich &&
    // Ein Vorschlag für eine "ignorierte" Zeile (z.B. eine Nebenkostenrückzahlung) füllt das
    // Feld zwar vor, ist aber — anders als bei einem normalen Mieteingang — nicht über den
    // Betrag bestätigt (siehe findeMietvertrag-Aufruf in zahlungen-import.ts). Deshalb hier
    // bewusst nicht automatisch anhaken, sondern nur vorschlagen: manuell bestätigen statt
    // versehentlich in einer Sammel-Auswahl mitzuimportieren.
    !r.ignorieren &&
    Boolean(gewaehlterMietvertragId) &&
    !(skipDuplicates && duplikat);
  return { ...r, gewaehlterMietvertragId, periodeMonat: monat, periodeJahr: jahr, ausgewaehlt };
}

function matchesZahlungHinweisFilter(
  r: ZahlungEditRow,
  bereitsImportiert: boolean,
  bereitsAlsKostenImportiert: boolean,
  bereitsAlsNebenkostenausgleichImportiert: boolean,
  filter: ZahlungHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  // Der Rücklastschrift-Filter ist bewusst nicht exklusiv zur Kategorie: eine Rücklastschrift mit
  // bereits vollständigem Vorschlag zeigt "Vorschlag übernommen" als Kategorie (siehe
  // ermittleZahlungHinweis), soll aber trotzdem weiterhin auffindbar sein, wenn gezielt nach
  // Rücklastschriften gefiltert wird — anders als die generischen Tags unten, die eine Zeile aus
  // ihrer Kategorie-Ansicht herausnehmen. Dieselbe Prioritätskette wie in ermittleZahlungHinweis,
  // nur ohne den dortigen Vorrang von "vorschlag" vor "rueckbuchung".
  if (filter === "rueckbuchung") {
    if (r.errors.length > 0 || r.eigentuemerBuchung || r.kaution || r.kleinreparatur || r.ignorieren) {
      return false;
    }
    return r.rueckbuchung;
  }
  const tags: (ZahlungHinweisKategorie | ZahlungHinweisTag)[] = ermittleZahlungTags(
    bereitsImportiert,
    bereitsAlsKostenImportiert,
    bereitsAlsNebenkostenausgleichImportiert,
  );
  // Ein Tag-Filter (z.B. "bereits importiert") zeigt jede Zeile mit diesem Tag, egal welche
  // Kategorie sie sonst hat. Ein Kategorie-Filter (z.B. "Bitte prüfen") zeigt dagegen nur
  // "unbelastete" Zeilen ohne Tag — eine Zeile mit Tag ist bereits erledigt/dupliziert und
  // gehört ausschließlich in die Tag-gefilterte Ansicht, nicht zusätzlich in die Kategorie.
  if (tags.includes(filter)) return true;
  return ermittleZahlungHinweis(r) === filter && tags.length === 0;
}

function ZahlungenSektion({
  rows,
  kandidaten,
  bestehendeZahlungenListe,
  bestehendeZahlungenDatumBetragListe,
  bestehendeKostenListe,
  bestehendeNebenkostenausgleichListe,
  importBatchId,
  onCommitted,
}: {
  rows: ParsedZahlungRow[];
  kandidaten: { id: string; label: string }[];
  bestehendeZahlungenListe: string[];
  bestehendeZahlungenDatumBetragListe: string[];
  bestehendeKostenListe: string[];
  bestehendeNebenkostenausgleichListe: string[];
  importBatchId: string;
  /** Nach jedem erfolgreichen Import aufgerufen, damit alle Abschnitte ihre "bereits
   * importiert"-Listen neu laden — z.B. verschwindet eine gerade importierte Zahlung dadurch
   * sofort auch aus dem Kosten-Abschnitt, ohne die Datei erneut hochzuladen. */
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitZahlungen, null);
  const [verarbeiteteMeldung, setVerarbeiteteMeldung] = useState<string | null>(null);
  const bestehendeZahlungen = new Set(bestehendeZahlungenListe);
  const bestehendeZahlungenDatumBetrag = new Set(bestehendeZahlungenDatumBetragListe);
  const bestehendeKosten = new Set(bestehendeKostenListe);
  const bestehendeNebenkostenausgleich = new Set(bestehendeNebenkostenausgleichListe);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [editRows, setEditRows] = useState<ZahlungEditRow[]>(() =>
    rows.map((r) => toZahlungEditRow(r, bestehendeZahlungen, bestehendeNebenkostenausgleich, skipDuplicates)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<ZahlungHinweisFilter>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<ZahlungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: ZahlungEditRow): boolean {
    if (r.gewaehlterMietvertragId) {
      return pruefeZahlungDuplikat(
        bestehendeZahlungen,
        r.gewaehlterMietvertragId,
        r.datum,
        r.betrag,
        r.verwendungszweck,
      );
    }
    // Ohne gewählten Mietvertrag (z.B. eine noch nicht aufgelöste "mehrdeutig"-Zeile) lässt sich
    // der präzise, mietvertragsgebundene Schlüssel gar nicht erst bilden — als Rückfall dient
    // derselbe Datum+Betragshöhe+Verwendungszweck-Schlüssel wie beim Kosten↔Zahlungen-Hinweis.
    // Wirkt sich nur auf die Anzeige aus (Hinweis-Badge), nicht auf die Standard-Auswahl/-Abwahl
    // der Zeile.
    return pruefeAlsZahlungImportiert(bestehendeZahlungenDatumBetrag, r.datum, r.betrag, r.verwendungszweck);
  }

  function istBereitsAlsKostenImportiert(r: ZahlungEditRow): boolean {
    return pruefeAlsKostenImportiert(bestehendeKosten, r.name, r.datum, r.betrag, r.verwendungszweck);
  }

  // Bewusst unabhängig von r.nebenkostenausgleich (dem Muster-Erkennungsflag) geprüft — siehe
  // toZahlungEditRow oben für die gleiche Überlegung bei der Auto-Auswahl.
  function istBereitsAlsNebenkostenausgleichImportiert(r: ZahlungEditRow): boolean {
    return pruefeNebenkostenausgleichDuplikat(bestehendeNebenkostenausgleich, r.datum, r.betrag);
  }

  function handleSkipDuplicatesChange(checked: boolean) {
    setSkipDuplicates(checked);
    setEditRows((rs) =>
      rs.map((r) =>
        istBereitsImportiert(r) && r.errors.length === 0 && r.gewaehlterMietvertragId
          ? { ...r, ausgewaehlt: !checked }
          : r,
      ),
    );
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesZahlungHinweisFilter(
      r,
      istBereitsImportiert(r),
      istBereitsAlsKostenImportiert(r),
      istBereitsAlsNebenkostenausgleichImportiert(r),
      hinweisFilter,
    ),
  );
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.verwendungszweck || r.name;
        default:
          return null;
      }
    },
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0 && r.gewaehlterMietvertragId);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) =>
        sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 && r.gewaehlterMietvertragId
          ? { ...r, ausgewaehlt: checked }
          : r,
      ),
    );
  }

  const anzahlBereitsImportiert = editRows.filter(istBereitsImportiert).length;
  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    mietvertragId: r.gewaehlterMietvertragId,
    datum: r.datum,
    betrag: r.betrag,
    periodeMonat: r.periodeMonat,
    periodeJahr: r.periodeJahr,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  // Seiteneffekt (andere Abschnitte über die neuen "bereits importiert"-Daten informieren) —
  // deshalb im Effekt, aber ohne setState darin (siehe react-hooks/set-state-in-effect).
  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  // Die gerade importierten Zeilen in dieser Sektion selbst abwählen — dasselbe Prinzip wie
  // handleSkipDuplicatesChange oben, hier automatisch statt nur beim manuellen Umschalten. Als
  // Zustandsanpassung direkt beim Rendern statt in einem Effekt (React-empfohlenes Muster für
  // "Zustand anpassen, wenn sich ein Wert geändert hat"), mit verarbeiteteMeldung als Wächter
  // gegen eine Endlosschleife. Die Sektion bleibt danach voll bedienbar für eine weitere
  // Import-Runde, statt durch eine statische Erfolgsmeldung ersetzt zu werden.
  if (commitMessage && commitMessage !== verarbeiteteMeldung) {
    setVerarbeiteteMeldung(commitMessage);
    setEditRows((rs) =>
      rs.map((r) =>
        istBereitsImportiert(r) && r.errors.length === 0 && r.gewaehlterMietvertragId
          ? { ...r, ausgewaehlt: false }
          : r,
      ),
    );
  }

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Zahlungen ({editRows.length} eingehende Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <div className="flex items-center gap-4">
          <select
            value={hinweisFilter}
            onChange={(e) => setHinweisFilter(e.target.value as ZahlungHinweisFilter)}
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          >
            {ZAHLUNG_HINWEIS_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={skipDuplicates}
              onChange={(e) => handleSkipDuplicatesChange(e.target.checked)}
              className="h-4 w-4 rounded border-neutral-700 bg-transparent"
            />
            Bereits importierte überspringen
          </label>
        </div>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        {importierbareRows.length} werden importiert
        {anzahlBereitsImportiert > 0 &&
          ` (${anzahlBereitsImportiert} bereits vorhanden${skipDuplicates ? ", übersprungen" : ""})`}
        .{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck / Name" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Mietvertrag</th>
              <th className="px-3 py-2">Periode</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const bereitsAlsKostenImportiert = istBereitsAlsKostenImportiert(r);
              const bereitsAlsNebenkostenausgleichImportiert = istBereitsAlsNebenkostenausgleichImportiert(r);
              const kannAuswaehlen =
                r.errors.length === 0 && !r.kaution && !r.kleinreparatur && Boolean(r.gewaehlterMietvertragId);
              const expanded = expandedRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={!kannAuswaehlen}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <MietvertragAuswahl
                        kandidaten={kandidaten}
                        value={r.gewaehlterMietvertragId}
                        leerLabel="– ignorieren –"
                        onChange={(id) =>
                          updateRow(r.rowNumber, {
                            gewaehlterMietvertragId: id,
                            ausgewaehlt: Boolean(id) && r.errors.length === 0 && !r.kaution && !r.kleinreparatur,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex gap-1">
                        <select
                          value={r.periodeMonat}
                          onChange={(e) => updateRow(r.rowNumber, { periodeMonat: Number(e.target.value) })}
                          className="rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        >
                          {MONATE.map((m, idx) => (
                            <option key={m} value={idx + 1}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={r.periodeJahr}
                          onChange={(e) => updateRow(r.rowNumber, { periodeJahr: Number(e.target.value) })}
                          className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {(() => {
                        const kategorie = ermittleZahlungHinweis(r);
                        if (kategorie === "fehler") {
                          return <span className="text-red-400">{r.errors.join("; ")}</span>;
                        }
                        const tags = ermittleZahlungTags(
                          bereitsImportiert,
                          bereitsAlsKostenImportiert,
                          bereitsAlsNebenkostenausgleichImportiert,
                        );
                        const wirdUebersprungen = bereitsImportiert && !r.ausgewaehlt;
                        return (
                          <>
                            <span className={ZAHLUNG_HINWEIS_FARBEN[kategorie]}>
                              {ZAHLUNG_HINWEIS_LABELS[kategorie]}
                            </span>
                            {/* Zusatz-Hinweis, wenn die Zeile trotz Rücklastschrift als "Vorschlag
                                übernommen" kategorisiert wurde (siehe ermittleZahlungHinweis) —
                                sonst stünde "Rücklastschrift" bereits als Hauptkategorie oben. */}
                            {kategorie !== "rueckbuchung" && r.rueckbuchung && (
                              <span className={`ml-1 ${ZAHLUNG_HINWEIS_FARBEN.rueckbuchung}`}>
                                {ZAHLUNG_HINWEIS_LABELS.rueckbuchung}
                              </span>
                            )}
                            {tags.map((tag) => (
                              <span key={tag} className={`ml-1 ${ZAHLUNG_HINWEIS_FARBEN[tag]}`}>
                                {ZAHLUNG_HINWEIS_LABELS[tag]}
                                {tag === "bereits_importiert" && wirdUebersprungen ? " – wird übersprungen" : ""}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={8} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Zahlungen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Kosten ----------

// Gleiches Prinzip wie bei den Zahlungen (ermittleZahlungHinweis oben): jede Zeile bekommt
// genau eine primäre Kategorie nach Priorität, plus unabhängig davon null oder mehrere
// Zusatz-Tags (Dedup-Warnungen) — z.B. zeigt eine Gutschrift, die schon als Kostenposition
// existiert, "Gutschrift" + "Bereits importiert (als Kosten)" gleichzeitig.
type KostenHinweisKategorie =
  | "fehler"
  | "eigentuemer"
  | "kaution"
  | "eingehend"
  | "gutschrift"
  | "rueckbuchung"
  | "vorschlag"
  | "pruefen";

type KostenHinweisTag =
  | "bereits_importiert"
  | "bereits_als_zahlung_importiert"
  | "bereits_als_kaution_importiert"
  | "bereits_als_nebenkostenausgleich_importiert";

type KostenHinweisFilter = "alle" | KostenHinweisKategorie | KostenHinweisTag;

function ermittleKostenHinweis(
  r: Pick<
    ParsedKostenRow,
    | "errors"
    | "eigentuemerBuchung"
    | "kaution"
    | "ignorieren"
    | "gutschrift"
    | "rueckbuchung"
    | "vorgeschlageneKostenartId"
    | "vorgeschlageneGebaeudeAuswahl"
  >,
): KostenHinweisKategorie {
  if (r.errors.length > 0) return "fehler";
  if (r.eigentuemerBuchung) return "eigentuemer";
  if (r.kaution) return "kaution";
  // Vor dem generischen ignorieren-Fall geprüft, damit eine (ausgehende) Rücklastschrift nicht
  // fälschlich als "Eingehend, bitte prüfen" beschriftet wird — sie ist zwar ignorieren === true
  // (siehe kosten-import.ts), aber ein eigener, aussagekräftigerer Hinweis.
  if (r.rueckbuchung) return "rueckbuchung";
  if (r.ignorieren) return "eingehend";
  // Eine Gutschrift mit bereits vollständig ermittelter Kostenart+Gebäude (z.B. wiederkehrende
  // Waschgeld-Einnahmen mit eigener Kostenart) braucht keine gesonderte manuelle Prüfung mehr —
  // das negative Vorzeichen im Betrag bleibt als Hinweis sichtbar. Nur eine Gutschrift ohne
  // sicheren Vorschlag landet noch in der eigenen "Gutschrift"-Kategorie zur Kontrolle.
  if (hatVollstaendigenVorschlag(r)) return "vorschlag";
  if (r.gutschrift) return "gutschrift";
  return "pruefen";
}

function ermittleKostenTags(
  bereitsImportiert: boolean,
  bereitsAlsZahlungImportiert: boolean,
  bereitsAlsKautionImportiert: boolean,
  bereitsAlsNebenkostenausgleichImportiert: boolean,
): KostenHinweisTag[] {
  const tags: KostenHinweisTag[] = [];
  // Gilt unabhängig von der Kategorie: sowohl eine ignorierte eingehende Buchung (vermutlich
  // Miete) als auch z.B. eine Rücklastschrift, Gutschrift oder Kaution, die ebenfalls schon
  // anderswo importiert wurde.
  if (bereitsAlsZahlungImportiert) tags.push("bereits_als_zahlung_importiert");
  if (bereitsAlsKautionImportiert) tags.push("bereits_als_kaution_importiert");
  if (bereitsAlsNebenkostenausgleichImportiert) tags.push("bereits_als_nebenkostenausgleich_importiert");
  if (bereitsImportiert) tags.push("bereits_importiert");
  return tags;
}

const KOSTEN_HINWEIS_LABELS: Record<KostenHinweisKategorie | KostenHinweisTag, string> = {
  fehler: "Fehler",
  eigentuemer: "Eigentümer-Buchung",
  kaution: "Kaution",
  eingehend: "Eingehend, bitte prüfen",
  gutschrift: "Gutschrift",
  rueckbuchung: "Rücklastschrift",
  vorschlag: "Vorschlag übernommen",
  pruefen: "Bitte prüfen",
  bereits_importiert: "Bereits importiert (als Kosten)",
  bereits_als_zahlung_importiert: "Bereits importiert (als Zahlung)",
  bereits_als_kaution_importiert: "Bereits importiert (als Kaution)",
  bereits_als_nebenkostenausgleich_importiert: "Bereits importiert (als Nebenkostenabrechnung)",
};

const KOSTEN_HINWEIS_FARBEN: Record<KostenHinweisKategorie | KostenHinweisTag, string> = {
  fehler: "text-red-400",
  eigentuemer: "text-neutral-500",
  kaution: "text-blue-400",
  eingehend: "text-neutral-500",
  gutschrift: "text-blue-400",
  rueckbuchung: "text-red-400",
  vorschlag: "text-green-400",
  pruefen: "text-amber-400",
  bereits_importiert: "text-amber-400",
  bereits_als_zahlung_importiert: "text-green-400",
  bereits_als_kaution_importiert: "text-green-400",
  bereits_als_nebenkostenausgleich_importiert: "text-green-400",
};

const KOSTEN_HINWEIS_OPTIONEN: { value: KostenHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: KOSTEN_HINWEIS_LABELS.vorschlag },
  { value: "pruefen", label: KOSTEN_HINWEIS_LABELS.pruefen },
  { value: "gutschrift", label: KOSTEN_HINWEIS_LABELS.gutschrift },
  { value: "rueckbuchung", label: KOSTEN_HINWEIS_LABELS.rueckbuchung },
  { value: "eingehend", label: KOSTEN_HINWEIS_LABELS.eingehend },
  { value: "bereits_als_zahlung_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_als_zahlung_importiert },
  { value: "bereits_als_kaution_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_als_kaution_importiert },
  {
    value: "bereits_als_nebenkostenausgleich_importiert",
    label: KOSTEN_HINWEIS_LABELS.bereits_als_nebenkostenausgleich_importiert,
  },
  { value: "bereits_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_importiert },
  { value: "eigentuemer", label: KOSTEN_HINWEIS_LABELS.eigentuemer },
  { value: "kaution", label: KOSTEN_HINWEIS_LABELS.kaution },
  { value: "fehler", label: KOSTEN_HINWEIS_LABELS.fehler },
];

type KostenEditRow = ParsedKostenRow & {
  gewaehlteKostenartId: string;
  gewaehltesGebaeudeId: string;
  jahrEingabe: number;
  ausgewaehlt: boolean;
};

// Ein Vorschlag gilt als vollständig, sobald eine Kostenart feststeht und die Gebäude-Frage
// sicher beantwortet ist — auch wenn die Antwort "kein Gebäude" lautet (z.B. objektweite
// Bankgebühren oder Hausmeisterkosten). Nur eine nicht ermittelbare Gebäudezuordnung
// (vorgeschlageneGebaeudeAuswahl === undefined) macht den Vorschlag unvollständig.
function hatVollstaendigenVorschlag(
  r: Pick<ParsedKostenRow, "vorgeschlageneKostenartId" | "vorgeschlageneGebaeudeAuswahl">,
): boolean {
  return Boolean(r.vorgeschlageneKostenartId) && r.vorgeschlageneGebaeudeAuswahl !== undefined;
}

// Verwendungszweck gehört mit in den Schlüssel (gleicher Grund wie kostenDedupSchluessel in
// actions.ts): derselbe Absender kann am selben Tag mehrere unterschiedliche Kostenpositionen
// mit zufällig demselben Betrag buchen (z.B. zwei Niederschlagswasser-Abrechnungen für
// unterschiedliche Gebäude-Kundennummern, die rein zufällig auf denselben Centbetrag kommen).
function pruefeKostenDuplikat(
  bestehend: Set<string>,
  empfaenger: string,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
) {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${empfaenger.trim().toLowerCase()}|${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

// Prüft, ob eine Buchung bereits als Zahlung importiert wurde — verwendet an zwei Stellen: bei
// einer eingehenden, ignorierten Kosten-Zeile (Zahlung hat anders als Kostenposition.empfaenger
// keine eigene Empfänger-Spalte) und als Rückfall in der Zahlungen-Sektion selbst für Zeilen
// ohne gewählten Mietvertrag (z.B. "mehrdeutig"), wo der präzise mietvertragsgebundene Schlüssel
// nicht bildbar ist. Verwendungszweck ist Pflicht im Schlüssel, nicht nur Datum+Betrag — sonst
// meldet z.B. eine noch gar nicht importierte "mehrdeutig"-Zahlung sich fälschlich als "bereits
// importiert", nur weil zufällig ein ANDERER Mietvertrag am selben Tag denselben (Kaltmiete-)
// Betrag gezahlt hat. Betragshöhe ohne Vorzeichen, siehe Kommentar zu
// bestehendeZahlungenDatumBetrag in actions.ts.
function pruefeAlsZahlungImportiert(
  bestehendeZahlungen: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeZahlungen.has(`${datum}|${Math.abs(betrag).toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

// Gleicher Schlüssel wie datumBetragZweckSchluessel in actions.ts (Datum|Betrag|Verwendungszweck,
// ohne Empfänger). Vorzeichen umgedreht statt Betrag genommen — Kostenposition.betrag ist hier
// der negierte Rohbetrag (siehe pruefeAlsKostenImportiert oben), KautionBuchung.betrag behält
// dagegen das Rohvorzeichen der Buchung unverändert.
function pruefeAlsKautionImportiert(
  bestehendeKautionsbuchungen: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeKautionsbuchungen.has(`${datum}|${(-betrag).toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

function toKostenEditRow(
  r: ParsedKostenRow,
  bestehendeKosten: Set<string>,
  bestehendeNebenkostenausgleich: Set<string>,
): KostenEditRow {
  const duplikat = pruefeKostenDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag, r.verwendungszweck);
  // Siehe toZahlungEditRow in der Zahlungen-Sektion für dieselbe Überlegung: bewusst unabhängig
  // vom Muster-Erkennungsflag r.nebenkostenausgleich geprüft, als Netz für frei formulierte
  // Verwendungszwecke, die das Muster nicht abdeckt.
  const bereitsAlsNebenkostenausgleich = pruefeNebenkostenausgleichDuplikat(
    bestehendeNebenkostenausgleich,
    r.datum,
    r.betrag,
  );
  return {
    ...r,
    gewaehlteKostenartId: r.vorgeschlageneKostenartId ?? "",
    gewaehltesGebaeudeId: r.vorgeschlageneGebaeudeAuswahl ?? "",
    jahrEingabe: r.jahr ?? new Date().getFullYear(),
    ausgewaehlt:
      r.errors.length === 0 &&
      !r.ignorieren &&
      hatVollstaendigenVorschlag(r) &&
      !duplikat &&
      !bereitsAlsNebenkostenausgleich,
  };
}

function matchesKostenHinweisFilter(
  r: KostenEditRow,
  bereitsImportiert: boolean,
  bereitsAlsZahlungImportiert: boolean,
  bereitsAlsKautionImportiert: boolean,
  bereitsAlsNebenkostenausgleichImportiert: boolean,
  filter: KostenHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  // Der Gutschrift-Filter ist bewusst nicht exklusiv zur Kategorie: eine Gutschrift mit bereits
  // vollständigem Vorschlag zeigt "Vorschlag übernommen" als Kategorie (siehe
  // ermittleKostenHinweis), soll aber trotzdem weiterhin auffindbar sein, wenn gezielt nach
  // Gutschriften gefiltert wird — anders als die generischen Tags unten, die eine Zeile aus ihrer
  // Kategorie-Ansicht herausnehmen. Dieselbe Prioritätskette wie in ermittleKostenHinweis, nur
  // ohne den dortigen Vorrang von "vorschlag" vor "gutschrift".
  if (filter === "gutschrift") {
    if (r.errors.length > 0 || r.eigentuemerBuchung || r.kaution || r.rueckbuchung || r.ignorieren) {
      return false;
    }
    return r.gutschrift;
  }
  const tags: (KostenHinweisKategorie | KostenHinweisTag)[] = ermittleKostenTags(
    bereitsImportiert,
    bereitsAlsZahlungImportiert,
    bereitsAlsKautionImportiert,
    bereitsAlsNebenkostenausgleichImportiert,
  );
  // Gleiches Prinzip wie bei den Zahlungen: ein Tag-Filter zeigt jede Zeile mit diesem Tag,
  // ein Kategorie-Filter dagegen nur "unbelastete" Zeilen ohne Tag.
  if (tags.includes(filter)) return true;
  return ermittleKostenHinweis(r) === filter && tags.length === 0;
}

function KostenSektion({
  rows,
  kostenarten,
  gebaeude,
  einheiten,
  bestehendeKostenListe,
  bestehendeZahlungenListe,
  bestehendeKautionListe,
  bestehendeNebenkostenausgleichListe,
  importBatchId,
  onCommitted,
}: {
  rows: ParsedKostenRow[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  gebaeude: {
    id: string;
    label: string;
    strasse: string;
    hausnummer: string;
    haus: { id: string } | null;
    kostengruppen: { id: string; bezeichnung: string }[];
  }[];
  einheiten: EinheitMitAdresse[];
  bestehendeKostenListe: string[];
  bestehendeZahlungenListe: string[];
  bestehendeKautionListe: string[];
  bestehendeNebenkostenausgleichListe: string[];
  importBatchId: string;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitKosten, null);
  const [verarbeiteteMeldung, setVerarbeiteteMeldung] = useState<string | null>(null);
  const bestehendeKosten = new Set(bestehendeKostenListe);
  const bestehendeZahlungen = new Set(bestehendeZahlungenListe);
  const bestehendeKaution = new Set(bestehendeKautionListe);
  const bestehendeNebenkostenausgleich = new Set(bestehendeNebenkostenausgleichListe);
  const [editRows, setEditRows] = useState<KostenEditRow[]>(() =>
    rows.map((r) => toKostenEditRow(r, bestehendeKosten, bestehendeNebenkostenausgleich)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<KostenHinweisFilter>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.name);
  const gebaeudeGruppen = gruppiereGebaeude(gebaeude, einheiten);

  function updateRow(rowNumber: number, patch: Partial<KostenEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: KostenEditRow): boolean {
    return pruefeKostenDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag, r.verwendungszweck);
  }

  function istBereitsAlsZahlungImportiert(r: KostenEditRow): boolean {
    return pruefeAlsZahlungImportiert(bestehendeZahlungen, r.datum, r.betrag, r.verwendungszweck);
  }

  function istBereitsAlsKautionImportiert(r: KostenEditRow): boolean {
    return pruefeAlsKautionImportiert(bestehendeKaution, r.datum, r.betrag, r.verwendungszweck);
  }

  // Bewusst unabhängig von r.nebenkostenausgleich (dem Muster-Erkennungsflag) geprüft — siehe
  // toKostenEditRow oben für dieselbe Überlegung bei der Auto-Auswahl.
  function istBereitsAlsNebenkostenausgleichImportiert(r: KostenEditRow): boolean {
    return pruefeNebenkostenausgleichDuplikat(bestehendeNebenkostenausgleich, r.datum, r.betrag);
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesKostenHinweisFilter(
      r,
      istBereitsImportiert(r),
      istBereitsAlsZahlungImportiert(r),
      istBereitsAlsKautionImportiert(r),
      istBereitsAlsNebenkostenausgleichImportiert(r),
      hinweisFilter,
    ),
  );
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.empfaenger || r.verwendungszweck;
        case "jahr":
          return r.jahr;
        default:
          return null;
      }
    },
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0 && r.gewaehlteKostenartId);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) =>
        sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 && r.gewaehlteKostenartId
          ? { ...r, ausgewaehlt: checked }
          : r,
      ),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt && r.gewaehlteKostenartId);
  const rowsForCommit = importierbareRows.map((r) => ({
    kostenartId: r.gewaehlteKostenartId,
    gebaeudeAuswahl: r.gewaehltesGebaeudeId,
    jahr: r.jahrEingabe,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.empfaenger,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  if (commitMessage && commitMessage !== verarbeiteteMeldung) {
    setVerarbeiteteMeldung(commitMessage);
    setEditRows((rs) =>
      rs.map((r) =>
        istBereitsImportiert(r) && r.errors.length === 0 && r.gewaehlteKostenartId
          ? { ...r, ausgewaehlt: false }
          : r,
      ),
    );
  }

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Kosten ({editRows.length} ausgehende Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <select
          value={hinweisFilter}
          onChange={(e) => setHinweisFilter(e.target.value as KostenHinweisFilter)}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {KOSTEN_HINWEIS_OPTIONEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Empfänger / Verwendungszweck" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Kostenart</th>
              <th className="min-w-[140px] px-3 py-2">Gebäude</th>
              <SortableTh label="Jahr" spalteKey="jahr" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const bereitsAlsZahlungImportiert = istBereitsAlsZahlungImportiert(r);
              const bereitsAlsKautionImportiert = istBereitsAlsKautionImportiert(r);
              const bereitsAlsNebenkostenausgleichImportiert = istBereitsAlsNebenkostenausgleichImportiert(r);
              const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlteKostenartId);
              const expanded = expandedRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={!kannAuswaehlen}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.empfaenger} ${r.verwendungszweck}`}
                    >
                      {r.empfaenger || r.verwendungszweck || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.gewaehlteKostenartId}
                        // Eigentümer-Buchungen und Kautionen werden ausschließlich in ihren
                        // eigenen Sektionen erfasst, deshalb hier gesperrt. Eine unbekannte
                        // eingehende Buchung ("Eingehend, bitte prüfen") bleibt dagegen bewusst
                        // wählbar — genau dafür ist diese Kategorie da, z.B. eine
                        // Doppelüberweisungs-Rückerstattung von einem bisher unbekannten
                        // Absender, die es sonst nie zu einer Kostenposition schaffen könnte.
                        disabled={r.eigentuemerBuchung || r.kaution || r.errors.length > 0}
                        onChange={(e) =>
                          updateRow(r.rowNumber, {
                            gewaehlteKostenartId: e.target.value,
                            ausgewaehlt: Boolean(e.target.value),
                          })
                        }
                        className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                      >
                        <option value="">– bitte wählen –</option>
                        {kostenartGruppen.map((gruppe) =>
                          gruppe.label ? (
                            <optgroup key={gruppe.label} label={gruppe.label}>
                              {gruppe.items.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                  {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ) : (
                            gruppe.items.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name}
                                {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                              </option>
                            ))
                          ),
                        )}
                      </select>
                    </td>
                    <td className="min-w-[140px] px-3 py-1.5">
                      <select
                        value={r.gewaehltesGebaeudeId}
                        disabled={r.eigentuemerBuchung || r.kaution || r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { gewaehltesGebaeudeId: e.target.value })}
                        className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                      >
                        <option value="">– Objekt gesamt –</option>
                        {gebaeudeGruppen.map((gruppe) => (
                          <optgroup key={gruppe.label} label={gruppe.label}>
                            {gruppe.optionen.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        value={r.jahrEingabe}
                        disabled={r.eigentuemerBuchung || r.kaution || r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { jahrEingabe: Number(e.target.value) })}
                        className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {(() => {
                        const kategorie = ermittleKostenHinweis(r);
                        if (kategorie === "fehler") {
                          return <span className="text-red-400">{r.errors.join("; ")}</span>;
                        }
                        const tags = ermittleKostenTags(
                          bereitsImportiert,
                          bereitsAlsZahlungImportiert,
                          bereitsAlsKautionImportiert,
                          bereitsAlsNebenkostenausgleichImportiert,
                        );
                        return (
                          <>
                            <span className={KOSTEN_HINWEIS_FARBEN[kategorie]}>
                              {KOSTEN_HINWEIS_LABELS[kategorie]}
                            </span>
                            {/* Zusatz-Hinweis, wenn die Zeile trotz Gutschrift als "Vorschlag
                                übernommen" kategorisiert wurde (siehe ermittleKostenHinweis) —
                                sonst stünde "Gutschrift" bereits als Hauptkategorie oben. */}
                            {kategorie !== "gutschrift" && r.gutschrift && (
                              <span className={`ml-1 ${KOSTEN_HINWEIS_FARBEN.gutschrift}`}>
                                {KOSTEN_HINWEIS_LABELS.gutschrift}
                              </span>
                            )}
                            {tags.map((tag) => (
                              <span key={tag} className={`ml-1 ${KOSTEN_HINWEIS_FARBEN[tag]}`}>
                                {KOSTEN_HINWEIS_LABELS[tag]}
                              </span>
                            ))}
                          </>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={9} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Kostenpositionen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Mietweiterleitungen ----------

type MietweiterleitungEditRow = ParsedZahlungRow & { ausgewaehlt: boolean };

// Gleiches Prinzip wie ZahlungHinweisKategorie oben, nur mit zwei Werten: die automatische
// Erkennung (istEigentuemerBuchung) ist nicht immer richtig — z.B. eine Kautionsauszahlung ohne
// das Wort "Kaution" im Verwendungszweck, die stattdessen (weil sie über das auf die
// Eigentümerin laufende Kautionskonto lief) fälschlich hier landet. Der Filter erlaubt es, auf
// "weitere Buchung" umzuschalten und die eigentlich richtige Zeile manuell anzuhaken, statt dass
// sie für diese Sektion unsichtbar bleibt.
type MietweiterleitungHinweisKategorie = "erkannt" | "weitere";
type MietweiterleitungHinweisFilter = "alle" | MietweiterleitungHinweisKategorie;

function ermittleMietweiterleitungHinweis(
  r: Pick<ParsedZahlungRow, "eigentuemerBuchung">,
): MietweiterleitungHinweisKategorie {
  return r.eigentuemerBuchung ? "erkannt" : "weitere";
}

const MIETWEITERLEITUNG_HINWEIS_LABELS: Record<MietweiterleitungHinweisKategorie, string> = {
  erkannt: "Als Mietweiterleitung erkannt",
  weitere: "Weitere Buchung",
};

const MIETWEITERLEITUNG_HINWEIS_FARBEN: Record<MietweiterleitungHinweisKategorie, string> = {
  erkannt: "text-green-400",
  weitere: "text-neutral-500",
};

const MIETWEITERLEITUNG_HINWEIS_OPTIONEN: { value: MietweiterleitungHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "erkannt", label: MIETWEITERLEITUNG_HINWEIS_LABELS.erkannt },
  { value: "weitere", label: MIETWEITERLEITUNG_HINWEIS_LABELS.weitere },
];

function matchesMietweiterleitungHinweisFilter(
  r: Pick<ParsedZahlungRow, "eigentuemerBuchung">,
  filter: MietweiterleitungHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  return ermittleMietweiterleitungHinweis(r) === filter;
}

// Kein Empfänger im Schlüssel — die Gegenpartei ist bei jeder Zeile dieselbe Eigentümerin,
// Datum+Betrag+Verwendungszweck reichen zur Unterscheidung (gleicher Schlüssel wie
// mietweiterleitungDedupSchluessel in actions.ts).
function pruefeMietweiterleitungDuplikat(
  bestehend: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

function toMietweiterleitungEditRow(r: ParsedZahlungRow, bestehend: Set<string>): MietweiterleitungEditRow {
  const duplikat = pruefeMietweiterleitungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  // Nur automatisch erkannte Buchungen sind initial angehakt — "weitere Buchung"-Zeilen (der
  // ganz überwiegende Rest, z.B. normale Mieten) sollen nicht versehentlich mitimportiert
  // werden, nur weil sie über den Filter sichtbar gemacht wurden.
  return { ...r, ausgewaehlt: r.errors.length === 0 && r.eigentuemerBuchung && !duplikat };
}

function MietweiterleitungenSektion({
  rows,
  bestehendeListe,
  importBatchId,
  onCommitted,
}: {
  rows: ParsedZahlungRow[];
  bestehendeListe: string[];
  importBatchId: string;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitMietweiterleitungen, null);
  const [verarbeiteteMeldung, setVerarbeiteteMeldung] = useState<string | null>(null);
  const bestehend = new Set(bestehendeListe);
  const [editRows, setEditRows] = useState<MietweiterleitungEditRow[]>(() =>
    rows.map((r) => toMietweiterleitungEditRow(r, bestehend)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<MietweiterleitungHinweisFilter>("erkannt");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<MietweiterleitungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: MietweiterleitungEditRow): boolean {
    return pruefeMietweiterleitungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  }

  const gefilterteRows = editRows.filter((r) => matchesMietweiterleitungHinweisFilter(r, hinweisFilter));
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.verwendungszweck || r.name;
        default:
          return null;
      }
    },
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) => (sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 ? { ...r, ausgewaehlt: checked } : r)),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.name,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  if (commitMessage && commitMessage !== verarbeiteteMeldung) {
    setVerarbeiteteMeldung(commitMessage);
    setEditRows((rs) =>
      rs.map((r) => (istBereitsImportiert(r) && r.errors.length === 0 ? { ...r, ausgewaehlt: false } : r)),
    );
  }

  if (editRows.length === 0) return null;

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Mietweiterleitungen ({editRows.length} Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <select
          value={hinweisFilter}
          onChange={(e) => setHinweisFilter(e.target.value as MietweiterleitungHinweisFilter)}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {MIETWEITERLEITUNG_HINWEIS_OPTIONEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        Geldbewegungen zwischen Konto und Eigentümerin — keine Miete, keine Kosten.{" "}
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const expanded = expandedRow === r.rowNumber;
              const kategorie = ermittleMietweiterleitungHinweis(r);
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[280px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : (
                        <span className={MIETWEITERLEITUNG_HINWEIS_FARBEN[kategorie]}>
                          {MIETWEITERLEITUNG_HINWEIS_LABELS[kategorie]}
                        </span>
                      )}
                      {r.errors.length === 0 && bereitsImportiert && (
                        <span className="ml-1 text-amber-400">bereits importiert</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={6} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Mietweiterleitungen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Kaution ----------

type KautionKategorie = "EINZAHLUNG_MIETER" | "ANLAGE" | "AUFLOESUNG" | "AUSZAHLUNG_MIETER" | "SONSTIGES";

type KautionEditRow = ParsedZahlungRow & {
  gewaehlterMietvertragId: string;
  ausgewaehlt: boolean;
  kategorie: KautionKategorie;
};

const KAUTION_KATEGORIE_LABEL: Record<KautionKategorie, string> = {
  EINZAHLUNG_MIETER: "Einzahlung Mieter",
  ANLAGE: "Anlage (aufs Kautionskonto)",
  AUFLOESUNG: "Auflösung (vom Kautionskonto)",
  AUSZAHLUNG_MIETER: "Auszahlung Mieter",
  SONSTIGES: "Sonstiges (z.B. Korrektur)",
};

// Gleiches Prinzip wie bei Mietweiterleitungen oben (siehe MietweiterleitungHinweisKategorie),
// mit derselben Aufspaltung von "erkannt" nach Dedup-Status wie beim Nebenkostenausgleich (siehe
// NebenkostenausgleichHinweisFilter) — sonst ließe sich "bitte prüfen" nicht getrennt von bereits
// erledigten Zeilen filtern.
type KautionHinweisKategorie = "erkannt" | "weitere";
type KautionHinweisFilter = "alle" | "erkannt_pruefen" | "erkannt_importiert" | "weitere";

function ermittleKautionHinweis(r: Pick<ParsedZahlungRow, "kaution">): KautionHinweisKategorie {
  return r.kaution ? "erkannt" : "weitere";
}

const KAUTION_LABEL_PRUEFEN = "Als Kaution erkannt, bitte prüfen";
const KAUTION_LABEL_IMPORTIERT = "Als Kaution erkannt, bereits importiert";
const KAUTION_LABEL_WEITERE = "Weitere Buchung";

const KAUTION_HINWEIS_OPTIONEN: { value: KautionHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "erkannt_pruefen", label: KAUTION_LABEL_PRUEFEN },
  { value: "erkannt_importiert", label: KAUTION_LABEL_IMPORTIERT },
  { value: "weitere", label: KAUTION_LABEL_WEITERE },
];

function matchesKautionHinweisFilter(
  r: Pick<ParsedZahlungRow, "kaution">,
  duplikat: boolean,
  filter: KautionHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  const kategorie = ermittleKautionHinweis(r);
  if (filter === "weitere") return kategorie === "weitere";
  if (filter === "erkannt_pruefen") return kategorie === "erkannt" && !duplikat;
  return kategorie === "erkannt" && duplikat;
}

// Gleicher Schlüssel wie datumBetragZweckSchluessel in actions.ts — kein Empfänger, da der
// Verwendungszweck (der i.d.R. den Mieternamen enthält) präziser ist als der oft nur
// "Eigentümerin/Kautionskonto"-lautende Empfänger.
function pruefeKautionsbuchungDuplikat(
  bestehend: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

function toKautionEditRow(r: ParsedZahlungRow, bestehend: Set<string>): KautionEditRow {
  const duplikat = pruefeKautionsbuchungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  return {
    ...r,
    gewaehlterMietvertragId: r.vorgeschlagenerMietvertragId ?? "",
    // Nur automatisch erkannte Kautionsbuchungen sind initial angehakt — siehe
    // toMietweiterleitungEditRow oben für dieselbe Überlegung.
    ausgewaehlt: r.errors.length === 0 && r.kaution && !duplikat,
    kategorie: r.kautionKategorieVorschlag ?? "EINZAHLUNG_MIETER",
  };
}

function KautionSektion({
  rows,
  kandidaten,
  bestehendeListe,
  importBatchId,
  onCommitted,
}: {
  rows: ParsedZahlungRow[];
  kandidaten: { id: string; label: string }[];
  bestehendeListe: string[];
  importBatchId: string;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitKautionsbuchungen, null);
  const [verarbeiteteMeldung, setVerarbeiteteMeldung] = useState<string | null>(null);
  const bestehend = new Set(bestehendeListe);
  const [editRows, setEditRows] = useState<KautionEditRow[]>(() =>
    rows.map((r) => toKautionEditRow(r, bestehend)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<KautionHinweisFilter>("erkannt_pruefen");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<KautionEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: KautionEditRow): boolean {
    return pruefeKautionsbuchungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  }

  const gefilterteRows = editRows.filter((r) => matchesKautionHinweisFilter(r, istBereitsImportiert(r), hinweisFilter));
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.verwendungszweck || r.name;
        default:
          return null;
      }
    },
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) => (sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 ? { ...r, ausgewaehlt: checked } : r)),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    mietvertragId: r.gewaehlterMietvertragId,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.name,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
    kategorie: r.kategorie,
  }));

  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  if (commitMessage && commitMessage !== verarbeiteteMeldung) {
    setVerarbeiteteMeldung(commitMessage);
    setEditRows((rs) =>
      rs.map((r) => (istBereitsImportiert(r) && r.errors.length === 0 ? { ...r, ausgewaehlt: false } : r)),
    );
  }

  if (editRows.length === 0) return null;

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Kaution ({editRows.length} Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <select
          value={hinweisFilter}
          onChange={(e) => setHinweisFilter(e.target.value as KautionHinweisFilter)}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {KAUTION_HINWEIS_OPTIONEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        Kautionszahlungen/-rückzahlungen — keine Miete, keine Mietweiterleitung.{" "}
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Mietvertrag</th>
              <th className="px-3 py-2">Kategorie</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const expanded = expandedRow === r.rowNumber;
              const kategorie = ermittleKautionHinweis(r);
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <MietvertragAuswahl
                        kandidaten={kandidaten}
                        value={r.gewaehlterMietvertragId}
                        leerLabel="– keinem Mietvertrag zuordnen –"
                        onChange={(id) => updateRow(r.rowNumber, { gewaehlterMietvertragId: id })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      {r.kaution ? (
                        <select
                          value={r.kategorie}
                          onChange={(e) =>
                            updateRow(r.rowNumber, { kategorie: e.target.value as KautionKategorie })
                          }
                          className="rounded-md border border-neutral-700 bg-transparent px-1.5 py-1 text-xs text-white outline-none focus:border-neutral-400"
                        >
                          {(
                            ["EINZAHLUNG_MIETER", "ANLAGE", "AUFLOESUNG", "AUSZAHLUNG_MIETER", "SONSTIGES"] as const
                          ).map((k) => (
                            <option key={k} value={k} className="bg-neutral-900">
                              {KAUTION_KATEGORIE_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-neutral-600">–</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : kategorie === "erkannt" ? (
                        <span className={bereitsImportiert ? "text-green-400" : "text-amber-400"}>
                          {bereitsImportiert ? KAUTION_LABEL_IMPORTIERT : KAUTION_LABEL_PRUEFEN}
                        </span>
                      ) : (
                        <span className="text-neutral-500">{KAUTION_LABEL_WEITERE}</span>
                      )}
                      {r.errors.length === 0 && r.mehrdeutig && (
                        <span className="ml-1 text-amber-400">mehrdeutig, bitte prüfen</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={8} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Kautionsbuchungen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Nebenkostenabrechnung-Ausgleich ----------

// Muss mit NEBENKOSTENAUSGLEICH_SONSTIGE_SENTINEL in actions.ts übereinstimmen (kann nicht von
// dort importiert werden, da eine "use server"-Datei nur async-Funktionen exportieren darf).
const SONSTIGE_SENTINEL = "__sonstige__";

type NebenkostenPositionKandidat = { id: string; label: string; mietvertragId: string | null };

type NebenkostenausgleichEditRow = ParsedZahlungRow & {
  gewaehltePositionId: string;
  ausgewaehlt: boolean;
  // Nur relevant, wenn gewaehltePositionId === SONSTIGE_SENTINEL — Mietvertrag-Bestätigung/
  // -Korrektur sowie optionales Abrechnungsjahr für die spätere automatische Verknüpfung.
  sonstigeMietvertragId: string;
  sonstigeJahr: string;
};

// Sucht eine vierstellige Jahreszahl im Buchungstext (z.B. "BK-Abr. 2024", "Betriebskostenabrechnung
// 2023") als Vorschlag fürs Abrechnungsjahr — findet sich keine, wird das Vorjahr des
// Buchungsdatums vorgeschlagen (eine Nebenkostenabrechnung wird typischerweise fürs Vorjahr
// beglichen). Rein ein Vorschlag, im Feld frei änderbar/löschbar.
function ermittleJahrVorschlag(verwendungszweck: string, buchungsdatum: string | null): string {
  const treffer = /\b(19|20)\d{2}\b/.exec(verwendungszweck);
  if (treffer) return treffer[0];
  if (!buchungsdatum) return "";
  const buchungsjahr = Number(buchungsdatum.slice(0, 4));
  return Number.isFinite(buchungsjahr) ? String(buchungsjahr - 1) : "";
}

// Gleiches Prinzip wie bei Kaution/Mietweiterleitungen oben, mit einer Ausnahme: "erkannt" wird
// für den Filter zusätzlich nach Dedup-Status aufgespalten (siehe pruefeNebenkostenausgleichDuplikat
// unten) — sonst ließe sich "bitte prüfen" nicht getrennt von bereits erledigten Zeilen filtern.
type NebenkostenausgleichHinweisKategorie = "erkannt" | "weitere";
type NebenkostenausgleichHinweisFilter = "alle" | "erkannt_pruefen" | "erkannt_importiert" | "weitere";

function ermittleNebenkostenausgleichHinweis(
  r: Pick<ParsedZahlungRow, "nebenkostenausgleich">,
): NebenkostenausgleichHinweisKategorie {
  return r.nebenkostenausgleich ? "erkannt" : "weitere";
}

const NEBENKOSTENAUSGLEICH_LABEL_PRUEFEN = "Als Nebenkostenausgleich erkannt, bitte prüfen";
const NEBENKOSTENAUSGLEICH_LABEL_IMPORTIERT = "Als Nebenkostenausgleich erkannt, bereits importiert";
const NEBENKOSTENAUSGLEICH_LABEL_WEITERE = "Weitere Buchung";

const NEBENKOSTENAUSGLEICH_HINWEIS_OPTIONEN: { value: NebenkostenausgleichHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "erkannt_pruefen", label: NEBENKOSTENAUSGLEICH_LABEL_PRUEFEN },
  { value: "erkannt_importiert", label: NEBENKOSTENAUSGLEICH_LABEL_IMPORTIERT },
  { value: "weitere", label: NEBENKOSTENAUSGLEICH_LABEL_WEITERE },
];

function matchesNebenkostenausgleichHinweisFilter(
  r: Pick<ParsedZahlungRow, "nebenkostenausgleich">,
  duplikat: boolean,
  filter: NebenkostenausgleichHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  const kategorie = ermittleNebenkostenausgleichHinweis(r);
  if (filter === "weitere") return kategorie === "weitere";
  if (filter === "erkannt_pruefen") return kategorie === "erkannt" && !duplikat;
  return kategorie === "erkannt" && duplikat;
}

function pruefeNebenkostenausgleichDuplikat(
  bestehend: Set<string>,
  datum: string | null,
  betrag: number | null,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehend.has(datumBetragSchluessel(new Date(datum), betrag));
}

// Auto-Vorauswahl nur für tatsächlich als Nebenkostenausgleich erkannte Zeilen (sonst würde z.B.
// eine ganz normale Mietzahlung, deren Mietvertrag zufällig genau eine offene Position hat — bei
// nur einer Abrechnung im System praktisch IMMER der Fall — automatisch eine Position
// vorbelegt bekommen und wäre damit über "Alle auswählen" oder einen Filterwechsel versehentlich
// mit importierbar; das ist real passiert, siehe Commit-Historie), und nur, wenn der bereits
// vorgeschlagene Mietvertrag (aus dem Namensabgleich) genau eine offene Position hat — bei
// mehreren offenen Jahren/Mehrdeutigkeit lieber manuell wählen lassen statt zu raten. Kein
// Betrags-Abgleich nötig: anders als bei Kaution/Miete ist hier die Mietvertrags-Zuordnung selbst
// schon das eigentliche Unsicherheitsmoment, nicht der Betrag (der ohnehin nicht exakt zum saldo
// passen muss, z.B. bei Rundung).
function ermittleVorgeschlagenePosition(
  r: Pick<ParsedZahlungRow, "vorgeschlagenerMietvertragId" | "nebenkostenausgleich">,
  positionen: NebenkostenPositionKandidat[],
): string {
  if (!r.nebenkostenausgleich) return "";
  const treffer = r.vorgeschlagenerMietvertragId
    ? positionen.filter((p) => p.mietvertragId === r.vorgeschlagenerMietvertragId)
    : [];
  if (treffer.length === 1) return treffer[0].id;
  // Mehrdeutig (mehrere offene Positionen für denselben Mietvertrag) — lieber manuell im
  // Auswahlfeld wählen lassen statt zu raten, welche gemeint ist.
  if (treffer.length > 1) return "";
  // Keine passende offene Position gefunden (z.B. weil für dieses Jahr noch keine Abrechnung
  // existiert) — Vorauswahl fällt auf "archivieren", damit das Mietvertrag-/Jahr-Feld für die
  // spätere automatische Verknüpfung direkt sichtbar und ausfüllbar ist, statt dass man erst im
  // Auswahlfeld den Sonderfall "Keine offene Position" entdecken muss.
  return SONSTIGE_SENTINEL;
}

function toNebenkostenausgleichEditRow(
  r: ParsedZahlungRow,
  positionen: NebenkostenPositionKandidat[],
  bestehend: Set<string>,
): NebenkostenausgleichEditRow {
  const gewaehltePositionId = ermittleVorgeschlagenePosition(r, positionen);
  const duplikat = pruefeNebenkostenausgleichDuplikat(bestehend, r.datum, r.betrag);
  return {
    ...r,
    gewaehltePositionId,
    // Ein erkanntes Duplikat wird nicht automatisch angehakt — siehe toKautionEditRow oben für
    // dieselbe Überlegung.
    ausgewaehlt: r.errors.length === 0 && Boolean(gewaehltePositionId) && !duplikat,
    sonstigeMietvertragId: r.vorgeschlagenerMietvertragId ?? "",
    sonstigeJahr: r.nebenkostenausgleich ? ermittleJahrVorschlag(r.verwendungszweck, r.datum) : "",
  };
}

function NebenkostenausgleichSektion({
  rows,
  positionen,
  kandidaten,
  bestehendeListe,
  importBatchId,
  onCommitted,
}: {
  rows: ParsedZahlungRow[];
  positionen: NebenkostenPositionKandidat[];
  /** Alle Mietverträge, für die im Feld "Mietvertrag" unter "Keine offene Position" gesucht
   * werden kann — Bestätigung/Korrektur des automatisch vorgeschlagenen Mietvertrags. */
  kandidaten: { id: string; label: string }[];
  bestehendeListe: string[];
  importBatchId: string;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitNebenkostenausgleich, null);
  const [verarbeiteteMeldung, setVerarbeiteteMeldung] = useState<string | null>(null);
  const bestehend = new Set(bestehendeListe);
  const [editRows, setEditRows] = useState<NebenkostenausgleichEditRow[]>(() =>
    rows.map((r) => toNebenkostenausgleichEditRow(r, positionen, bestehend)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<NebenkostenausgleichHinweisFilter>("erkannt_pruefen");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  // Zusätzlich zu den echten offenen Positionen immer wählbar: für eine Buchung, zu der es (z.B.
  // weil das Abrechnungsjahr nie in dieser App abgerechnet wurde) noch keine passende Position
  // gibt — landet als NebenkostenausgleichZahlung, siehe commitNebenkostenausgleich. Mit
  // angegebenem Jahr wird sie automatisch mit der passenden Position verknüpft, sobald eine
  // Abrechnung für dieses Jahr existiert oder erstellt wird; ohne Jahr bleibt sie rein
  // archivarisch, wie bisher.
  const kandidatenMitSonstige = [
    {
      id: SONSTIGE_SENTINEL,
      label: "Keine offene Position — archivieren (optional für ein Abrechnungsjahr vormerken)",
    },
    ...positionen,
  ];

  function updateRow(rowNumber: number, patch: Partial<NebenkostenausgleichEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesNebenkostenausgleichHinweisFilter(
      r,
      pruefeNebenkostenausgleichDuplikat(bestehend, r.datum, r.betrag),
      hinweisFilter,
    ),
  );
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.verwendungszweck || r.name;
        default:
          return null;
      }
    },
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0 && r.gewaehltePositionId);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) =>
        sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 && r.gewaehltePositionId
          ? { ...r, ausgewaehlt: checked }
          : r,
      ),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt && r.gewaehltePositionId);
  const rowsForCommit = importierbareRows.map((r) => ({
    positionId: r.gewaehltePositionId,
    mietvertragId:
      (r.gewaehltePositionId === SONSTIGE_SENTINEL ? r.sonstigeMietvertragId : r.vorgeschlagenerMietvertragId) ||
      null,
    jahr: r.gewaehltePositionId === SONSTIGE_SENTINEL && r.sonstigeJahr ? Number(r.sonstigeJahr) : null,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.name,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  if (commitMessage && commitMessage !== verarbeiteteMeldung) {
    setVerarbeiteteMeldung(commitMessage);
    setEditRows((rs) =>
      rs.map((r) =>
        pruefeNebenkostenausgleichDuplikat(bestehend, r.datum, r.betrag) && r.errors.length === 0
          ? { ...r, ausgewaehlt: false }
          : r,
      ),
    );
  }

  if (editRows.length === 0) return null;

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Nebenkostenabrechnung-Ausgleich ({editRows.length} Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <select
          value={hinweisFilter}
          onChange={(e) => setHinweisFilter(e.target.value as NebenkostenausgleichHinweisFilter)}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {NEBENKOSTENAUSGLEICH_HINWEIS_OPTIONEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        Rückzahlungen/Nachzahlungen aus der Nebenkostenabrechnung — keine Miete, keine Kosten,
        fließt nicht in die Offene-Posten-Berechnung ein. Ohne passende offene Position (z.B. ein
        Jahr ohne Abrechnung in dieser App) kann eine Buchung stattdessen als „sonstige Buchung“
        archiviert werden — rein damit der Kontoauszug vollständig erscheint, ohne Auswirkung auf
        irgendeine Berechnung.{" "}
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="px-3 py-2">Position</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const expanded = expandedRow === r.rowNumber;
              const kategorie = ermittleNebenkostenausgleichHinweis(r);
              const duplikat = pruefeNebenkostenausgleichDuplikat(bestehend, r.datum, r.betrag);
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={r.errors.length > 0 || !r.gewaehltePositionId}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <MietvertragAuswahl
                        kandidaten={kandidatenMitSonstige}
                        value={r.gewaehltePositionId}
                        leerLabel="– keiner Position zuordnen –"
                        onChange={(id) =>
                          updateRow(r.rowNumber, {
                            gewaehltePositionId: id,
                            ausgewaehlt: Boolean(id) && r.errors.length === 0,
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : kategorie === "erkannt" ? (
                        <span className={duplikat ? "text-green-400" : "text-amber-400"}>
                          {duplikat ? NEBENKOSTENAUSGLEICH_LABEL_IMPORTIERT : NEBENKOSTENAUSGLEICH_LABEL_PRUEFEN}
                        </span>
                      ) : (
                        <span className="text-neutral-500">{NEBENKOSTENAUSGLEICH_LABEL_WEITERE}</span>
                      )}
                      {r.errors.length === 0 && r.mehrdeutig && (
                        <span className="ml-1 text-amber-400">mehrdeutig, bitte prüfen</span>
                      )}
                      {r.errors.length === 0 && !r.gewaehltePositionId && (
                        <span className="ml-1 text-neutral-500">keine offene Position gewählt</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {r.gewaehltePositionId === SONSTIGE_SENTINEL && (
                    <tr className="border-t border-neutral-800 bg-neutral-950/40">
                      <td />
                      <td colSpan={6} className="flex flex-wrap items-center gap-3 px-3 py-2">
                        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                          Mietvertrag
                          <MietvertragAuswahl
                            kandidaten={kandidaten}
                            value={r.sonstigeMietvertragId}
                            leerLabel="– keinem Mietvertrag zuordnen –"
                            onChange={(id) => updateRow(r.rowNumber, { sonstigeMietvertragId: id })}
                          />
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-neutral-400">
                          Abrechnungsjahr (optional, für automatische Verknüpfung)
                          <input
                            type="number"
                            value={r.sonstigeJahr}
                            onChange={(e) => updateRow(r.rowNumber, { sonstigeJahr: e.target.value })}
                            placeholder="z.B. 2023"
                            className="w-24 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-sm text-white outline-none focus:border-neutral-400"
                          />
                        </label>
                      </td>
                    </tr>
                  )}
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={7} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Seite ----------

export default function KontoauszugImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [fileName, setFileName] = useState<string | null>(null);
  // Startet leer und wird nach jedem Commit in einem beliebigen Abschnitt per
  // ladeBestehendeImportSets() neu geladen — dadurch verschwindet z.B. eine gerade als Kosten
  // importierte Buchung sofort auch aus "Zahlungen, bitte prüfen", ohne die Datei erneut
  // hochzuladen. Solange noch kein Refresh gelaufen ist, wird unten auf preview.bestehendeXxx
  // zurückgegriffen (die ursprünglich beim Hochladen berechneten Listen).
  const [refreshedSets, setRefreshedSets] = useState<BestehendeImportSets | null>(null);
  const refreshBestehendeSets = useCallback(async () => {
    setRefreshedSets(await ladeBestehendeImportSets());
  }, []);

  const hasPreview = preview !== null && !("error" in preview);
  const bestehendeSets: BestehendeImportSets | null =
    hasPreview
      ? (refreshedSets ?? {
          bestehendeZahlungen: preview.bestehendeZahlungen,
          bestehendeZahlungenDatumBetrag: preview.bestehendeZahlungenDatumBetrag,
          bestehendeKosten: preview.bestehendeKosten,
          bestehendeMietweiterleitungen: preview.bestehendeMietweiterleitungen,
          bestehendeKautionsbuchungen: preview.bestehendeKautionsbuchungen,
          offeneNebenkostenPositionen: preview.offeneNebenkostenPositionen,
          bestehendeNebenkostenausgleich: preview.bestehendeNebenkostenausgleich,
        })
      : null;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Kontoauszug importieren</h1>
        <Link href="/kontoauszug/importe" className="text-sm text-neutral-400 underline hover:text-white">
          Bisherige Importe verwalten
        </Link>
      </div>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Export deines Kontos einmal hochladen — eingehende Buchungen werden unten
        als Zahlungen vorgeschlagen (Zuordnung zu Mietverträgen), ausgehende Buchungen als Kosten
        (Zuordnung zu Kostenarten und Gebäuden). Eingehende Gutschriften/Rücküberweisungen von
        einem bereits bekannten Kosten-Empfänger (z.B. eine Techem-Erstattung) erscheinen ebenfalls
        bei den Kosten, als negativer Betrag zur Minderung der Kostenart. Beide Bereiche kannst du
        unabhängig voneinander prüfen und importieren.
      </p>

      {!hasPreview && (
        <form action={previewAction} className="mb-8 flex items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="file">
              Datei
            </label>
            <div className="relative inline-block">
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white">
                {fileName ?? "Datei auswählen…"}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {previewPending ? "Analysiere…" : "Datei analysieren"}
          </button>
        </form>
      )}

      {preview && "error" in preview && <p className="mb-4 text-sm text-red-400">{preview.error}</p>}

      {hasPreview && bestehendeSets && (
        <div className="space-y-10">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-neutral-400 underline hover:text-white"
          >
            Andere Datei importieren
          </button>

          <ZahlungenSektion
            key={`zahlungen-${preview.importBatchId}`}
            rows={preview.zahlungenRows}
            kandidaten={preview.mietvertragKandidaten}
            bestehendeZahlungenListe={bestehendeSets.bestehendeZahlungen}
            bestehendeZahlungenDatumBetragListe={bestehendeSets.bestehendeZahlungenDatumBetrag}
            bestehendeKostenListe={bestehendeSets.bestehendeKosten}
            bestehendeNebenkostenausgleichListe={bestehendeSets.bestehendeNebenkostenausgleich}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />

          <KostenSektion
            key={`kosten-${preview.importBatchId}`}
            rows={preview.kostenRows}
            kostenarten={preview.kostenarten}
            gebaeude={preview.gebaeude}
            einheiten={preview.einheiten}
            bestehendeKostenListe={bestehendeSets.bestehendeKosten}
            bestehendeZahlungenListe={bestehendeSets.bestehendeZahlungenDatumBetrag}
            bestehendeKautionListe={bestehendeSets.bestehendeKautionsbuchungen}
            bestehendeNebenkostenausgleichListe={bestehendeSets.bestehendeNebenkostenausgleich}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />

          <MietweiterleitungenSektion
            key={`mietweiterleitungen-${preview.importBatchId}`}
            rows={preview.zahlungenRows}
            bestehendeListe={bestehendeSets.bestehendeMietweiterleitungen}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />

          <KautionSektion
            key={`kaution-${preview.importBatchId}`}
            rows={preview.zahlungenRows}
            kandidaten={preview.mietvertragKandidaten}
            bestehendeListe={bestehendeSets.bestehendeKautionsbuchungen}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />

          <NebenkostenausgleichSektion
            key={`nebenkostenausgleich-${preview.importBatchId}`}
            rows={preview.zahlungenRows}
            positionen={bestehendeSets.offeneNebenkostenPositionen}
            kandidaten={preview.mietvertragKandidaten}
            bestehendeListe={bestehendeSets.bestehendeNebenkostenausgleich}
            importBatchId={preview.importBatchId}
            onCommitted={refreshBestehendeSets}
          />
        </div>
      )}
    </div>
  );
}
