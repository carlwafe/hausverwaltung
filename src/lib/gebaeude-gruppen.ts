// Fasst Gebäude, die laut ihrem `haus`-Feld zum selben physischen Bauwerk gehören (z.B. Breslauer
// Str. 11, 13 und 15 sind ein Gebäude mit drei Hausnummern), zu einer einzigen Auswahloption
// zusammen — für Kosten wie Grundsteuer, die pro Bauwerk statt pro Hausnummer abgerechnet werden.
// Intern wird stellvertretend die Hausnummer mit der niedrigsten Zahl referenziert.
export type GebaeudeGruppierbar = { id: string; strasse: string; hausnummer: string; haus: string | null };
export type GebaeudeAuswahlOption = { id: string; label: string };

export function gruppiereGebaeude(gebaeude: GebaeudeGruppierbar[]): GebaeudeAuswahlOption[] {
  const gruppen = new Map<string, GebaeudeGruppierbar[]>();
  const einzeln: GebaeudeGruppierbar[] = [];

  for (const g of gebaeude) {
    if (!g.haus) {
      einzeln.push(g);
      continue;
    }
    const schluessel = `${g.strasse}|${g.haus}`;
    const liste = gruppen.get(schluessel) ?? [];
    liste.push(g);
    gruppen.set(schluessel, liste);
  }

  const optionen: GebaeudeAuswahlOption[] = [];
  for (const liste of gruppen.values()) {
    const sortiert = [...liste].sort((a, b) => parseInt(a.hausnummer, 10) - parseInt(b.hausnummer, 10));
    const repraesentant = sortiert[0];
    optionen.push({
      id: repraesentant.id,
      label: `${repraesentant.strasse} ${sortiert.map((g) => g.hausnummer).join(", ")}`,
    });
  }
  for (const g of einzeln) {
    optionen.push({ id: g.id, label: `${g.strasse} ${g.hausnummer}` });
  }

  return optionen.sort((a, b) => a.label.localeCompare(b.label, "de"));
}
