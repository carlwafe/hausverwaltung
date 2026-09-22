import { vergleicheGebaeudeNachHaus, type HausMitReihenfolge } from "./gebaeude-gruppen";

type EinheitMitGebaeude = {
  bezeichnung: string;
  gebaeude: {
    strasse: string;
    hausnummer: string;
    // Optional, da nicht jede Aufrufstelle die Haus-Relation lädt — fehlt sie, sortiert die
    // Adresse wie eine Adresse ohne Haus-Zuordnung (nach Straße/Hausnummer), statt die ganze
    // Sortierung zum Absturz zu bringen.
    haus?: HausMitReihenfolge | null;
  };
};

/**
 * Reihenfolge "wie auf dem Grundstück": zuerst nach Haus (siehe vergleicheGebaeudeNachHaus, z.B.
 * "Haus 2, 4, 6" vor "Haus 8, 10, 12" statt alphabetisch), innerhalb eines Hauses nach Hausnummer,
 * zuletzt nach Bezeichnung. Ersetzt die frühere rein numerische Hausnummer-Sortierung, die die
 * tatsächliche Haus-Gruppierung ignorierte.
 */
export function sortEinheitenNachGebaeude<T extends EinheitMitGebaeude>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const gruppeCompare = vergleicheGebaeudeNachHaus(
      { ...a.gebaeude, haus: a.gebaeude.haus ?? null },
      { ...b.gebaeude, haus: b.gebaeude.haus ?? null },
    );
    if (gruppeCompare !== 0) return gruppeCompare;
    const hausnummerCompare = Number(a.gebaeude.hausnummer) - Number(b.gebaeude.hausnummer);
    if (hausnummerCompare !== 0) return hausnummerCompare;
    return a.bezeichnung.localeCompare(b.bezeichnung);
  });
}
