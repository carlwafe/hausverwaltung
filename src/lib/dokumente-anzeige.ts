// Reine Anzeige-Helfer der Dokumentenablage — bewusst ohne Prisma-Import, damit sie auch in
// Client-Komponenten (Tabelle, Upload) und Server-Seiten gleichermaßen nutzbar sind.

export const BEREICHE = [
  { key: "mietvertraege", label: "Mieterakten", hinweis: "je Mietvertrag: Vertrag, Schreiben, Übergabe …" },
  { key: "einheiten", label: "Einheiten (Fotos)", hinweis: "je Einheit" },
  { key: "kosten", label: "Kostenbelege", hinweis: "je Kostenjahr" },
  { key: "dienstleister", label: "Dienstleister", hinweis: "je Dienstleister" },
  { key: "tickets", label: "Tickets", hinweis: "je Ticket" },
  { key: "allgemein", label: "Allgemein", hinweis: "frei benannte Ordner" },
] as const;

export type BereichKey = (typeof BEREICHE)[number]["key"];

export const OHNE_ORDNER = "Ohne Ordner";

export function formatBytes(n: number | null) {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}
