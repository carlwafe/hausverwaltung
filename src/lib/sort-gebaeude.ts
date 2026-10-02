import { vergleicheGebaeudeNachHaus, type HausMitReihenfolge } from "./gebaeude-gruppen";

/**
 * Adressen in der Haus-Reihenfolge des Objekts (siehe vergleicheGebaeudeNachHaus), innerhalb eines
 * Hauses nach Hausnummer — für Auswahllisten, die nicht alphabetisch sortieren sollen ("10" vor
 * "2"). Braucht die Haus-Relation inkl. ihrer `gebaeude` (für den Fallback ohne gesetzte
 * Reihenfolge); ohne Haus sortiert die Adresse hinter alle zugeordneten.
 */
export function sortGebaeudeNachHaus<
  T extends { strasse: string; hausnummer: string; haus?: HausMitReihenfolge | null },
>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const hausVergleich = vergleicheGebaeudeNachHaus(
      { ...a, haus: a.haus ?? null },
      { ...b, haus: b.haus ?? null },
    );
    if (hausVergleich !== 0) return hausVergleich;
    return a.hausnummer.localeCompare(b.hausnummer, "de", { numeric: true });
  });
}
