// Gemeinsame Hilfsfunktionen zum Einlesen von Bank-Kontoauszügen (CSV/Excel), verwendet sowohl
// beim Zahlungen- als auch beim Kosten-Import.

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    // Deutsches Eszett ist kein diakritisches Zeichen, das sich per NFD zerlegen liesse — ohne
    // diesen Schritt wuerde es beim Entfernen der Nicht-Buchstaben unten einfach geloescht statt
    // zu "ss" angeglichen (z.B. "Strasse" mit Eszett -> "strae" statt "strasse"), sodass die
    // beiden Schreibweisen nie als gleich erkannt wuerden.
    .replace(/\u00df/g, "ss")
    // Umlaute auf die deutsche ASCII-Transliteration (ae/oe/ue) statt nur die Punkte per NFD zu
    // entfernen \u2014 sonst wuerde z.B. "Empf\u00e4nger" zu "empfanger" statt "empfaenger" und wuerde nie
    // gegen Kandidaten wie "auftraggeberempfaenger" matchen, die von dieser Schreibweise ausgehen.
    .replace(/\u00e4/g, "ae")
    .replace(/\u00f6/g, "oe")
    .replace(/\u00fc/g, "ue")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export function findColumn(headers: string[], kandidaten: string[]): string | undefined {
  const normalizedHeaders = headers.map((h) => ({ original: h, norm: normalizeText(h) }));
  for (const c of kandidaten) {
    const exact = normalizedHeaders.find((h) => h.norm === c);
    if (exact) return exact.original;
  }
  for (const c of kandidaten) {
    const partial = normalizedHeaders.find((h) => h.norm.includes(c));
    if (partial) return partial.original;
  }
  return undefined;
}

export function parseGermanNumber(raw: string | undefined): number | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[^\d,.\-]/g, "").trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (cleaned.includes(",") && cleaned.includes(".")) {
    normalized = cleaned.replace(/\./g, "").replace(",", ".");
  } else if (cleaned.includes(",")) {
    normalized = cleaned.replace(",", ".");
  }

  const num = parseFloat(normalized);
  return Number.isFinite(num) ? num : null;
}

export function parseGermanDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  // dd.mm.yyyy oder dd.mm.yy
  const dmy = trimmed.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2,4})$/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  // yyyy-mm-dd (schon ISO)
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

export const RUECKBUCHUNG_PATTERN = /RUECKLASTSCHRIFT|LASTSCHRIFTWIDERSPRUCH/i;

// Buchungen von/an die Eigentümerin selbst (z.B. Kontoausgleiche, Mietweiterleitungen,
// Nebenkostenabrechnungs-Erstattungen) sind niemals Mieteinnahmen oder Kosten. Prüft bewusst nur
// das Namens-/Empfängerfeld (die tatsächliche Gegenpartei der Buchung), nicht den
// Verwendungszweck: Banken zitieren dort oft den Namen des Kontoinhabers als Referenz (z.B.
// Sparkassens "/FOR/Julia Katharina Waller ..."), auch wenn die eigentliche Gegenpartei — hier
// z.B. Techem — jemand ganz anderes ist. Ein Treffer im freien Verwendungszweck-Text ist daher
// kein verlässliches Signal für eine echte Eigentümer-Buchung.
export function istEigentuemerBuchung(empfaengerOderName: string): boolean {
  return /julia/i.test(empfaengerOderName) && /waller/i.test(empfaengerOderName);
}

// Anders als bei istEigentuemerBuchung ist hier ein Treffer im Verwendungszweck bewusst
// ausreichend und nötig: eine Kaution wird oft auf ein Konto eingezahlt, das rechtlich auf den
// Namen der Eigentümerin läuft (Kautionskonto) — der Empfänger-Name allein würde die Zeile also
// fälschlich als Eigentümer-Buchung statt als Kaution erkennen.
export const KAUTION_PATTERN = /kaution|mietsicherheit/i;

export function textEnthaeltWort(haystack: string, wort: string): boolean {
  if (wort.length < 3) return false;
  const h = normalizeText(haystack);
  const w = normalizeText(wort);
  return h.includes(w);
}

export const KONTOAUSZUG_SPALTEN = {
  datum: ["buchungstag", "valutadatum", "wertstellung", "buchungsdatum", "datum"],
  betrag: ["betrag", "umsatz", "betrageur", "betrageuro"],
  haben: ["haben", "einzahlung", "gutschrift"],
  soll: ["soll", "auszahlung", "belastung"],
  verwendungszweck: ["verwendungszweck", "buchungstext", "vorgang", "buchungsdetails"],
  name: [
    "auftraggeberempfaenger",
    "beguenstigterzahlungspflichtiger",
    "name",
    "zahlungsempfaenger",
    "zahlungspflichtiger",
  ],
} as const;

/** Liest Datum/Betrag/Verwendungszweck/Name-Spalten anhand der üblichen Bank-CSV-Kopfzeilen aus. */
export function findeKontoauszugSpalten(headers: string[]) {
  const datumCol = findColumn(headers, [...KONTOAUSZUG_SPALTEN.datum]);
  const betragCol = findColumn(headers, [...KONTOAUSZUG_SPALTEN.betrag]);
  const habenCol = betragCol ? undefined : findColumn(headers, [...KONTOAUSZUG_SPALTEN.haben]);
  const sollCol = betragCol ? undefined : findColumn(headers, [...KONTOAUSZUG_SPALTEN.soll]);
  const zweckCol = findColumn(headers, [...KONTOAUSZUG_SPALTEN.verwendungszweck]);
  const nameCol = findColumn(headers, [...KONTOAUSZUG_SPALTEN.name]);
  return { datumCol, betragCol, habenCol, sollCol, zweckCol, nameCol };
}

/** Vorzeichenbehafteter Betrag: positiv = eingehend, negativ = ausgehend. */
export function leseBetrag(
  row: Record<string, string>,
  spalten: { betragCol?: string; habenCol?: string; sollCol?: string },
): number | null {
  if (spalten.betragCol) return parseGermanNumber(row[spalten.betragCol]);
  if (spalten.habenCol || spalten.sollCol) {
    const haben = spalten.habenCol ? parseGermanNumber(row[spalten.habenCol]) : null;
    const soll = spalten.sollCol ? parseGermanNumber(row[spalten.sollCol]) : null;
    return haben ?? (soll !== null ? -Math.abs(soll) : null);
  }
  return null;
}
