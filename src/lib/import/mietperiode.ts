// Vorschlag der Mietperiode (für welchen Monat eine Mietzahlung gedacht ist) beim Kontoauszug-Import.
// Bisher war es immer der Monat des Buchungsdatums — bei Zahlungen am Monatsende für den Folgemonat
// (Jobcenter, Daueraufträge zum Monatsende) stand dann jede Zahlung einen Monat zu früh.
//
// Reihenfolge der Regeln (siehe docs/zahlungen-kautionen.md → „Mietperiode der Zahlung“):
// 1. Rücklastschrift (negativer Betrag): Buchungsmonat.
// 2. Monat im Verwendungszweck („Miete Januar“, „Monatsmiete März 2024“, „11.25 MIETE+BK“, „07.24“) gilt wörtlich;
//    nennt der Text mehrere Monate, der älteste (§ 366 BGB: ältere Schuld zuerst) mit Hinweis. Nicht übernommen
//    werden Monate vor dem Buchhaltungs-Stichtag/Vertragsbeginn (zählten nicht aufs Mieterkonto) und frühere Monate,
//    die schon bezahlt sind (Tippfehler im Jahr, alter Text im Dauerauftrag).
// 3. Eingang am Monatsende (ab dem 25., bei Mietern, die bisher am Monatsende für den Folgemonat gezahlt haben,
//    schon ab dem 20.): Folgemonat — außer der laufende Monat ist bei einem laufend zahlenden Mieter noch offen
//    und der Mieter zahlt sonst nicht im Voraus (dann ist es die verspätete Miete des laufenden Monats).
// 4. Sonst Buchungsmonat.
// Danach: nicht vor Vertragsbeginn, nicht nach Vertragsende.

export type Periode = { jahr: number; monat: number };

export type MietperiodeGrund = "buchungsmonat" | "text" | "monatsende" | "laufender_monat_offen" | "vertragsgrenze";

export type MietperiodeVorschlag = Periode & {
  grund: MietperiodeGrund;
  // Kurze Erklärung für die Importtabelle (null = Buchungsmonat ohne Besonderheit).
  hinweis: string | null;
};

// Bisherige Mietzahlungen des Vertrags (aus dem Journal plus bereits vorgeschlagene Zeilen derselben Datei).
export type PeriodenHistorieEintrag = { datum: string; betrag: number; periodeJahr: number; periodeMonat: number };

// Ab diesem Tag gilt ein Eingang ohne weitere Anhaltspunkte als Zahlung für den Folgemonat. Rückwärtstest gegen
// alle gebuchten Mietzahlungen (05.11.2026): ab dem 25. waren 231 von 252 Zahlungen auf den Folgemonat gebucht,
// am 20.–24. nur 4 von 14.
export const MONATSENDE_AB_TAG = 25;
// Mieter, die nachweislich am Monatsende für den Folgemonat zahlen (Jobcenter), überweisen vor Feiertagen
// teils schon um den 20.
export const MONATSENDE_VORAUSZAHLER_AB_TAG = 20;

const MONATSNAMEN: [RegExp, number][] = [
  [/januar/, 1],
  [/februar/, 2],
  // „Mırz“: verstümmeltes „ä“ aus manchen Bank-Exporten.
  [/maerz|marz|mırz|mrz/, 3],
  [/april/, 4],
  [/mai/, 5],
  [/juni/, 6],
  [/juli/, 7],
  [/august/, 8],
  [/september/, 9],
  [/oktober/, 10],
  [/november/, 11],
  [/dezember/, 12],
];
const MONATSNAME_REGEX =
  /(?<![a-z])(januar|februar|maerz|marz|mırz|mrz|april|mai|juni|juli|august|september|oktober|november|dezember)(?![a-z])\s*[/.,-]?\s*((?:19|20)\d\d|\d\d)?(?!\d)/g;
// Abkürzungen nur mit Jahr („Jan 26“, „Dez. 2025“) — ohne Jahr wären „Jan“ (Vorname) oder „Mai“ zu riskant.
const MONATSKUERZEL_REGEX =
  /(?<![a-z])(jan|feb|mae|mar|apr|jun|jul|aug|sep|sept|okt|nov|dez)\.?\s*[/-]?\s*((?:20)\d\d|\d\d)(?!\d)/g;
const KUERZEL: Record<string, number> = { jan: 1, feb: 2, mae: 3, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, okt: 10, nov: 11, dez: 12 };
// MM.JJ / MM/JJ / MM.JJJJ / MM/JJJJ / MM-JJJJ — nicht als Teil eines Datums (TT.MM.JJ) oder einer längeren Nummer.
const MONAT_ZAHL_REGEX = /(?<![\d.,/])(0?[1-9]|1[0-2])\s?[./-]\s?((?:20)\d\d|2\d)(?![\d.,/])/g;
// Monatsbereich „04-09/2025“ (Nachzahlung mehrerer Monate).
const MONATSBEREICH_REGEX = /(?<![\d.,/])(0?[1-9]|1[0-2])\s?-\s?(0?[1-9]|1[0-2])\s?[./]\s?((?:20)\d\d|2\d)(?![\d.,/])/g;

function normalisiere(text: string): string {
  return text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}

export function periodeIndex(p: Periode): number {
  return p.jahr * 12 + (p.monat - 1);
}

export function periodeAusIndex(i: number): Periode {
  return { jahr: Math.floor(i / 12), monat: (i % 12) + 1 };
}

function datumIndex(datum: string): number {
  return Number(datum.slice(0, 4)) * 12 + Number(datum.slice(5, 7)) - 1;
}

export function periodeLabel(p: Periode): string {
  return `${String(p.monat).padStart(2, "0")}/${p.jahr}`;
}

// Jahr zu einer Monatsangabe ohne Jahr: der Monat, der dem Buchungsmonat am nächsten liegt — höchstens 2 Monate
// voraus („Miete Januar“ am 30.12. = Januar des Folgejahres), sonst rückwärts (Nachzahlung „Dezember“ im Januar).
function jahrZuMonat(monat: number, buchungIndex: number): Periode {
  const buchungJahr = Math.floor(buchungIndex / 12);
  for (const jahr of [buchungJahr + 1, buchungJahr, buchungJahr - 1]) {
    const diff = jahr * 12 + monat - 1 - buchungIndex;
    if (diff <= 2 && diff > -10) return { jahr, monat };
  }
  return { jahr: buchungJahr, monat };
}

function jahrAusText(text: string): number {
  const j = Number(text);
  return text.length === 2 ? 2000 + j : j;
}

/**
 * Monate, die der Verwendungszweck nennt (aufsteigend, ohne Doppelte). Nur Angaben in der Nähe des Buchungsdatums
 * (bis 24 Monate zurück, bis 3 Monate voraus) zählen — eine Jahreszahl in einer Rechnungs- oder Kundennummer
 * soll keine Mietperiode ergeben.
 */
export function monateImVerwendungszweck(verwendungszweck: string, datum: string): Periode[] {
  const text = normalisiere(verwendungszweck);
  const buchung = datumIndex(datum);
  const gefunden = new Map<number, Periode>();
  const merke = (p: Periode) => {
    const i = periodeIndex(p);
    if (i >= buchung - 24 && i <= buchung + 3) gefunden.set(i, p);
  };
  for (const m of text.matchAll(MONATSNAME_REGEX)) {
    const monat = MONATSNAMEN.find(([re]) => re.test(m[1]))![1];
    const mitJahr = m[2] ? { jahr: jahrAusText(m[2]), monat } : null;
    // Eine Zahl hinter dem Monatsnamen, die als Jahr nicht in die Nähe passt, ist eher eine Hausnummer („Mai 15“).
    const i = mitJahr ? periodeIndex(mitJahr) : NaN;
    merke(mitJahr && i >= buchung - 24 && i <= buchung + 3 ? mitJahr : jahrZuMonat(monat, buchung));
  }
  for (const m of text.matchAll(MONATSBEREICH_REGEX)) {
    const von = Number(m[1]);
    const bis = Number(m[2]);
    if (von < bis) for (let monat = von; monat <= bis; monat++) merke({ jahr: jahrAusText(m[3]), monat });
  }
  for (const m of text.matchAll(MONATSKUERZEL_REGEX)) {
    merke({ jahr: jahrAusText(m[2]), monat: KUERZEL[m[1]] });
  }
  for (const m of text.matchAll(MONAT_ZAHL_REGEX)) {
    merke({ jahr: jahrAusText(m[2]), monat: Number(m[1]) });
  }
  return [...gefunden.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

/** Zahlt der Mieter bisher am Monatsende für den Folgemonat? Mindestens 2 solche Zahlungen und mehr als im selben Monat. */
export function istVorauszahler(historie: PeriodenHistorieEintrag[]): boolean {
  let folgemonat = 0;
  let selberMonat = 0;
  for (const h of historie.slice(-8)) {
    if (h.betrag <= 0 || Number(h.datum.slice(8, 10)) < MONATSENDE_VORAUSZAHLER_AB_TAG) continue;
    const versatz = periodeIndex({ jahr: h.periodeJahr, monat: h.periodeMonat }) - datumIndex(h.datum);
    if (versatz === 1) folgemonat++;
    else if (versatz === 0) selberMonat++;
  }
  return folgemonat >= 2 && folgemonat > selberMonat;
}

export type VertragFuerPeriode = {
  beginn: string | null;
  ende: string | null;
  // Wirksamer Buchhaltungs-Stichtag (Vertrag, sonst Objekt): Perioden davor zählen nicht aufs Mieterkonto.
  stichtag?: string | null;
  // Aktuelle Warmmiete (Kalt + NK) — ab 95 % gilt ein Monat als bezahlt.
  warmmiete?: number | null;
};

export function ermittleMietperiode(
  zeile: { datum: string; betrag: number; verwendungszweck: string },
  // Nach Datum aufsteigend, nur Zahlungen vor dieser Zeile.
  historie: PeriodenHistorieEintrag[] = [],
  vertrag: VertragFuerPeriode | null = null,
): MietperiodeVorschlag {
  const buchung = datumIndex(zeile.datum);
  const tag = Number(zeile.datum.slice(8, 10));
  let index = buchung;
  let grund: MietperiodeGrund = "buchungsmonat";
  let hinweis: string | null = null;

  // Netto je Periode (Rücklastschriften heben eine Zahlung wieder auf).
  const netto = new Map<number, number>();
  for (const h of historie) {
    const i = periodeIndex({ jahr: h.periodeJahr, monat: h.periodeMonat });
    netto.set(i, (netto.get(i) ?? 0) + h.betrag);
  }
  const hatZahlung = (i: number) => (netto.get(i) ?? 0) > 0.005;
  const istBezahlt = (i: number) => (netto.get(i) ?? 0) >= (vertrag?.warmmiete ? vertrag.warmmiete * 0.95 : 0.01);
  const frueheste = [vertrag?.beginn, vertrag?.stichtag]
    .filter((d): d is string => Boolean(d))
    .map(datumIndex)
    .reduce<number | null>((max, i) => (max === null || i > max ? i : max), null);

  if (zeile.betrag > 0) {
    const verworfen: string[] = [];
    const textMonate = monateImVerwendungszweck(zeile.verwendungszweck, zeile.datum).filter((p) => {
      const i = periodeIndex(p);
      // Nur bei Zahlungen ab dem Stichtag — davor gebuchte Altdaten tragen ihre Perioden ohnehin wie gebucht.
      if (frueheste !== null && i < frueheste && buchung >= frueheste) {
        verworfen.push(`${periodeLabel(p)} (vor Buchhaltungs-/Vertragsbeginn)`);
        return false;
      }
      // Ein früherer Monat, der schon bezahlt ist: vermutlich Tippfehler oder alter Text im Dauerauftrag.
      if (i < buchung && istBezahlt(i)) {
        verworfen.push(`${periodeLabel(p)} (schon bezahlt)`);
        return false;
      }
      return true;
    });
    if (textMonate.length > 0) {
      index = periodeIndex(textMonate[0]);
      grund = "text";
      hinweis =
        textMonate.length > 1
          ? `Text nennt mehrere Monate (${textMonate.map(periodeLabel).join(", ")}) — ältester vorgeschlagen, ggf. aufteilen`
          : index === buchung
            ? null
            : index < buchung
              ? `Nachzahlung für ${periodeLabel(textMonate[0])} laut Verwendungszweck`
              : `Monat aus Verwendungszweck (${periodeLabel(textMonate[0])})`;
    } else {
      const vorauszahler = istVorauszahler(historie);
      if (tag >= (vorauszahler ? MONATSENDE_VORAUSZAHLER_AB_TAG : MONATSENDE_AB_TAG)) {
        const zahltLaufend = hatZahlung(buchung - 1) || hatZahlung(buchung - 2);
        if (!hatZahlung(buchung) && zahltLaufend && (!vorauszahler || hatZahlung(buchung + 1))) {
          // Der laufende Monat ist noch offen: verspätete Miete, nicht Vorauszahlung (ältere Schuld zuerst).
          grund = "laufender_monat_offen";
          hinweis = "Eingang am Monatsende, laufender Monat noch unbezahlt — als Miete dieses Monats vorgeschlagen";
        } else {
          index = buchung + 1;
          grund = "monatsende";
          hinweis = vorauszahler
            ? "Eingang am Monatsende — wie bisher bei diesem Mieter für den Folgemonat"
            : "Eingang am Monatsende — für den Folgemonat vorgeschlagen";
        }
      }
    }
    if (verworfen.length > 0) {
      hinweis = `Text nennt ${verworfen.join(", ")} — nicht übernommen${hinweis ? `; ${hinweis}` : ""}`;
    }
  }

  // Nicht vor Vertragsbeginn (erste Miete vor dem Einzug überwiesen), nicht nach Vertragsende.
  if (vertrag?.beginn && grund !== "text") {
    const beginn = datumIndex(vertrag.beginn);
    if (index < beginn && beginn - buchung <= 2) {
      index = beginn;
      grund = "vertragsgrenze";
      hinweis = `Vor Vertragsbeginn eingegangen — für den ersten Mietmonat (${periodeLabel(periodeAusIndex(beginn))}) vorgeschlagen`;
    }
  }
  if (vertrag?.ende && grund !== "text") {
    const ende = datumIndex(vertrag.ende);
    if (index > ende && index - 1 <= ende && buchung <= ende) {
      index = ende;
      grund = "vertragsgrenze";
      hinweis = "Eingang am Monatsende des letzten Vertragsmonats — für diesen Monat vorgeschlagen";
    }
  }
  return { ...periodeAusIndex(index), grund, hinweis };
}

// Daten für den Vorschlag, die der Import einmal lädt und der Tabelle mitgibt (Neuberechnung bei Vertragswechsel).
export type PeriodenKontext = {
  // Je Mietvertrag die bisherigen aktiven Mietzahlungen (nach Datum aufsteigend, nur der Zeitraum um die Datei).
  historie: Record<string, PeriodenHistorieEintrag[]>;
  vertraege: Record<string, VertragFuerPeriode>;
};

/** Vorschlag für eine Zeile bei einem (ggf. von Hand gewählten) Mietvertrag — nur mit den gebuchten Zahlungen. */
export function mietperiodeFuerVertrag(
  zeile: { datum: string; betrag: number; verwendungszweck: string },
  mietvertragId: string | null,
  kontext: PeriodenKontext,
): MietperiodeVorschlag {
  const historie = mietvertragId ? (kontext.historie[mietvertragId] ?? []).filter((h) => h.datum < zeile.datum) : [];
  return ermittleMietperiode(zeile, historie, mietvertragId ? (kontext.vertraege[mietvertragId] ?? null) : null);
}

/**
 * Vorschläge für alle Zeilen einer Datei. Läuft nach Datum, damit frühere Zeilen derselben Datei (z.B. die reguläre
 * Zahlung Anfang des Monats) für spätere schon zählen — sonst sähe eine Monatsend-Zahlung den laufenden Monat als offen.
 */
export function schlageMietperiodenVor(
  zeilen: { rowNumber: number; datum: string | null; betrag: number | null; verwendungszweck: string; mietvertragId: string | null }[],
  kontext: PeriodenKontext,
): Map<number, MietperiodeVorschlag> {
  const ergebnis = new Map<number, MietperiodeVorschlag>();
  const arbeit = new Map<string, PeriodenHistorieEintrag[]>();
  const sortiert = zeilen
    .filter((z): z is typeof z & { datum: string; betrag: number } => Boolean(z.datum) && z.betrag !== null)
    .sort((a, b) => a.datum.localeCompare(b.datum) || a.rowNumber - b.rowNumber);
  for (const z of sortiert) {
    const id = z.mietvertragId;
    const historie = id ? (arbeit.get(id) ?? [...(kontext.historie[id] ?? [])]) : [];
    const vorschlag = ermittleMietperiode(
      z,
      historie.filter((h) => h.datum < z.datum),
      id ? (kontext.vertraege[id] ?? null) : null,
    );
    ergebnis.set(z.rowNumber, vorschlag);
    // Schon gebuchte Zeilen (gleiches Datum, gleicher Betrag) stehen bereits in der Historie.
    if (id && !historie.some((h) => h.datum === z.datum && Math.abs(h.betrag - z.betrag) < 0.005)) {
      historie.push({ datum: z.datum, betrag: z.betrag, periodeJahr: vorschlag.jahr, periodeMonat: vorschlag.monat });
      historie.sort((a, b) => a.datum.localeCompare(b.datum));
    }
    if (id) arbeit.set(id, historie);
  }
  return ergebnis;
}
