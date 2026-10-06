// Reine Anzeige-Helfer der Dokumentenablage — bewusst ohne Prisma-Import, damit sie auch in
// Client-Komponenten (Tabelle, Upload) und Server-Seiten gleichermaßen nutzbar sind.

export const BEREICHE = [
  { key: "mietvertraege", label: "Mieterakten", hinweis: "je Mietvertrag: Vertrag, Schreiben, Übergabe …" },
  { key: "einheiten", label: "Einheiten (Fotos)", hinweis: "je Einheit" },
  { key: "kosten", label: "Kostenbelege", hinweis: "je Kostenjahr" },
  { key: "dienstleister", label: "Dienstleister", hinweis: "je Dienstleister" },
  { key: "tickets", label: "Tickets", hinweis: "je Ticket" },
  { key: "allgemein", label: "Unkategorisiert", hinweis: "frei benannte Ordner" },
  // Nur Anzeige: die Originaldateien der Kontoauszug-Importe (gehören nicht zur Tabelle `dokumente`).
  { key: "kontoauszuege", label: "Kontoauszüge", hinweis: "je Jahr, aus den Importen" },
] as const;

export type BereichKey = (typeof BEREICHE)[number]["key"];

export const OHNE_ORDNER = "Ohne Ordner";

/** Vorschläge für Ordnernamen in „Unkategorisiert“ (Dokumente ohne Bezug zu einem Mietvertrag, einer
 * Einheit usw.). Nur Vorschläge beim Upload — angelegt wird ein Ordner erst durch das erste Dokument. */
export const ORDNER_VORSCHLAEGE = [
  "Versicherungen",
  "Steuer & Bescheide",
  "Objekt (Grundbuch, Energieausweis)",
  "Wartung & Prüfprotokolle",
  "Berichte Vorverwalter",
] as const;

/** Wählbare Dokumentarten (Schlagwort, in `Dokument.art` gespeichert). */
export const ART_OPTIONEN = [
  { key: "VERTRAG", label: "Vertrag" },
  { key: "SCHREIBEN", label: "Schreiben" },
  { key: "PROTOKOLL", label: "Protokoll" },
  { key: "RECHNUNG", label: "Rechnung" },
  { key: "BESCHEID", label: "Bescheid" },
  { key: "FOTO", label: "Foto" },
  { key: "SONSTIGES", label: "Sonstiges" },
] as const;

/** Kontoauszug-Dateien tragen immer diese Art (nicht wählbar, nur Anzeige/Filter). */
export const ART_KONTOAUSZUG = "KONTOAUSZUG";

export function artLabel(art: string | null): string {
  if (art === ART_KONTOAUSZUG) return "Kontoauszug";
  return ART_OPTIONEN.find((a) => a.key === art)?.label ?? "–";
}

export function istGueltigeArt(art: unknown): art is (typeof ART_OPTIONEN)[number]["key"] {
  return ART_OPTIONEN.some((a) => a.key === art);
}

/** Jahr aus dem Dateinamen (die CSV-Dateien der Importe tragen eine Jahreszahl); ohne → "". */
export function jahrAusDateiname(name: string): string {
  return name.match(/(?:19|20)\d{2}/)?.[0] ?? "";
}

export function formatBytes(n: number | null) {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}
