export function sortByStrasseUndHausnummer<T extends { strasse: string; hausnummer: string }>(
  items: T[],
): T[] {
  return [...items].sort((a, b) => {
    const strasseCompare = a.strasse.localeCompare(b.strasse);
    if (strasseCompare !== 0) return strasseCompare;
    return Number(a.hausnummer) - Number(b.hausnummer);
  });
}
