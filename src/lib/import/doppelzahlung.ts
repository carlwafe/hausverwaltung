import { findColumn, normalizeText } from "./bank-csv";
import { findeDienstleister, type DienstleisterKandidat } from "./dienstleister";

// Doppelzahlungs-Prüfung für den Kosten-Import: dieselbe Rechnung wurde zweimal bezahlt, z.B. einmal
// per Überweisung und noch einmal mit anderem Datum und anderem Verwendungszweck (die normale
// Duplikaterkennung vergleicht nur Datum+Betrag+Zweck+Empfänger und sieht das nicht). Treffer,
// wenn Empfänger (Name, IBAN oder Dienstleister), Betrag UND Rechnungsnummer übereinstimmen und die
// Zahlungen höchstens MAX_TAGE auseinanderliegen. Nur ein Hinweis, nichts wird blockiert.

/** Größter Abstand zweier Zahlungen derselben Rechnung, den wir noch als Doppelzahlung melden. */
export const MAX_TAGE = 120;

// Schlüsselwörter, die eine Rechnungsnummer einleiten ("RN 16808", "Rechnung Nr. 14", "RE35970",
// "Rg Nummer 250426", "Re.Nr. 3392481", auch Tippfehler der Aussteller wie "Rehnung"). "Dauerrechnung"
// zählt bewusst nicht (\b davor): monatliche Gebühren tragen jedes Mal dieselbe Nummer. Kunden-
// (KD., KN.) und Vertragskontonummern stehen nach anderen Wörtern und werden deshalb nie erfasst.
const RECHNUNGSNUMMER_PATTERN =
  /\b(?:rechnungsnummer|rechnungsnr|rechnung|rehnung|rchnung|rnr|rn|rg|re)(?:\b|(?=\d))[\s.:]*(?:(?:nr|nummer)\b[\s.:]*)?(\d{1,10})(?:\s*[/-]\s*(\d{4})\b)?/gi;

// Abschläge, Raten und Teilzahlungen werden bewusst mehrfach mit derselben Rechnungsnummer und
// demselben Betrag gezahlt (z.B. monatlicher Stadtwerke-Abschlag auf einer Rechnung).
const MEHRFACHZAHLUNG_PATTERN = /abschlag|abschl\.|\brate\b|\d\.\s*rate|teilzahlung|anzahlung/i;

export type Rechnungsnummer = { nummer: string; jahr: string | null };

/** Rechnungsnummern aus einem Verwendungszweck; führende Nullen entfallen ("00095/2026" = "95/2026"). */
export function extrahiereRechnungsnummern(verwendungszweck: string): Rechnungsnummer[] {
  const out: Rechnungsnummer[] = [];
  for (const m of verwendungszweck.matchAll(RECHNUNGSNUMMER_PATTERN)) {
    const hinten = verwendungszweck.slice((m.index ?? 0) + m[0].length);
    // "Rechnung 12.03.2026" ist ein Datum, keine Nummer.
    if (/^\.\d{1,2}\.\d/.test(hinten)) continue;
    const nummer = m[1].replace(/^0+/, "");
    if (!nummer) continue;
    if (!out.some((o) => o.nummer === nummer && o.jahr === (m[2] ?? null))) out.push({ nummer, jahr: m[2] ?? null });
  }
  return out;
}

function gleicheRechnung(a: Rechnungsnummer[], b: Rechnungsnummer[]): Rechnungsnummer | null {
  for (const x of a) {
    for (const y of b) {
      // Ein fehlendes Jahr ("RN 16808") passt zu jedem Jahr, zwei verschiedene Jahre nicht.
      if (x.nummer === y.nummer && (x.jahr === null || y.jahr === null || x.jahr === y.jahr)) return x.jahr ? x : y;
    }
  }
  return null;
}

/** Eine Zahlung für die Prüfung: Betrag immer als positive Ausgabe. */
export type DoppelzahlungZahlung = {
  /** Zeilennummer in der Importdatei, bei bereits gebuchten Kosten leer. */
  rowNumber: number | null;
  datum: string | null; // YYYY-MM-DD
  betrag: number;
  name: string;
  iban: string | null;
  verwendungszweck: string;
  dienstleisterId: string | null;
};

export type DoppelzahlungTreffer = {
  rechnungsnummer: string;
  datum: string | null;
  betrag: number;
  /** Zeile derselben Importdatei, sonst null (= bereits gebuchte Kostenposition). */
  rowNumber: number | null;
};

function normIban(iban: string | null): string {
  return (iban ?? "").replace(/\s/g, "").toUpperCase();
}

function gleicherEmpfaenger(a: DoppelzahlungZahlung, b: DoppelzahlungZahlung): boolean {
  if (a.dienstleisterId && a.dienstleisterId === b.dienstleisterId) return true;
  const ibanA = normIban(a.iban);
  if (ibanA.length > 10 && ibanA === normIban(b.iban)) return true;
  const nameA = normalizeText(a.name);
  return nameA.length > 0 && nameA === normalizeText(b.name);
}

function tageZwischen(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

/**
 * Prüft die Zeilen einer Importdatei gegen bereits gebuchte Kosten und gegeneinander. Rückgabe:
 * Treffer je Zeilennummer (nur Zeilen mit mindestens einem Treffer). Bereits gebuchte Kosten mit
 * gleichem Datum und gleichem Verwendungszweck sind dieselbe Bankzeile (das meldet die
 * Bereits-importiert-Erkennung) und zählen nicht.
 */
export function pruefeDoppelzahlungen(
  zeilen: DoppelzahlungZahlung[],
  bestehende: DoppelzahlungZahlung[],
): Map<number, DoppelzahlungTreffer[]> {
  const mitNummern = (z: DoppelzahlungZahlung) => ({
    z,
    nummern: MEHRFACHZAHLUNG_PATTERN.test(z.verwendungszweck) ? [] : extrahiereRechnungsnummern(z.verwendungszweck),
  });
  const neue = zeilen.filter((z) => z.rowNumber !== null).map(mitNummern).filter((x) => x.nummern.length > 0);
  const alte = bestehende.map(mitNummern).filter((x) => x.nummern.length > 0);
  const out = new Map<number, DoppelzahlungTreffer[]>();
  const merke = (rowNumber: number, t: DoppelzahlungTreffer) => {
    const liste = out.get(rowNumber) ?? [];
    liste.push(t);
    out.set(rowNumber, liste);
  };
  const passt = (a: DoppelzahlungZahlung, b: DoppelzahlungZahlung) =>
    Math.round(a.betrag * 100) === Math.round(b.betrag * 100) &&
    tageZwischen(a.datum, b.datum) <= MAX_TAGE &&
    gleicherEmpfaenger(a, b);

  for (let i = 0; i < neue.length; i++) {
    const a = neue[i];
    for (const b of alte) {
      if (!passt(a.z, b.z)) continue;
      if (a.z.datum === b.z.datum && a.z.verwendungszweck.trim() === b.z.verwendungszweck.trim()) continue;
      const nr = gleicheRechnung(a.nummern, b.nummern);
      if (nr) merke(a.z.rowNumber!, { rechnungsnummer: formatiere(nr), datum: b.z.datum, betrag: b.z.betrag, rowNumber: null });
    }
    for (let j = i + 1; j < neue.length; j++) {
      const b = neue[j];
      if (!passt(a.z, b.z)) continue;
      const nr = gleicheRechnung(a.nummern, b.nummern);
      if (!nr) continue;
      merke(a.z.rowNumber!, { rechnungsnummer: formatiere(nr), datum: b.z.datum, betrag: b.z.betrag, rowNumber: b.z.rowNumber });
      merke(b.z.rowNumber!, { rechnungsnummer: formatiere(nr), datum: a.z.datum, betrag: a.z.betrag, rowNumber: a.z.rowNumber });
    }
  }
  // Drei oder mehr gleiche Zahlungen sind eine Serie (z.B. monatlich 15 € auf derselben Rechnung),
  // kein Paar; nur die zweite Zahlung einer neuen Serie wird einmal gemeldet.
  for (const [rowNumber, treffer] of out) if (treffer.length >= 2) out.delete(rowNumber);
  return out;
}

function formatiere(nr: Rechnungsnummer): string {
  return nr.jahr ? `${nr.nummer}/${nr.jahr}` : nr.nummer;
}

/** Hinweistext für die Importtabelle. */
export function doppelzahlungHinweis(treffer: DoppelzahlungTreffer[]): string {
  const t = treffer[0];
  const datum = t.datum ? t.datum.split("-").reverse().join(".") : "unbekanntem Datum";
  const betrag = t.betrag.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const wo = t.rowNumber !== null ? `auch in Zeile ${t.rowNumber} dieser Datei (${datum})` : `schon am ${datum} gebucht`;
  const mehr = treffer.length > 1 ? ` (+${treffer.length - 1} weitere)` : "";
  return `Mögliche Doppelzahlung: Rechnung ${t.rechnungsnummer} über ${betrag} € ${wo}${mehr}`;
}

/**
 * Verbindet Importzeilen und bereits gebuchte Kostenpositionen mit der Prüfung. Importzeilen tragen
 * das Bankvorzeichen (nur ausgehende zählen), gebuchte Kosten positive Ausgaben (Gutschriften
 * zählen nicht). Rückgabe: Hinweistext je Zeilennummer.
 */
export function ermittleDoppelzahlungHinweise(
  zeilen: { rowNumber: number; datum: string | null; betrag: number | null; name: string; verwendungszweck: string; rohdaten: Record<string, string> }[],
  bestehendeKosten: { datum: Date | null; betrag: unknown; empfaenger: string | null; verwendungszweck: string | null; rohdaten: unknown }[],
  dienstleister: DienstleisterKandidat[],
): Map<number, string> {
  const ibanAus = (rohdaten: Record<string, string> | null) => {
    if (!rohdaten) return null;
    const col = findColumn(Object.keys(rohdaten), ["kontonummeriban", "iban"]);
    return col ? (rohdaten[col] ?? "").trim() || null : null;
  };
  const dlId = (name: string, zweck: string) => findeDienstleister(name, zweck, dienstleister)?.id ?? null;
  const neu: DoppelzahlungZahlung[] = zeilen
    .filter((z) => z.betrag !== null && z.betrag < 0)
    .map((z) => ({
      rowNumber: z.rowNumber,
      datum: z.datum,
      betrag: Math.abs(z.betrag!),
      name: z.name,
      iban: ibanAus(z.rohdaten),
      verwendungszweck: z.verwendungszweck,
      dienstleisterId: dlId(z.name, z.verwendungszweck),
    }));
  if (neu.length === 0) return new Map();
  const alt: DoppelzahlungZahlung[] = bestehendeKosten
    .filter((k) => Number(k.betrag) > 0)
    .map((k) => ({
      rowNumber: null,
      datum: k.datum ? k.datum.toISOString().slice(0, 10) : null,
      betrag: Number(k.betrag),
      name: k.empfaenger ?? "",
      iban: ibanAus(k.rohdaten as Record<string, string> | null),
      verwendungszweck: k.verwendungszweck ?? "",
      dienstleisterId: dlId(k.empfaenger ?? "", k.verwendungszweck ?? ""),
    }));
  const ergebnis = new Map<number, string>();
  for (const [rowNumber, treffer] of pruefeDoppelzahlungen(neu, alt)) ergebnis.set(rowNumber, doppelzahlungHinweis(treffer));
  return ergebnis;
}
