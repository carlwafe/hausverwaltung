export type EinheitTyp = "WOHNUNG" | "GARAGE";

export type ParsedEinheitRow = {
  rowNumber: number;
  strasse: string;
  hausnummer: string;
  bezeichnung: string;
  typ: EinheitTyp;
  etage: string;
  wohnflaecheQm: number | null;
  errors: string[];
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9]/g, "");
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  bezeichnung: [
    "bezeichnung",
    "einheit",
    "wohnung",
    "whg",
    "nr",
    "nummer",
    "einheitnr",
    "einheitsnummer",
  ],
  typ: ["typ", "art", "nutzungsart"],
  etage: ["etage", "stockwerk", "geschoss"],
  wohnflaeche: ["wohnflaeche", "flaeche", "qm", "m2", "groesse", "wohnflaechem2"],
};

// Manche Listen sind nach Gebäude/Hausnummer gruppiert (z.B. "Breslauer Str." mit Werten
// 2, 4, 6 …), wobei sich die Wohnungsbezeichnung (z.B. "1. EG links") pro Gebäude wiederholt.
// Diese Spalte wird nur herangezogen, wenn die Bezeichnung sonst nicht eindeutig wäre.
const GEBAEUDE_SYNONYMS = [
  "haus",
  "hausnummer",
  "hausnr",
  "gebaeude",
  "gebaeudenr",
  "block",
  "aufgang",
  "eingang",
];
const STREET_HEADER_SUFFIXES = ["strasse", "str", "weg", "allee", "platz", "ring", "gasse", "damm"];

const ETAGE_PATTERN = /\b(EG|DG|UG|KG|\d{1,2}\s*\.?\s*OG)\b/i;

function findColumn(
  headers: string[],
  key: keyof typeof COLUMN_SYNONYMS,
  exclude: Set<string> = new Set(),
): string | undefined {
  const candidates = COLUMN_SYNONYMS[key];
  const normalizedHeaders = headers
    .filter((h) => !exclude.has(h))
    .map((h) => ({ original: h, norm: normalize(h) }));
  for (const c of candidates) {
    const exact = normalizedHeaders.find((h) => h.norm === c);
    if (exact) return exact.original;
  }
  for (const c of candidates) {
    const partial = normalizedHeaders.find((h) => h.norm.includes(c));
    if (partial) return partial.original;
  }
  return undefined;
}

function findGebaeudeColumn(headers: string[], exclude: Set<string>): string | undefined {
  const normalizedHeaders = headers
    .filter((h) => !exclude.has(h))
    .map((h) => ({ original: h, norm: normalize(h) }));

  for (const c of GEBAEUDE_SYNONYMS) {
    const exact = normalizedHeaders.find((h) => h.norm === c);
    if (exact) return exact.original;
  }
  const streetLike = normalizedHeaders.find((h) =>
    STREET_HEADER_SUFFIXES.some((suf) => h.norm.endsWith(suf)),
  );
  return streetLike?.original;
}

function parseGermanNumber(raw: string | undefined): number | null {
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

function parseTyp(raw: string | undefined): EinheitTyp {
  const n = normalize(raw ?? "");
  if (
    n.includes("garage") ||
    n.includes("stellplatz") ||
    n.includes("tiefgarage") ||
    n.includes("parkplatz")
  ) {
    return "GARAGE";
  }
  return "WOHNUNG";
}

export function mapEinheitenRows(
  headers: string[],
  rows: Record<string, string>[],
  fallback: { strasse: string; hausnummer: string },
): ParsedEinheitRow[] {
  const bezCol = findColumn(headers, "bezeichnung");
  const typCol = findColumn(headers, "typ");
  const etageCol = findColumn(headers, "etage", new Set(bezCol ? [bezCol] : []));
  const flaecheCol = findColumn(headers, "wohnflaeche");

  const usedCols = new Set(
    [bezCol, typCol, etageCol, flaecheCol].filter((c): c is string => Boolean(c)),
  );
  // Eine erkannte Gebäude-Spalte (z.B. "Breslauer Str." mit Werten 2, 4, 6 …) liefert pro Zeile
  // die Hausnummer; der Spaltenname selbst dient als Straßenname. Ohne so eine Spalte werden
  // alle Zeilen einem einzigen Gebäude zugeordnet (Objekt-Adresse als Fallback).
  const gebaeudeCol = findGebaeudeColumn(headers, usedCols);

  return rows.map((row, i) => {
    const errors: string[] = [];

    const bezeichnung = bezCol ? (row[bezCol] ?? "").trim() : "";
    if (!bezeichnung) errors.push("Bezeichnung fehlt");

    const strasse = gebaeudeCol ? gebaeudeCol.trim() : fallback.strasse;
    const hausnummer = gebaeudeCol
      ? (row[gebaeudeCol] ?? "").trim() || fallback.hausnummer
      : fallback.hausnummer;

    const typ = parseTyp(typCol ? row[typCol] : undefined);

    let etage = etageCol ? (row[etageCol] ?? "").trim() : "";
    if (!etage) {
      const match = bezeichnung.match(ETAGE_PATTERN);
      if (match) etage = match[0].toUpperCase().replace(/\s+/g, "");
    }

    const wohnflaecheQm = flaecheCol ? parseGermanNumber(row[flaecheCol]) : null;
    if (wohnflaecheQm === null || wohnflaecheQm <= 0) {
      errors.push("Wohnfläche fehlt oder ungültig");
    }

    return {
      rowNumber: i + 2,
      strasse,
      hausnummer,
      bezeichnung,
      typ,
      etage,
      wohnflaecheQm,
      errors,
    };
  });
}
