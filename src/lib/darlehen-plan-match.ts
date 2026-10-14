// Zuordnung einer Darlehensabbuchung im Kontoauszug zur Rate des Tilgungsplans (src/lib/tilgungsplan.ts), damit der
// Import den Zinsanteil vorschlägt, statt dass er abgetippt wird. Bewusst ohne Prisma, damit auch Client-Komponenten
// sie nutzen können.

export type DarlehenPlanRate = {
  darlehenId: string;
  bezeichnung: string;
  /** Zahltag laut Plan (yyyy-mm-dd). */
  datum: string;
  rate: number;
  zins: number;
};

/** Höchstabstand zwischen Buchungsdatum und Zahltag des Plans (Tage). */
const MAX_TAGE = 10;

const tage = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/**
 * Die Plan-Rate, die zur Abbuchung passt: gleicher Betrag (auf den Cent) und Zahltag höchstens 10 Tage vom
 * Buchungsdatum entfernt. Nur ein eindeutiger Treffer zählt — bei mehreren (zwei Darlehen mit gleicher Rate) oder
 * keinem gibt es keinen Vorschlag (Sondertilgung, geänderter Zins oder Rate; dann den Zinsanteil von Hand eintragen).
 */
export function findePlanRate(raten: DarlehenPlanRate[], datumIso: string | null, bankBetrag: number | null): DarlehenPlanRate | null {
  if (!datumIso || bankBetrag === null || bankBetrag >= 0) return null;
  const betrag = Math.abs(bankBetrag);
  const t = tage(datumIso);
  if (Number.isNaN(t)) return null;
  const treffer = raten.filter((r) => Math.abs(r.rate - betrag) < 0.005 && Math.abs(tage(r.datum) - t) <= MAX_TAGE);
  return treffer.length === 1 ? treffer[0] : null;
}
