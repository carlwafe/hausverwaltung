// Gruppiert Kostenarten für Auswahllisten nach thematisch verwandten Stichwörtern, damit
// zusammengehörige Kostenarten nicht durch die alphabetische Sortierung im Dropdown auseinander-
// gerissen werden (z.B. "Niederschlagswasser" und "Allgemeinstrom + Wasser kombiniert" landen
// alphabetisch weit weg von "Wasser/Abwasser", obwohl sie inhaltlich zusammengehören).
const GRUPPEN: { label: string; keyword: string }[] = [{ label: "Wasser", keyword: "wasser" }];

export type KostenartGruppe<T> = { label: string; items: T[] };

export function gruppiereKostenarten<T>(kostenarten: T[], name: (item: T) => string): KostenartGruppe<T>[] {
  let rest = [...kostenarten];
  const gruppen: KostenartGruppe<T>[] = [];

  for (const g of GRUPPEN) {
    const treffer = rest.filter((k) => name(k).toLowerCase().includes(g.keyword));
    // Nur gruppieren, wenn es tatsächlich mehr als eine passende Kostenart gibt — sonst bringt
    // eine eigene Gruppe nichts.
    if (treffer.length > 1) {
      gruppen.push({ label: g.label, items: treffer });
      rest = rest.filter((k) => !treffer.includes(k));
    }
  }

  if (gruppen.length === 0) return [{ label: "", items: kostenarten }];
  if (rest.length > 0) gruppen.push({ label: "Weitere", items: rest });
  return gruppen;
}
