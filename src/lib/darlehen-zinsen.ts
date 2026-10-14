// Zinsen eines Darlehens je Monat eines Jahres laut Tilgungsplan (src/lib/tilgungsplan.ts) — Grundlage für den
// Vorschlag der Schuldzinsen von anderen Konten (Seite „Darlehen“). Reine Funktionen ohne Datenbank, damit auch
// Client-Komponenten sie nutzen können.
import { berechneTilgungsplan, type Zinsstufe } from "@/lib/tilgungsplan";

export const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"] as const;

export type DarlehenPlanDaten = {
  startRestschuld: number;
  startDatum: Date;
  rate: number;
  zinssatz: number;
  zahltag: number;
  laufzeitEnde: Date | null;
  zinsbindungBis: Date | null;
  stufen: Zinsstufe[] | null;
};

/**
 * Zinsanteil der Raten je Monat (Index 0 = Januar) im Jahr; null = in diesem Monat gibt es laut Plan keine Rate
 * (vor dem Startdatum des Plans oder nach Laufzeitende). Zugeordnet wird nach Zahltag (Abfluss), nicht nach dem
 * Planmonat.
 */
export function zinsenJeMonat(d: DarlehenPlanDaten, jahr: number): (number | null)[] {
  const raten = berechneTilgungsplan({ ...d, stufen: d.stufen ?? [] });
  const monate: (number | null)[] = Array(12).fill(null);
  for (const r of raten) {
    if (r.datum.getUTCFullYear() !== jahr) continue;
    const i = r.datum.getUTCMonth();
    monate[i] = Math.round(((monate[i] ?? 0) + r.zins) * 100) / 100;
  }
  return monate;
}

/** Summe der Monate von … bis … (1–12, einschließlich) und die Monate ohne Rate im Plan. */
export function summiereMonate(monate: (number | null)[], von: number, bis: number): { summe: number; ohnePlan: number[]; anzahl: number } {
  let summe = 0;
  let anzahl = 0;
  const ohnePlan: number[] = [];
  for (let m = von; m <= bis; m++) {
    const z = monate[m - 1];
    if (z === null || z === undefined) ohnePlan.push(m);
    else {
      summe += z;
      anzahl++;
    }
  }
  return { summe: Math.round(summe * 100) / 100, ohnePlan, anzahl };
}

/** „Raten Jan–Sep“ bzw. „Rate Mär“ für die Anzeige. */
export function zeitraumText(von: number | null, bis: number | null): string | null {
  if (!von || !bis || von < 1 || bis > 12 || von > bis) return null;
  return von === bis ? `Rate ${MONATE_KURZ[von - 1]}` : `Raten ${MONATE_KURZ[von - 1]}–${MONATE_KURZ[bis - 1]}`;
}
