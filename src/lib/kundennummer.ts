// Ohne Prisma, damit auch die Import-Erkennung (src/lib/import) die Kundennummer lesen kann.

// Die Kundennummer steht nur im Verwendungszweck der Stadtwerke-Buchung, in wechselnder
// Schreibweise ("KD 232939", "KD NR. 231300", "Kd.Nr.230736", "KN 240036", "Kunden Nr. 242009",
// "Kunden N. 245807", "Kundennummer 244268", "Vertragskonto 243144"). Die Rechnungsnummer
// ("RN …", "Re.Nr. …", "Rechnung …") bleibt bewusst außen vor.
const KUNDENNUMMER = /\b(?:K[DN]|Kd|Kunden\s*(?:Nr|N|nummer)|Vertragskonto)\.?\s*(?:Nr\.?)?\s*:?\s*(\d{5,9})\b/i;

export function kundennummerAus(verwendungszweck: string | null): string | null {
  return verwendungszweck?.match(KUNDENNUMMER)?.[1] ?? null;
}
