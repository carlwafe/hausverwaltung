import {
  findeKontoauszugSpalten,
  istEigentuemerBuchung,
  KAUTION_PATTERN,
  leseBetrag,
  NEBENKOSTENAUSGLEICH_PATTERN,
  parseGermanDate,
  repariereMojibake,
  RUECKBUCHUNG_PATTERN,
  textEnthaeltWort,
} from "./bank-csv";

export type MietvertragKandidat = {
  id: string;
  label: string;
  warmmiete: number;
  namen: string[]; // Vor- und Nachnamen aller Mieter
  einheitBezeichnung: string;
  beginn: string; // ISO yyyy-mm-dd
  ende: string | null; // ISO yyyy-mm-dd
};

export type ParsedZahlungRow = {
  rowNumber: number;
  datum: string | null; // ISO yyyy-mm-dd
  betrag: number | null;
  verwendungszweck: string;
  name: string;
  vorgeschlagenerMietvertragId: string | null;
  mehrdeutig: boolean;
  ignorieren: boolean; // z.B. ausgehende Buchung
  rueckbuchung: boolean; // Rücklastschrift/Lastschriftwiderspruch: negative Korrektur einer zuvor gutgeschriebenen Miete
  eigentuemerBuchung: boolean; // Buchung von/an die Eigentümerin (Julia Katharina Waller) – keine Miete
  kaution: boolean; // Kautionszahlung/-rückzahlung – keine Miete, auch wenn der Empfänger die Eigentümerin ist (Kautionskonto)
  nebenkostenausgleich: boolean; // Rückzahlung/Nachzahlung aus der Nebenkostenabrechnung – keine Miete, gehört gegen eine offene NebenkostenabrechnungPosition abgeglichen
  rohdaten: Record<string, string>; // die vollständige Originalzeile aus der Datei (alle Spalten)
  errors: string[];
};

const TAGE_TOLERANZ_VOR_BEGINN = 14;
const TAGE_TOLERANZ_NACH_ENDE = 60;

/** Prüft, ob eine Zahlung (mit etwas Toleranz für Kaution/Rücklastschriften) in den Mietzeitraum fällt. */
function liegtImMietzeitraum(datum: string | null, k: MietvertragKandidat): boolean {
  if (!datum) return true;
  const zahlungMs = new Date(datum).getTime();
  const beginnMs = new Date(k.beginn).getTime() - TAGE_TOLERANZ_VOR_BEGINN * 86400000;
  if (zahlungMs < beginnMs) return false;
  if (k.ende) {
    const endeMs = new Date(k.ende).getTime() + TAGE_TOLERANZ_NACH_ENDE * 86400000;
    if (zahlungMs > endeMs) return false;
  }
  return true;
}

function findeMietvertrag(
  verwendungszweck: string,
  name: string,
  betrag: number | null,
  datum: string | null,
  kandidaten: MietvertragKandidat[],
): { id: string | null; mehrdeutig: boolean } {
  const text = `${verwendungszweck} ${name}`;

  const scored = kandidaten
    .filter((k) => liegtImMietzeitraum(datum, k))
    .map((k) => {
      let score = 0;
      if (betrag !== null) {
        const differenz = Math.abs(betrag - k.warmmiete);
        if (differenz < 0.01) {
          score += 3;
        } else {
          // Kein exakter Treffer, aber der Betrag liegt deutlich näher an dieser Einheit als
          // eine komplett andere Miethöhe wäre — hilft z.B., wenn dieselbe Person Wohnung und
          // Garage hat und der (evtl. veraltete) Buchungsbetrag zu keiner der beiden exakt
          // passt: er ist trotzdem eindeutig näher an der günstigeren Garage als an der Wohnung.
          const relativeDifferenz = differenz / Math.max(k.warmmiete, betrag, 1);
          if (relativeDifferenz < 0.5) score += 1;
        }
      }
      let getroffeneNamensteile = 0;
      for (const n of k.namen) {
        const teile = n.split(/\s+/).filter((t) => t.length >= 3);
        for (const teil of teile) {
          if (textEnthaeltWort(text, teil)) {
            score += teil.length >= 4 ? 3 : 1;
            getroffeneNamensteile++;
          }
        }
      }
      // Ein voller Vor+Nachname-Treffer ist ein deutlich stärkeres, spezifischeres Signal als
      // ein einzelner (evtl. mehrdeutiger, z.B. gängiger Vorname) Namensteil kombiniert mit einer
      // zufällig übereinstimmenden Miethöhe, die sich mehrere Mieter teilen können.
      if (getroffeneNamensteile >= 2) score += 3;
      if (textEnthaeltWort(text, k.einheitBezeichnung.replace(/^HS \d+ WHG \d+ - /, ""))) {
        score += 1;
      }
      return { id: k.id, score };
    });

  const maxScore = Math.max(0, ...scored.map((s) => s.score));
  if (maxScore < 3) return { id: null, mehrdeutig: false };

  const beste = scored.filter((s) => s.score === maxScore);
  if (beste.length > 1) return { id: null, mehrdeutig: true };

  return { id: beste[0].id, mehrdeutig: false };
}

export function mapZahlungenRows(
  headers: string[],
  rows: Record<string, string>[],
  kandidaten: MietvertragKandidat[],
): ParsedZahlungRow[] {
  const { datumCol, betragCol, habenCol, sollCol, zweckCol, nameCol } =
    findeKontoauszugSpalten(headers);

  return rows.map((row, i) => {
    const errors: string[] = [];

    const datum = datumCol ? parseGermanDate(row[datumCol]) : null;
    if (!datum) errors.push("Datum fehlt oder unlesbar");

    const betrag = leseBetrag(row, { betragCol, habenCol, sollCol });
    if (betrag === null) errors.push("Betrag fehlt oder unlesbar");

    const verwendungszweck = zweckCol ? repariereMojibake((row[zweckCol] ?? "").trim()) : "";
    const name = nameCol ? repariereMojibake((row[nameCol] ?? "").trim()) : "";

    // Rücklastschriften/Lastschriftwidersprüche sind zwar ausgehende Buchungen (negativer
    // Betrag), korrigieren aber eine zuvor gutgeschriebene Miete, die tatsächlich nicht bezahlt
    // wurde — sie müssen als Korrekturbuchung importiert werden, nicht als "ausgehend" ignoriert.
    const rueckbuchung = RUECKBUCHUNG_PATTERN.test(verwendungszweck);
    const kaution = KAUTION_PATTERN.test(verwendungszweck) || KAUTION_PATTERN.test(name);
    const nebenkostenausgleich = NEBENKOSTENAUSGLEICH_PATTERN.test(verwendungszweck);
    // Ein Kaution-Treffer im Verwendungszweck hat Vorrang vor der Eigentümer-Erkennung: eine
    // Kaution landet oft auf einem Konto, das rechtlich auf die Eigentümerin läuft
    // (Kautionskonto), ist aber keine Mietweiterleitung/Einlage an sie persönlich.
    const eigentuemerBuchung = !kaution && istEigentuemerBuchung(name);
    const ignorieren =
      eigentuemerBuchung || kaution || nebenkostenausgleich || (betrag !== null && betrag <= 0 && !rueckbuchung);

    let vorgeschlagenerMietvertragId: string | null = null;
    let mehrdeutig = false;
    // Ein Vorschlag wird für jede Buchung berechnet, die überhaupt einem Mieter gehören könnte —
    // nur eine Eigentümer-Buchung (Mietweiterleitung/Einlage) scheidet grundsätzlich aus. Das
    // deckt neben normalen Mieteingängen auch (eigentlich "ignorierte") Kaution-Zeilen ab (die
    // Kaution-Sektion braucht den Vorschlag) sowie ausgehende Nebenkostenrückzahlungen an Mieter:
    // der Betrag bestätigt den Treffer hier zwar nicht (er entspricht keiner Warmmiete), aber der
    // Name im Verwendungszweck/Begünstigten reicht meist trotzdem für eine eindeutige Zuordnung.
    if (!eigentuemerBuchung && betrag !== null && errors.length === 0) {
      const treffer = findeMietvertrag(verwendungszweck, name, betrag, datum, kandidaten);
      vorgeschlagenerMietvertragId = treffer.id;
      mehrdeutig = treffer.mehrdeutig;
    }

    return {
      rowNumber: i + 2,
      datum,
      betrag,
      verwendungszweck,
      name,
      vorgeschlagenerMietvertragId,
      mehrdeutig,
      ignorieren,
      rueckbuchung,
      eigentuemerBuchung,
      kaution,
      nebenkostenausgleich,
      rohdaten: row,
      errors,
    };
  });
}
