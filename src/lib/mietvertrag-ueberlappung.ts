// Ein unbekanntes beginn (siehe Schema-Kommentar auf Mietvertrag.beginn: "unbekannt", nicht "vor
// Beginn der Zeit") wird wie in soll-ist.ts/nebenkostenabrechnung.ts als beliebig weit in der
// Vergangenheit behandelt, ein offenes ende als bis heute/unbegrenzt laufend — passende
// Platzhalter dafür.
const MIN_DATE = new Date(-8640000000000000);
const MAX_DATE = new Date(8640000000000000);

export type VertragZeitraum = {
  id: string;
  beginn: Date | null;
  ende: Date | null;
};

/** Liefert die IDs aller Verträge aus der Liste, die sich mit mindestens einem anderen Vertrag
 * derselben Liste zeitlich überlappen. Gedacht für einen Aufruf pro Einheit mit deren eigenen
 * Verträgen. Ein nahtloser Übergang (Auszug und Einzug am selben Tag) gilt NICHT als Überlappung
 * — strikte Ungleichung. */
export function ermittleUeberlappungen(vertraege: VertragZeitraum[]): Set<string> {
  const ueberlappend = new Set<string>();

  for (let i = 0; i < vertraege.length; i++) {
    const a = vertraege[i];
    const aBeginn = a.beginn ?? MIN_DATE;
    const aEnde = a.ende ?? MAX_DATE;
    for (let j = i + 1; j < vertraege.length; j++) {
      const b = vertraege[j];
      const bBeginn = b.beginn ?? MIN_DATE;
      const bEnde = b.ende ?? MAX_DATE;
      if (aBeginn < bEnde && bBeginn < aEnde) {
        ueberlappend.add(a.id);
        ueberlappend.add(b.id);
      }
    }
  }

  return ueberlappend;
}
