// Reine Anzeige-Helfer der Dokumentenablage — bewusst ohne Prisma-Import, damit sie auch in
// Client-Komponenten (Tabelle, Upload) und Server-Seiten gleichermaßen nutzbar sind.

// Die Bereiche sind Ansichten auf die Bezüge eines Dokuments, kein Speicherort: ein Dokument mit mehreren
// Bezügen (z.B. Rechnung → Kostenposition + Gebäude + Dienstleister) erscheint in jedem passenden Bereich.
export const BEREICHE = [
  // Hochgeladen, aber noch ohne Bezug und nicht abgelegt (Labels vorhanden, Zuordnung folgt).
  { key: "eingang", label: "Eingang", hinweis: "noch nicht abgelegt" },
  { key: "mietvertraege", label: "Mieterakten", hinweis: "je Mietvertrag: Vertrag, Schreiben, Übergabe …" },
  { key: "einheiten", label: "Einheiten", hinweis: "je Einheit (Fotos, Unterlagen)" },
  { key: "gebaeude", label: "Gebäude", hinweis: "je Hausnummer" },
  { key: "kosten", label: "Kostenbelege", hinweis: "je Kostenjahr" },
  { key: "dienstleister", label: "Dienstleister", hinweis: "je Dienstleister" },
  { key: "tickets", label: "Tickets", hinweis: "je Ticket" },
  { key: "allgemein", label: "Unkategorisiert", hinweis: "frei benannte Ordner" },
] as const;

export type BereichKey = (typeof BEREICHE)[number]["key"];

/** Typen der Gruppe „Kosten“ — solche Dokumente stehen auch ohne Kostenposition im Hauptordner Kosten (je Jahr). */
export const KOSTEN_ARTEN: readonly string[] = ["RECHNUNG", "BESCHEID", "ABRECHNUNG"];
/** Typen, die im Hauptordner Objekt als eigene „Nach Art“-Ordner erscheinen. */
export const OBJEKT_ARTEN: readonly string[] = ["VERSICHERUNG", "PRUEFBERICHT", "BEHOERDE"];

/**
 * Hauptordner der Ordner-Ansicht (Entscheidung 09.10.2026): wenige klare Ordner nach Verwendung statt eines Ordners je
 * Bezugsart. Jeder fasst Bereiche (= Ansichten auf die Bezüge) zusammen; ein Dokument erscheint in jedem passenden.
 * `href` ohne Abschnitte führt direkt in den einzigen Bereich.
 */
export const HAUPTORDNER = [
  { key: "eingang", label: "Eingang", hinweis: "noch nicht abgelegt", bereiche: ["eingang"], arten: [], href: "/dokumente?bereich=eingang" },
  { key: "kosten", label: "Kosten", hinweis: "Rechnungen, Bescheide, Abrechnungen — je Kostenjahr und Dienstleister", bereiche: ["kosten", "dienstleister"], arten: [], href: "/dokumente?gruppe=kosten" },
  { key: "mietverhaeltnisse", label: "Mietverhältnisse", hinweis: "je Mietvertrag: Vertrag, Schreiben, Übergabe …", bereiche: ["mietvertraege"], arten: [], href: "/dokumente?bereich=mietvertraege" },
  { key: "objekt", label: "Objekt", hinweis: "je Gebäude und Einheit, Versicherung, Prüfberichte, Behörde", bereiche: ["gebaeude", "einheiten"], arten: OBJEKT_ARTEN, href: "/dokumente?gruppe=objekt" },
  { key: "sonstiges", label: "Sonstiges", hinweis: "Tickets und frei benannte Ordner", bereiche: ["tickets", "allgemein"], arten: [], href: "/dokumente?gruppe=sonstiges" },
] as const satisfies readonly { key: string; label: string; hinweis: string; bereiche: readonly BereichKey[]; arten: readonly string[]; href: string }[];

export type HauptordnerKey = (typeof HAUPTORDNER)[number]["key"];

export function hauptordnerVonBereich(bereich: BereichKey) {
  return HAUPTORDNER.find((h) => (h.bereiche as readonly string[]).includes(bereich)) ?? null;
}

/** Gehört ein Dokument (Bereiche + Typ) in diesen Hauptordner? */
export function inHauptordner(e: { bereiche: readonly BereichKey[]; art: string | null }, h: (typeof HAUPTORDNER)[number]): boolean {
  if ((e.bereiche as readonly string[]).includes("eingang") && h.key !== "eingang") return false;
  return e.bereiche.some((b) => (h.bereiche as readonly string[]).includes(b)) || (!!e.art && (h.arten as readonly string[]).includes(e.art));
}


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

/** Dokumenttypen (in `Dokument.art` gespeichert) in vier Gruppen. Neu seit 09.10.2026: VERSICHERUNG, PRUEFBERICHT,
 * BEHOERDE; die bisherigen Schlüssel bleiben gültig (keine Datenmigration). */
export const ART_OPTIONEN = [
  { key: "RECHNUNG", label: "Rechnung", gruppe: "Kosten" },
  { key: "BESCHEID", label: "Bescheid", gruppe: "Kosten" },
  { key: "ABRECHNUNG", label: "Abrechnung", gruppe: "Kosten" },
  { key: "VERTRAG", label: "Vertrag", gruppe: "Mietverhältnis & Verträge" },
  { key: "SCHREIBEN", label: "Schreiben", gruppe: "Mietverhältnis & Verträge" },
  { key: "PROTOKOLL", label: "Protokoll", gruppe: "Mietverhältnis & Verträge" },
  { key: "FOTO", label: "Foto", gruppe: "Objekt" },
  { key: "VERSICHERUNG", label: "Versicherung", gruppe: "Objekt" },
  { key: "PRUEFBERICHT", label: "Prüfbericht / Gutachten", gruppe: "Objekt" },
  { key: "BEHOERDE", label: "Steuer / Behörde", gruppe: "Objekt" },
  { key: "SONSTIGES", label: "Sonstiges", gruppe: "Sonstiges" },
] as const;

export const ART_GRUPPEN = [...new Set(ART_OPTIONEN.map((a) => a.gruppe))];

/** Typen, deren Inhalt die Texterkennung beim Hochladen NICHT automatisch liest (Mieterunterlagen mit
 * personenbezogenen Daten, Fotos) — sie lässt sich dort nur auf ausdrücklichen Knopfdruck starten. Ohne
 * gewählten Typ liest die Erkennung, solange das Häkchen „Inhalt automatisch erkennen“ gesetzt ist. */
export const AUTOMATISCH_NICHT_LESEN: readonly string[] = ["VERTRAG", "SCHREIBEN", "PROTOKOLL", "FOTO"];

export function formatEuro(betrag: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(betrag);
}

export function artLabel(art: string | null): string {
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
