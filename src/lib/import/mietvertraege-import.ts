export type MieterKandidat = { id: string; vorname: string; nachname: string };

export type EinheitKandidat = {
  id: string;
  hausnummer: string;
  whgNr: string; // aus "HS X WHG Y - ..." extrahiert
  label: string;
};

export type ParsedMieterEintrag = {
  vorname: string;
  nachname: string;
  mieterId: string | null; // vorhandener Mieter gefunden?
};

export type ParsedVertragRow = {
  rowNumber: number;
  hausnummer: string;
  whgNrRoh: string;
  einheitId: string | null;
  mieterEintraege: ParsedMieterEintrag[];
  beginn: string | null; // ISO yyyy-mm-dd
  ende: string | null;
  kaltmiete: number | null;
  nebenkostenVorauszahlung: number | null;
  bereitsVorhanden: boolean;
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
  whgnr: ["bezeichnung", "einheit", "wohnung", "whg", "nr", "nummer", "einheitnr", "einheitsnummer"],
  name: ["name", "mieter", "mietername", "beguenstigterzahlungspflichtiger"],
  beginn: ["mietbeginn", "beginn", "einzugsdatum", "von"],
  ende: ["mietende", "ende", "auszugsdatum", "bis"],
  kaltmiete: ["kaltmiete", "grundmiete", "nettomiete"],
  nebenkosten: ["nebenkosten", "nkvorauszahlung", "nebenkostenvorauszahlung", "nkvz"],
  warmmiete: ["warmmiete", "gesamtmiete", "bruttomiete"],
  email: ["email", "emailadresse", "mail"],
  telefon: ["telefon", "handynummer", "mobil", "handy", "telefonnummer"],
};

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

function parseGermanDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();

  const dmy = trimmed.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (dmy) {
    const [, d, m, yRaw] = dmy;
    const y = yRaw.length === 2 ? `20${yRaw}` : yRaw;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

/** Extrahiert die WHG-Nummer aus z.B. "1. EG links" -> "1". */
function extractWhgNr(raw: string): string {
  const match = raw.trim().match(/^(\d+)\./);
  return match ? match[1] : normalize(raw);
}

function parseNamen(raw: string): { vorname: string; nachname: string }[] {
  if (!raw) return [];
  const teile = raw
    .split(/,|&|\/|\bund\b/i)
    .map((s) => s.trim())
    .filter(Boolean)
    // Bei "Nachname, Vorname"-Trennung durch Komma nicht fälschlich als zwei Personen werten:
    // wir behandeln jedes Segment als vollständigen Namen (Vorname(n) + Nachname).
    .filter((s) => /[a-zäöüß]/i.test(s));

  return teile.map((name) => {
    const woerter = name.split(/\s+/).filter(Boolean);
    if (woerter.length <= 1) {
      return { vorname: woerter[0] ?? "", nachname: "" };
    }
    return { vorname: woerter.slice(0, -1).join(" "), nachname: woerter[woerter.length - 1] };
  });
}

export function mapVertraegeRows(
  headers: string[],
  rows: Record<string, string>[],
  einheiten: EinheitKandidat[],
  mieter: MieterKandidat[],
): ParsedVertragRow[] {
  const whgCol = findColumn(headers, "whgnr");
  const nameCol = findColumn(headers, "name");
  const beginnCol = findColumn(headers, "beginn");
  const endeCol = findColumn(headers, "ende");
  const kaltmieteCol = findColumn(headers, "kaltmiete");
  const nebenkostenCol = findColumn(headers, "nebenkosten");
  const warmmieteCol = findColumn(headers, "warmmiete");

  const usedCols = new Set(
    [whgCol, nameCol, beginnCol, endeCol, kaltmieteCol, nebenkostenCol, warmmieteCol].filter(
      (c): c is string => Boolean(c),
    ),
  );
  const gebaeudeCol = findGebaeudeColumn(headers, usedCols);

  const einheitenByKey = new Map<string, string>();
  for (const e of einheiten) {
    einheitenByKey.set(`${e.hausnummer}|${e.whgNr}`, e.id);
  }

  const mieterByName = new Map<string, string>();
  for (const m of mieter) {
    mieterByName.set(`${normalize(m.vorname)} ${normalize(m.nachname)}`, m.id);
  }

  return rows.map((row, i) => {
    const errors: string[] = [];

    const hausnummer = gebaeudeCol ? (row[gebaeudeCol] ?? "").trim() : "";
    const whgNrRoh = whgCol ? (row[whgCol] ?? "").trim() : "";
    const whgNr = extractWhgNr(whgNrRoh);

    let einheitId: string | null = null;
    if (hausnummer && whgNr) {
      einheitId = einheitenByKey.get(`${hausnummer}|${whgNr}`) ?? null;
    }
    if (!einheitId) errors.push("Einheit nicht gefunden (Hausnummer/WHG-Nr prüfen)");

    const namenRoh = nameCol ? (row[nameCol] ?? "").trim() : "";
    const personen = parseNamen(namenRoh);
    if (personen.length === 0) errors.push("Mietername fehlt");

    const mieterEintraege: ParsedMieterEintrag[] = personen.slice(0, 2).map((p) => ({
      vorname: p.vorname,
      nachname: p.nachname,
      mieterId: mieterByName.get(`${normalize(p.vorname)} ${normalize(p.nachname)}`) ?? null,
    }));

    const beginn = beginnCol ? parseGermanDate(row[beginnCol]) : null;
    if (!beginn) errors.push("Mietbeginn fehlt oder unlesbar");

    const ende = endeCol ? parseGermanDate(row[endeCol]) : null;

    const kaltmiete = kaltmieteCol ? parseGermanNumber(row[kaltmieteCol]) : null;
    if (kaltmiete === null) errors.push("Kaltmiete fehlt oder unlesbar");

    let nebenkostenVorauszahlung = nebenkostenCol ? parseGermanNumber(row[nebenkostenCol]) : null;
    if (nebenkostenVorauszahlung === null && warmmieteCol && kaltmiete !== null) {
      const warmmiete = parseGermanNumber(row[warmmieteCol]);
      if (warmmiete !== null) nebenkostenVorauszahlung = Math.max(0, warmmiete - kaltmiete);
    }
    if (nebenkostenVorauszahlung === null) nebenkostenVorauszahlung = 0;

    return {
      rowNumber: i + 2,
      hausnummer,
      whgNrRoh,
      einheitId,
      mieterEintraege,
      beginn,
      ende,
      kaltmiete,
      nebenkostenVorauszahlung,
      bereitsVorhanden: false,
      errors,
    };
  });
}
