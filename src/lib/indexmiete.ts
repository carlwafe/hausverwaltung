/**
 * Hilfen für die Indexmiete (§ 557b BGB). Die Rechenregel steht an einer Stelle, damit die Liste
 * "Mieterhöhung möglich ab" und das Erhöhungsschreiben dasselbe Referenzdatum und dieselbe neue
 * Miete verwenden.
 */

type Erhoehung = { gueltigAb: Date; kaltmiete: number };

/**
 * Datum der letzten Kaltmieten-Änderung (nur Einträge, bei denen sich die Kaltmiete gegenüber dem
 * Vorgänger ändert: reine NK-Anpassungen nach § 560 BGB setzen das Wartejahr laut Vertrag nicht
 * zurück). `undefined` = noch nie geändert (dann zählt der Mietbeginn).
 */
export function letzteKaltmietenAenderung(basisKaltmiete: number, erhoehungen: Erhoehung[]): Date | undefined {
  const sortiert = [...erhoehungen].sort((a, b) => a.gueltigAb.getTime() - b.gueltigAb.getTime());
  let vorher = basisKaltmiete;
  let letzte: Date | undefined;
  for (const e of sortiert) {
    if (Math.abs(e.kaltmiete - vorher) > 0.0049) letzte = e.gueltigAb;
    vorher = e.kaltmiete;
  }
  return letzte;
}

/** Monat vor dem Referenzdatum (UTC-Datum, nur der Monat zählt) als { jahr, monat 1–12 }. */
export function monatVorReferenz(referenz: Date): { jahr: number; monat: number } {
  const index = referenz.getUTCFullYear() * 12 + referenz.getUTCMonth() - 1;
  return { jahr: Math.floor(index / 12), monat: (index % 12) + 1 };
}

/** Neue Kaltmiete = Kaltmiete × neuer Index ÷ Basisindex, auf Cent gerundet. */
export function neueIndexmiete(kaltmiete: number, basisIndex: number, neuerIndex: number): number {
  return Math.round(kaltmiete * (neuerIndex / basisIndex) * 100) / 100;
}
