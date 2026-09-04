import {
  findeKontoauszugSpalten,
  istEigentuemerBuchung,
  leseBetrag,
  normalizeText,
  parseGermanDate,
  RUECKBUCHUNG_PATTERN,
} from "./bank-csv";

export type KostenartKandidat = { id: string; name: string; umlagefaehig: boolean };
export type GebaeudeKandidat = { id: string; label: string; strasse: string; hausnummer: string };

// Eine bereits erfasste Kostenposition, aus der eine Empfänger→Kostenart/Gebäude-Zuordnung
// gelernt wird. gebaeudeId ist null, wenn die Position dem ganzen Objekt statt einem einzelnen
// Gebäude zugeordnet war (z.B. Bankgebühren).
export type EmpfaengerHistorie = { empfaenger: string; kostenartId: string; gebaeudeId: string | null };

export type ParsedKostenRow = {
  rowNumber: number;
  datum: string | null; // ISO yyyy-mm-dd
  jahr: number | null;
  betrag: number | null; // immer positiv (Kostenbetrag, unabhängig vom Buchungsvorzeichen)
  verwendungszweck: string;
  empfaenger: string;
  vorgeschlageneKostenartId: string | null;
  vorgeschlagenesGebaeudeId: string | null;
  eigentuemerBuchung: boolean;
  rueckbuchung: boolean;
  ignorieren: boolean; // eingehende Buchung, Eigentümer-Buchung oder Rücklastschrift
  rohdaten: Record<string, string>;
  errors: string[];
};

/**
 * Schlägt eine Kostenart anhand des Empfängers vor, gelernt aus bereits erfassten
 * Kostenpositionen — aber nur, wenn dieser Empfänger bisher *immer* derselben Kostenart
 * zugeordnet wurde. Uneinheitliche Historie (z.B. derselbe Handwerker für unterschiedliche
 * Arbeiten) oder ein bisher unbekannter Empfänger liefern bewusst keinen Vorschlag — gerade
 * einmalige Reparaturrechnungen sollen manuell geprüft werden, u.a. weil davon abhängt, ob sie
 * umlagefähig sind.
 */
function ermittleTreffer(empfaenger: string, historie: EmpfaengerHistorie[]): EmpfaengerHistorie[] {
  const norm = normalizeText(empfaenger);
  if (!norm) return [];
  return historie.filter((h) => normalizeText(h.empfaenger) === norm);
}

function ermittleKostenartVorschlag(empfaenger: string, historie: EmpfaengerHistorie[]): string | null {
  const treffer = ermittleTreffer(empfaenger, historie);
  if (treffer.length === 0) return null;
  const kostenartIds = new Set(treffer.map((t) => t.kostenartId));
  if (kostenartIds.size !== 1) return null;
  return [...kostenartIds][0];
}

// Entfernt "Straße"/"Strasse"/"Str." als eigenständiges Wort, damit z.B. "Breslauer Str." (wie in
// den Gebäudestammdaten üblich) und "Breslauer Strasse" (wie Banken/Versorger oft ausschreiben)
// als dieselbe Straße erkannt werden. Nutzt \b statt eines reinen Präfix-Checks, damit z.B.
// "Strelitzer" nicht fälschlich als "Str." + "elitzer" behandelt wird.
function stripStrassenwort(s: string): string {
  return s.replace(/\bstra(?:ss|ß)e\.?\b/gi, " ").replace(/\bstr\.?(?=\s|$)/gi, " ");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Schlägt ein Gebäude zunächst anhand des Buchungstexts vor (wenn Straßenname und Hausnummer
 * eines einzelnen Gebäudes im Text vorkommen — die Hausnummer muss dabei als eigenständige Zahl
 * auftauchen, nicht nur als Teilstring einer anderen Zahl, sonst würde z.B. Hausnummer 1
 * fälschlich in "11" oder "18" anschlagen), sonst — als Fallback — anhand der
 * Empfänger-Historie, aber nur wenn dieser Empfänger bisher *immer* demselben Gebäude zugeordnet
 * wurde. Das deckt z.B. eine Objekt-weite Versicherung ab, die konventionell immer unter einem
 * bestimmten Gebäude erfasst wird, obwohl ihr Buchungstext keine Adresse nennt. Lässt sich beides
 * nicht ermitteln (z.B. eine einmalige Handwerkerrechnung ohne Adresshinweis), bleibt bewusst
 * kein Vorschlag.
 */
function ermittleGebaeudeVorschlag(
  text: string,
  empfaenger: string,
  gebaeude: GebaeudeKandidat[],
  historie: EmpfaengerHistorie[],
): string | null {
  const textLeicht = stripStrassenwort(text).toLowerCase();
  const adressTreffer = gebaeude.filter((g) => {
    const strasseBasis = stripStrassenwort(g.strasse).trim().toLowerCase();
    const hausnummer = g.hausnummer.trim().toLowerCase();
    if (!strasseBasis || !hausnummer) return false;
    const pattern = new RegExp(
      `\\b${escapeRegExp(strasseBasis)}\\b[^0-9]{0,15}\\b${escapeRegExp(hausnummer)}\\b`,
      "i",
    );
    return pattern.test(textLeicht);
  });
  if (adressTreffer.length === 1) return adressTreffer[0].id;
  if (adressTreffer.length > 1) return null;

  const treffer = ermittleTreffer(empfaenger, historie);
  if (treffer.length === 0) return null;
  const gebaeudeIds = new Set(treffer.map((t) => t.gebaeudeId));
  if (gebaeudeIds.size !== 1) return null;
  return [...gebaeudeIds][0];
}

export function mapKostenRows(
  headers: string[],
  rows: Record<string, string>[],
  historie: EmpfaengerHistorie[],
  gebaeudeKandidaten: GebaeudeKandidat[],
): ParsedKostenRow[] {
  const { datumCol, betragCol, habenCol, sollCol, zweckCol, nameCol } = findeKontoauszugSpalten(headers);

  return rows.map((row, i) => {
    const errors: string[] = [];

    const datum = datumCol ? parseGermanDate(row[datumCol]) : null;
    if (!datum) errors.push("Datum fehlt oder unlesbar");

    const rohBetrag = leseBetrag(row, { betragCol, habenCol, sollCol });
    if (rohBetrag === null) errors.push("Betrag fehlt oder unlesbar");

    const verwendungszweck = zweckCol ? (row[zweckCol] ?? "").trim() : "";
    const empfaenger = nameCol ? (row[nameCol] ?? "").trim() : "";

    const rueckbuchung = RUECKBUCHUNG_PATTERN.test(verwendungszweck);
    const eigentuemerBuchung = istEigentuemerBuchung(`${verwendungszweck} ${empfaenger}`);
    // Kosten sind nur ausgehende (negative) Buchungen — eingehende sind Mieteinnahmen und gehören
    // in den Zahlungen-Import.
    const istAusgehend = rohBetrag !== null && rohBetrag < 0;
    const ignorieren = eigentuemerBuchung || rueckbuchung || !istAusgehend;

    const betrag = rohBetrag !== null ? Math.abs(rohBetrag) : null;
    const jahr = datum ? Number(datum.slice(0, 4)) : null;

    let vorgeschlageneKostenartId: string | null = null;
    let vorgeschlagenesGebaeudeId: string | null = null;
    if (!ignorieren && errors.length === 0) {
      vorgeschlageneKostenartId = ermittleKostenartVorschlag(empfaenger, historie);
      vorgeschlagenesGebaeudeId = ermittleGebaeudeVorschlag(
        `${verwendungszweck} ${empfaenger}`,
        empfaenger,
        gebaeudeKandidaten,
        historie,
      );
    }

    return {
      rowNumber: i + 2,
      datum,
      jahr,
      betrag,
      verwendungszweck,
      empfaenger,
      vorgeschlageneKostenartId,
      vorgeschlagenesGebaeudeId,
      eigentuemerBuchung,
      rueckbuchung,
      ignorieren,
      rohdaten: row,
      errors,
    };
  });
}
