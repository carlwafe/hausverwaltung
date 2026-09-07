// Prüft für eine gespeicherte Kontoauszug-Datei, ob wirklich jede Zeile irgendwo im System
// gelandet ist — als Zahlung, als Kostenposition, als Mietweiterleitung (EigentuemerBuchung)
// oder als (im Import sichtbare) Fehlerzeile. Was übrig bleibt, ist eine Zeile, die weder
// importiert noch anderweitig erklärt ist und manuell nachgesehen werden sollte.
import { parseSpreadsheetFile } from "./spreadsheet";
import { findeKontoauszugSpalten, leseBetrag, parseGermanDate, repariereMojibake } from "./bank-csv";

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
  alsKautionsbuchungGefunden: number;
  fehlerzeilen: number;
  ungeklaert: UngeklaerteZeile[];
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
  },
): Promise<VollstaendigkeitsErgebnis> {
  const file = new File([new Uint8Array(dateiInhalt)], dateiname);
  const { headers, rows } = await parseSpreadsheetFile(file);
  const spalten = findeKontoauszugSpalten(headers);

  let alsZahlungGefunden = 0;
  let alsKostenGefunden = 0;
  let alsMietweiterleitungGefunden = 0;
  let alsKautionsbuchungGefunden = 0;
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
    if (bekannteSchluessel.kautionsbuchung.has(schluessel)) {
      alsKautionsbuchungGefunden++;
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
    alsKautionsbuchungGefunden,
    fehlerzeilen,
    ungeklaert,
  };
}
