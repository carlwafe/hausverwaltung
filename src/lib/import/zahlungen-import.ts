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
  rohdaten: Record<string, string>; // die vollständige Originalzeile aus der Datei (alle Spalten)
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
};

function findColumn(headers: string[], key: keyof typeof COLUMN_SYNONYMS): string | undefined {
  const candidates = COLUMN_SYNONYMS[key];
  const normalizedHeaders = headers.map((h) => ({ original: h, norm: normalize(h) }));
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

const RUECKBUCHUNG_PATTERN = /RUECKLASTSCHRIFT|LASTSCHRIFTWIDERSPRUCH/i;

// Buchungen von/an die Eigentümerin selbst (z.B. Kontoausgleiche, Mietweiterleitungen,
// Nebenkostenabrechnungs-Erstattungen) sind niemals Mietzahlungen eines Mieters – unabhängig
// vom Betrag oder ob sie im Verwendungszweck oder im Namensfeld erscheint.
function istEigentuemerBuchung(text: string): boolean {
  return /julia/i.test(text) && /waller/i.test(text);
}

function textEnthaeltWort(haystack: string, wort: string): boolean {
  if (wort.length < 3) return false;
  const h = normalize(haystack);
  const w = normalize(wort);
  return h.includes(w);
}

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
  const datumCol = findColumn(headers, "datum");
  const betragCol = findColumn(headers, "betrag");
  const habenCol = betragCol ? undefined : findColumn(headers, "haben");
  const sollCol = betragCol ? undefined : findColumn(headers, "soll");
  const zweckCol = findColumn(headers, "verwendungszweck");
  const nameCol = findColumn(headers, "name");

  return rows.map((row, i) => {
    const errors: string[] = [];

    const datum = datumCol ? parseGermanDate(row[datumCol]) : null;
    if (!datum) errors.push("Datum fehlt oder unlesbar");

    let betrag: number | null = null;
    if (betragCol) {
      betrag = parseGermanNumber(row[betragCol]);
    } else if (habenCol || sollCol) {
      const haben = habenCol ? parseGermanNumber(row[habenCol]) : null;
      const soll = sollCol ? parseGermanNumber(row[sollCol]) : null;
      betrag = haben ?? (soll !== null ? -Math.abs(soll) : null);
    }
    if (betrag === null) errors.push("Betrag fehlt oder unlesbar");

    const verwendungszweck = zweckCol ? (row[zweckCol] ?? "").trim() : "";
    const name = nameCol ? (row[nameCol] ?? "").trim() : "";

    // Rücklastschriften/Lastschriftwidersprüche sind zwar ausgehende Buchungen (negativer
    // Betrag), korrigieren aber eine zuvor gutgeschriebene Miete, die tatsächlich nicht bezahlt
    // wurde — sie müssen als Korrekturbuchung importiert werden, nicht als "ausgehend" ignoriert.
    const rueckbuchung = RUECKBUCHUNG_PATTERN.test(verwendungszweck);
    const eigentuemerBuchung = istEigentuemerBuchung(`${verwendungszweck} ${name}`);
    const ignorieren = eigentuemerBuchung || (betrag !== null && betrag <= 0 && !rueckbuchung);

    let vorgeschlagenerMietvertragId: string | null = null;
    let mehrdeutig = false;
    if (!ignorieren && betrag !== null && errors.length === 0) {
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
      rohdaten: row,
      errors,
    };
  });
}
