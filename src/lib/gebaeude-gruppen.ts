// Fasst Gebäude, die laut ihrem `haus`-Feld zum selben physischen Bauwerk gehören (z.B. Breslauer
// Str. 2, 4 und 6 sind ein Gebäude mit drei Hausnummern), zusätzlich zu einer "ganzes Haus"-Option
// zusammen — für Kosten wie Grundsteuer, die pro Bauwerk statt pro Hausnummer abgerechnet werden.
// Intern wird stellvertretend die Hausnummer mit der niedrigsten Zahl referenziert. Die einzelnen
// Adressen bleiben daneben weiter einzeln wählbar (z.B. für eine Reparatur, die nur eine einzelne
// Wohnung/Adresse betrifft) — nur die Repräsentanten-Adresse selbst taucht nicht doppelt auf, da
// ihre ID mit der "ganzes Haus"-Option identisch wäre.
export type GebaeudeGruppierbar = { id: string; strasse: string; hausnummer: string; haus: string | null };
export type GebaeudeAuswahlOption = { id: string; label: string };
export type GebaeudeAuswahlGruppe = { label: string; optionen: GebaeudeAuswahlOption[] };

export function gruppiereGebaeude(gebaeude: GebaeudeGruppierbar[]): GebaeudeAuswahlGruppe[] {
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

  const hausOptionen: GebaeudeAuswahlOption[] = [];
  const einzelOptionen: GebaeudeAuswahlOption[] = [];

  for (const liste of gruppen.values()) {
    const sortiert = [...liste].sort((a, b) => parseInt(a.hausnummer, 10) - parseInt(b.hausnummer, 10));
    const repraesentant = sortiert[0];
    hausOptionen.push({
      id: repraesentant.id,
      label: `Haus ${sortiert.map((g) => g.hausnummer).join(", ")} (${repraesentant.strasse})`,
    });
    // Die restlichen Adressen der Gruppe bleiben einzeln wählbar; nur der Repräsentant selbst
    // wird hier ausgelassen, da er über die "ganzes Haus"-Option bereits (mit derselben ID)
    // erreichbar ist — sonst gäbe es zwei Optionen mit demselben Wert im selben Dropdown.
    for (const g of sortiert.slice(1)) {
      einzelOptionen.push({ id: g.id, label: `${g.strasse} ${g.hausnummer}` });
    }
  }
  for (const g of einzeln) {
    einzelOptionen.push({ id: g.id, label: `${g.strasse} ${g.hausnummer}` });
  }

  hausOptionen.sort((a, b) => a.label.localeCompare(b.label, "de"));
  einzelOptionen.sort((a, b) => a.label.localeCompare(b.label, "de"));

  const gruppenListe: GebaeudeAuswahlGruppe[] = [];
  if (hausOptionen.length > 0) gruppenListe.push({ label: "Ganzes Haus", optionen: hausOptionen });
  if (einzelOptionen.length > 0) gruppenListe.push({ label: "Einzelne Adresse", optionen: einzelOptionen });
  return gruppenListe;
}

/** Flache Liste aller Auswahloptionen — für Anzeige-Lookups (z.B. "welches Label hat diese ID"). */
export function alleGebaeudeOptionen(gebaeude: GebaeudeGruppierbar[]): GebaeudeAuswahlOption[] {
  return gruppiereGebaeude(gebaeude).flatMap((g) => g.optionen);
}
