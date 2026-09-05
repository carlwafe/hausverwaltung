// Prüft für eine gespeicherte Kontoauszug-Datei, ob wirklich jede Zeile irgendwo im System
// gelandet ist — als Zahlung, als Kostenposition, als Mietweiterleitung (EigentuemerBuchung)
// oder als (im Import sichtbare) Fehlerzeile. Was übrig bleibt, ist eine Zeile, die weder
// importiert noch anderweitig erklärt ist und manuell nachgesehen werden sollte.
import { parseSpreadsheetFile } from "./spreadsheet";
import { findeKontoauszugSpalten, leseBetrag, parseGermanDate } from "./bank-csv";

export type UngeklaerteZeile = {
  rowNumber: number;
  datum: string | null;
  betrag: number | null;
  name: string;
  verwendungszweck: string;
};

export type VollstaendigkeitsErgebnis = {
  gesamt: number;
  alsZahlungGefunden: number;
  alsKostenGefunden: number;
  alsMietweiterleitungGefunden: number;
  fehlerzeilen: number;
  ungeklaert: UngeklaerteZeile[];
};

type Spalten = ReturnType<typeof findeKontoauszugSpalten>;

// Schlüssel aus Datum+Betrag+Verwendungszweck+Name statt eines rohen JSON.stringify-Vergleichs
// der ganzen Zeile — Postgres' jsonb garantiert keine Schlüsselreihenfolge, ein direkter
// String-Vergleich der wieder eingelesenen Rohdaten gegen die frisch geparste Datei wäre also
// nicht verlässlich. Datum/Betrag werden dafür geparst (nicht roh verglichen), damit
// unterschiedliche, aber gleichbedeutende Schreibweisen (z.B. "01.02.25" vs. "1.2.2025") nicht
// fälschlich als unterschiedlich gelten.
function zeilenSchluessel(row: Record<string, string>, spalten: Spalten): string | null {
  const datum = spalten.datumCol ? parseGermanDate(row[spalten.datumCol]) : null;
  const betrag = leseBetrag(row, spalten);
  if (!datum || betrag === null) return null;
  const zweck = spalten.zweckCol ? (row[spalten.zweckCol] ?? "").trim() : "";
  const name = spalten.nameCol ? (row[spalten.nameCol] ?? "").trim() : "";
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
  bekannteSchluessel: { zahlung: Set<string>; kosten: Set<string>; mietweiterleitung: Set<string> },
): Promise<VollstaendigkeitsErgebnis> {
  const file = new File([new Uint8Array(dateiInhalt)], dateiname);
  const { headers, rows } = await parseSpreadsheetFile(file);
  const spalten = findeKontoauszugSpalten(headers);

  let alsZahlungGefunden = 0;
  let alsKostenGefunden = 0;
  let alsMietweiterleitungGefunden = 0;
  let fehlerzeilen = 0;
  const ungeklaert: UngeklaerteZeile[] = [];

  rows.forEach((row, i) => {
    const schluessel = zeilenSchluessel(row, spalten);
    if (schluessel === null) {
      fehlerzeilen++;
      return;
    }
    if (bekannteSchluessel.zahlung.has(schluessel)) {
      alsZahlungGefunden++;
      return;
    }
    if (bekannteSchluessel.kosten.has(schluessel)) {
      alsKostenGefunden++;
      return;
    }
    if (bekannteSchluessel.mietweiterleitung.has(schluessel)) {
      alsMietweiterleitungGefunden++;
      return;
    }
    ungeklaert.push({
      rowNumber: i + 2,
      datum: spalten.datumCol ? parseGermanDate(row[spalten.datumCol]) : null,
      betrag: leseBetrag(row, spalten),
      name: spalten.nameCol ? (row[spalten.nameCol] ?? "").trim() : "",
      verwendungszweck: spalten.zweckCol ? (row[spalten.zweckCol] ?? "").trim() : "",
    });
  });

  return {
    gesamt: rows.length,
    alsZahlungGefunden,
    alsKostenGefunden,
    alsMietweiterleitungGefunden,
    fehlerzeilen,
    ungeklaert,
  };
}
