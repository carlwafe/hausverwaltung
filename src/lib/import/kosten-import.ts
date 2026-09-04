import {
  findeKontoauszugSpalten,
  istEigentuemerBuchung,
  leseBetrag,
  normalizeText,
  parseGermanDate,
  RUECKBUCHUNG_PATTERN,
} from "./bank-csv";

export type KostenartKandidat = { id: string; name: string; umlagefaehig: boolean };
export type GebaeudeKandidat = {
  id: string;
  label: string;
  strasse: string;
  hausnummer: string;
  haus: string | null;
};

// Eine bereits erfasste Kostenposition, aus der eine Empfänger→Kostenart/Gebäude-Zuordnung
// gelernt wird. gebaeudeId ist null, wenn die Position dem ganzen Objekt statt einem einzelnen
// Gebäude zugeordnet war (z.B. Bankgebühren). verwendungszweck ist die damals gespeicherte
// Buchungsbeschreibung — wird genutzt, um bei mehrdeutigem Empfänger (z.B. Stadtwerke Eutin für
// Wasser, Wasser+Gas und Strom+Wasser) anhand gemeinsamer Wörter zu unterscheiden.
export type EmpfaengerHistorie = {
  empfaenger: string;
  kostenartId: string;
  gebaeudeId: string | null;
  verwendungszweck: string | null;
};

export type ParsedKostenRow = {
  rowNumber: number;
  datum: string | null; // ISO yyyy-mm-dd
  jahr: number | null;
  // Positiv für eine normale (ausgehende) Kostenbuchung, negativ für eine Gutschrift/Erstattung
  // eines bekannten Kosten-Empfängers (z.B. eine Techem-Rückerstattung) — mindert die Kostenart.
  betrag: number | null;
  verwendungszweck: string;
  empfaenger: string;
  vorgeschlageneKostenartId: string | null;
  // null bedeutet "sicher kein Gebäude" (z.B. Bankgebühren, immer objektweit gebucht),
  // undefined bedeutet "nicht ermittelbar" (unbekannter Empfänger oder mehrdeutige Historie) —
  // die Unterscheidung entscheidet, ob eine Buchung als vollständiger Vorschlag gilt.
  vorgeschlagenesGebaeudeId: string | null | undefined;
  eigentuemerBuchung: boolean;
  rueckbuchung: boolean;
  // Eingehende Buchung von einem bereits als Kosten-Empfänger bekannten Absender — vermutlich eine
  // Rückerstattung/Gutschrift, keine Mieteinnahme.
  gutschrift: boolean;
  ignorieren: boolean; // Eigentümer-Buchung, oder eingehende Buchung von unbekanntem Absender (vermutlich Miete)
  rohdaten: Record<string, string>;
  errors: string[];
};

/**
 * Alle Historie-Einträge, die zu dieser Buchung gehören: normalerweise per (normalisiertem)
 * Empfängernamen abgeglichen. Hat die Buchung keinen Empfänger — z.B. Bankgebühren, die die
 * Sparkasse ohne Namen selbst abbucht ("ZV-Entgelte", "Portokosten") — greift stattdessen ein
 * exakter Verwendungszweck-Abgleich, da solche Buchungen bei jeder Wiederholung wortwörtlich
 * gleich lauten.
 */
function ermittleTreffer(
  empfaenger: string,
  verwendungszweck: string,
  historie: EmpfaengerHistorie[],
): EmpfaengerHistorie[] {
  const normEmpfaenger = normalizeText(empfaenger);
  if (normEmpfaenger) {
    return historie.filter((h) => normalizeText(h.empfaenger) === normEmpfaenger);
  }
  const normZweck = normalizeText(verwendungszweck);
  if (!normZweck) return [];
  return historie.filter(
    (h) => !normalizeText(h.empfaenger) && normalizeText(h.verwendungszweck ?? "") === normZweck,
  );
}

// Wörter ab 3 Zeichen, ohne reine Zahlen (Kundennummern, Daten, Beträge variieren pro Buchung und
// wären ein falsches Signal) und ohne generische Füllwörter — für den Verwendungszweck-Abgleich
// bei mehrdeutigem Empfänger. Die Untergrenze liegt bei 3 statt 4 Zeichen, damit kurze aber
// bedeutungstragende Wörter wie "Gas" nicht verloren gehen.
const FUELLWOERTER = new Set([
  "und", "der", "die", "das", "des", "dem", "den", "fur", "mit", "auf", "aus", "bei", "vom", "zum", "zur",
]);

function signifikanteWoerter(text: string): Set<string> {
  const woerter = text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !FUELLWOERTER.has(w));
  return new Set(woerter);
}

/**
 * Schlägt eine Kostenart anhand des Empfängers vor, gelernt aus bereits erfassten
 * Kostenpositionen — aber nur, wenn dieser Empfänger bisher *immer* derselben Kostenart
 * zugeordnet wurde. Ein bisher unbekannter Empfänger liefert bewusst keinen Vorschlag — gerade
 * einmalige Reparaturrechnungen sollen manuell geprüft werden, u.a. weil davon abhängt, ob sie
 * umlagefähig sind.
 *
 * Ist der Empfänger allein mehrdeutig (z.B. "Stadtwerke Eutin GmbH" mal für reines Wasser, mal
 * für Wasser+Gas, mal für Strom+Wasser), wird zusätzlich anhand gemeinsamer, aussagekräftiger
 * Wörter im Verwendungszweck eingegrenzt — nur wenn dabei eine Kostenart eindeutig am besten
 * passt (kein Gleichstand), wird sie vorgeschlagen.
 */
function ermittleKostenartVorschlag(
  empfaenger: string,
  verwendungszweck: string,
  historie: EmpfaengerHistorie[],
): string | null {
  const treffer = ermittleTreffer(empfaenger, verwendungszweck, historie);
  if (treffer.length === 0) return null;
  const kostenartIds = new Set(treffer.map((t) => t.kostenartId));
  if (kostenartIds.size === 1) return [...kostenartIds][0];

  const aktuelleWoerter = signifikanteWoerter(verwendungszweck);
  if (aktuelleWoerter.size === 0) return null;

  // Jaccard-Ähnlichkeit (Schnittmenge / Vereinigungsmenge) statt reiner Schnittmengengröße: eine
  // reine Schnittmengenzählung würde z.B. "Wasser + Gas" immer mindestens genauso gut wie reines
  // "Wasser" bewerten (Obermenge enthält alle Wörter von "Wasser" plus "gas"), selbst wenn die
  // aktuelle Buchung "Gas" gar nicht erwähnt — Jaccard bestraft die zusätzlichen, nicht
  // übereinstimmenden Wörter auf beiden Seiten und trifft dadurch die genauere Kostenart.
  const scoreProKostenart = new Map<string, number>();
  for (const eintrag of treffer) {
    const woerter = signifikanteWoerter(eintrag.verwendungszweck ?? "");
    if (woerter.size === 0) continue;
    const schnittmenge = [...aktuelleWoerter].filter((w) => woerter.has(w)).length;
    if (schnittmenge === 0) continue;
    const vereinigung = new Set([...aktuelleWoerter, ...woerter]).size;
    const jaccard = schnittmenge / vereinigung;
    scoreProKostenart.set(eintrag.kostenartId, Math.max(scoreProKostenart.get(eintrag.kostenartId) ?? 0, jaccard));
  }
  if (scoreProKostenart.size === 0) return null;

  const sortiert = [...scoreProKostenart.entries()].sort((a, b) => b[1] - a[1]);
  if (sortiert.length > 1 && sortiert[0][1] === sortiert[1][1]) return null;
  return sortiert[0][0];
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
  verwendungszweck: string,
  gebaeude: GebaeudeKandidat[],
  historie: EmpfaengerHistorie[],
): string | null | undefined {
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
  // Mehrdeutig (mehrere Adressen im Text) — nicht ermittelbar, nicht "sicher kein Gebäude".
  if (adressTreffer.length > 1) return undefined;

  const treffer = ermittleTreffer(empfaenger, verwendungszweck, historie);
  if (treffer.length === 0) return undefined;
  const gebaeudeIds = new Set(treffer.map((t) => t.gebaeudeId));
  // Uneinheitliche Historie (mal dieses, mal jenes Gebäude, oder mal gar keins) — nicht
  // ermittelbar. Ist die Historie dagegen konsistent (auch konsistent "kein Gebäude" = null),
  // gilt das als sicher bestimmt.
  if (gebaeudeIds.size !== 1) return undefined;
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
    const eigentuemerBuchung = istEigentuemerBuchung(empfaenger);
    // Eine eingehende Buchung ist meistens eine Mieteinnahme (gehört in den Zahlungen-Import) —
    // außer der Absender ist bereits als Kosten-Empfänger bekannt (hat Historie), dann handelt es
    // sich vermutlich um eine Rückerstattung/Gutschrift (z.B. Techem erstattet eine Überzahlung)
    // und mindert die betroffene Kostenart, statt komplett zu verschwinden.
    const istEingehend = rohBetrag !== null && rohBetrag > 0;
    const bekannterKostenEmpfaenger = ermittleTreffer(empfaenger, verwendungszweck, historie).length > 0;
    const gutschrift = istEingehend && bekannterKostenEmpfaenger;
    const ignorieren = eigentuemerBuchung || (istEingehend && !bekannterKostenEmpfaenger);

    const betrag = rohBetrag !== null ? -rohBetrag : null;
    const jahr = datum ? Number(datum.slice(0, 4)) : null;

    let vorgeschlageneKostenartId: string | null = null;
    let vorgeschlagenesGebaeudeId: string | null | undefined;
    if (!ignorieren && errors.length === 0) {
      vorgeschlageneKostenartId = ermittleKostenartVorschlag(empfaenger, verwendungszweck, historie);
      vorgeschlagenesGebaeudeId = ermittleGebaeudeVorschlag(
        `${verwendungszweck} ${empfaenger}`,
        empfaenger,
        verwendungszweck,
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
      gutschrift,
      ignorieren,
      rohdaten: row,
      errors,
    };
  });
}
