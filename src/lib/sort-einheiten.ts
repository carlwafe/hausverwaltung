type EinheitMitGebaeude = {
  bezeichnung: string;
  gebaeude: { strasse: string; hausnummer: string };
};

export function sortEinheitenNachGebaeude<T extends EinheitMitGebaeude>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const strasseCompare = a.gebaeude.strasse.localeCompare(b.gebaeude.strasse);
    if (strasseCompare !== 0) return strasseCompare;
    const hausnummerCompare = Number(a.gebaeude.hausnummer) - Number(b.gebaeude.hausnummer);
    if (hausnummerCompare !== 0) return hausnummerCompare;
    return a.bezeichnung.localeCompare(b.bezeichnung);
  });
}
