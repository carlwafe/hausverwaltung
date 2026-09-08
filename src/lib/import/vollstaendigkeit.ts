// Prüft für eine gespeicherte Kontoauszug-Datei, ob wirklich jede Zeile irgendwo im System
// gelandet ist — als Zahlung, als Kostenposition, als Mietweiterleitung (EigentuemerBuchung),
// als Kautionsbuchung, als sonstige (bewusst nicht weiter verfolgte) Buchung, oder als (im
// Import sichtbare) Fehlerzeile. Was übrig bleibt, ist eine Zeile, die weder importiert noch
// anderweitig erklärt ist und manuell nachgesehen werden sollte.
import { parseSpreadsheetFile } from "./spreadsheet";
import {
  datumBetragSchluessel,
  findeKontoauszugSpalten,
  leseBetrag,
  parseGermanDate,
  repariereMojibake,
} from "./bank-csv";

export type UngeklaerteZeile = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
};

/**
 * Eine Zeile, die in mehr als einer Kategorie gefunden wurde — z.B. einmal als Zahlung UND
 * einmal als sonstige Buchung. Kommt vor, wenn dieselbe Buchung zu unterschiedlichen Zeitpunkten
 * zweimal importiert/verarbeitet wurde (etwa weil eine Ausschluss-Regel zum Zeitpunkt des ersten
 * Imports noch nicht existierte). Anders als bei `ungeklaert` fehlt hier nichts — im Gegenteil,
 * es ist zu viel da, und einer der Datensätze verfälscht dadurch eine Berechnung (z.B. Ist bei
 * den offenen Posten).
 */
export type DoppelteBuchung = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
  kategorien: string[];
};

export type VollstaendigkeitsErgebnis = {
  gesamt: number;
  alsZahlungGefunden: number;
  alsKostenGefunden: number;
  alsMietweiterleitungGefunden: number;
  alsKautionsbuchungGefunden: number;
  alsSonstigesGefunden: number;
  alsNebenkostenausgleichGefunden: number;
  fehlerzeilen: number;
  ungeklaert: UngeklaerteZeile[];
  doppelteBuchungen: DoppelteBuchung[];
};

type Spalten = ReturnType<typeof findeKontoauszugSpalten>;

// Schlüssel aus Datum+Betrag+Verwendungszweck+Name statt eines rohen JSON.stringify-Vergleichs
// der ganzen Zeile — Postgres' jsonb garantiert keine Schlüsselreihenfolge, ein direkter
// String-Vergleich der wieder eingelesenen Rohdaten gegen die frisch geparste Datei wäre also
// nicht verlässlich. Datum/Betrag werden dafür geparst (nicht roh verglichen), damit
// unterschiedliche, aber gleichbedeutende Schreibweisen (z.B. "01.02.25" vs. "1.2.2025") nicht
// fälschlich als unterschiedlich gelten. repariereMojibake auf Verwendungszweck/Name aus
// demselben Grund: manche Quelldateien enthalten schon selbst mojibake-verstümmelten Text (z.B.
// "Schˆning" statt "Schöning") — wird eine bereits importierte Zeile mit diesem Fehler
// nachträglich in der DB korrigiert (Anzeige-Feld und Rohdaten), muss die frisch aus der Datei
// gelesene (weiterhin fehlerhafte) Zeile beim Abgleich trotzdem denselben Schlüssel ergeben wie
// die korrigierten Rohdaten — sonst würde eine tatsächlich schon importierte Zeile hier
// fälschlich als "ungeklärt" gemeldet.
function zeilenSchluessel(row: Record<string, string>, spalten: Spalten): string | null {
  const datum = spalten.datumCol ? parseGermanDate(row[spalten.datumCol]) : null;
  const betrag = leseBetrag(row, spalten);
  if (!datum || betrag === null) return null;
  const zweck = spalten.zweckCol ? repariereMojibake((row[spalten.zweckCol] ?? "").trim()) : "";
  const name = spalten.nameCol ? repariereMojibake((row[spalten.nameCol] ?? "").trim()) : "";
  return `${datum}|${betrag.toFixed(2)}|${zweck}|${name}`;
}

/** Schlüssel aus den beim Import gespeicherten Rohdaten einer Zahlung/Kostenposition/Mietweiterleitung. */
export function zeilenSchluesselAusRohdaten(rohdaten: unknown): string | null {
  if (!rohdaten || typeof rohdaten !== "object") return null;
  const row = rohdaten as Record<string, string>;
  const spalten = findeKontoauszugSpalten(Object.keys(row));
  return zeilenSchluessel(row, spalten);
}

export async function pruefeVollstaendigkeit(
  dateiInhalt: Buffer,
  dateiname: string,
  bekannteSchluessel: {
    zahlung: Set<string>;
    kosten: Set<string>;
    mietweiterleitung: Set<string>;
    kautionsbuchung: Set<string>;
    sonstige: Set<string>;
    // Beglichene NebenkostenabrechnungPosition — die kennt (anders als die anderen Kategorien)
    // keine Rohdaten der Quellzeile, nur beglichenAm/beglichenBetrag, deshalb ein gröberer
    // Datum+Betragshöhe-Schlüssel (siehe datumBetragSchluessel) statt des vollen zeilenSchluessel.
    beglichenePositionen: Set<string>;
  },
): Promise<VollstaendigkeitsErgebnis> {
  const file = new File([new Uint8Array(dateiInhalt)], dateiname);
  const { headers, rows } = await parseSpreadsheetFile(file);
  const spalten = findeKontoauszugSpalten(headers);

  let alsZahlungGefunden = 0;
  let alsKostenGefunden = 0;
  let alsMietweiterleitungGefunden = 0;
  let alsKautionsbuchungGefunden = 0;
  let alsSonstigesGefunden = 0;
  let alsNebenkostenausgleichGefunden = 0;
  let fehlerzeilen = 0;
  const ungeklaert: UngeklaerteZeile[] = [];
  const doppelteBuchungen: DoppelteBuchung[] = [];

  rows.forEach((row, i) => {
    const schluessel = zeilenSchluessel(row, spalten);
    if (schluessel === null) {
      fehlerzeilen++;
      return;
    }

    // Bewusst ALLE Kategorien prüfen statt beim ersten Treffer abzubrechen — nur so lässt sich
    // erkennen, wenn dieselbe Buchung versehentlich in mehr als einer Kategorie gelandet ist
    // (z.B. einmal als Zahlung UND einmal als sonstige Buchung), statt das beim ersten Treffer
    // als "erledigt" zu melden und den Doppel-Import stillschweigend zu übersehen.
    const gefundenIn: string[] = [];
    if (bekannteSchluessel.zahlung.has(schluessel)) gefundenIn.push("Zahlung");
    if (bekannteSchluessel.kosten.has(schluessel)) gefundenIn.push("Kosten");
    if (bekannteSchluessel.mietweiterleitung.has(schluessel)) gefundenIn.push("Mietweiterleitung");
    if (bekannteSchluessel.kautionsbuchung.has(schluessel)) gefundenIn.push("Kautionsbuchung");
    if (bekannteSchluessel.sonstige.has(schluessel)) gefundenIn.push("Sonstige Buchung");

    const datum = spalten.datumCol ? parseGermanDate(row[spalten.datumCol]) : null;
    const betrag = leseBetrag(row, spalten);
    if (datum && betrag !== null && bekannteSchluessel.beglichenePositionen.has(datumBetragSchluessel(new Date(datum), betrag))) {
      gefundenIn.push("Nebenkostenausgleich-Position");
    }

    if (gefundenIn.includes("Zahlung")) alsZahlungGefunden++;
    if (gefundenIn.includes("Kosten")) alsKostenGefunden++;
    if (gefundenIn.includes("Mietweiterleitung")) alsMietweiterleitungGefunden++;
    if (gefundenIn.includes("Kautionsbuchung")) alsKautionsbuchungGefunden++;
    if (gefundenIn.includes("Sonstige Buchung")) alsSonstigesGefunden++;
    if (gefundenIn.includes("Nebenkostenausgleich-Position")) alsNebenkostenausgleichGefunden++;

    const name = spalten.nameCol ? (row[spalten.nameCol] ?? "").trim() : "";
    const verwendungszweck = spalten.zweckCol ? (row[spalten.zweckCol] ?? "").trim() : "";

    if (gefundenIn.length === 0) {
      ungeklaert.push({ rowNumber: i + 2, datum, betrag, name, verwendungszweck });
    } else if (gefundenIn.length > 1) {
      doppelteBuchungen.push({ rowNumber: i + 2, datum, betrag, name, verwendungszweck, kategorien: gefundenIn });
    }
  });

  return {
    gesamt: rows.length,
    alsZahlungGefunden,
    alsKostenGefunden,
    alsMietweiterleitungGefunden,
    alsKautionsbuchungGefunden,
    alsSonstigesGefunden,
    alsNebenkostenausgleichGefunden,
    fehlerzeilen,
    ungeklaert,
    doppelteBuchungen,
  };
}
