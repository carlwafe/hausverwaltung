// Einheit.bezeichnung folgt durchgängig dem Muster "HS <Hausnummer> WHG <Wohnungsnummer> - …".
// Ein reiner Text-Sort sortiert "HS 15" fälschlich vor "HS 9" ein — hier wird stattdessen
// numerisch nach Hausnummer, dann Wohnungsnummer sortiert. Einheiten außerhalb dieses Musters
// (z.B. Stellplätze) landen am Ende, alphabetisch untereinander sortiert. Garagen ("Garage 2")
// stehen hinter allen Wohnungen, untereinander nach Garagennummer ("Garage 2" vor "Garage 10").
export function einheitSortSchluessel(bezeichnung: string): [number, number] {
  const treffer = /^HS\s+(\d+)\s+WHG\s+(\d+)/i.exec(bezeichnung);
  if (treffer) return [Number(treffer[1]), Number(treffer[2])];
  const garage = /^Garage\s+(\d+)/i.exec(bezeichnung);
  if (garage) return [GARAGEN_HAUS, Number(garage[1])];
  return [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
}

const GARAGEN_HAUS = 9999;

export function vergleicheEinheitBezeichnung(a: string, b: string): number {
  const [hausA, whgA] = einheitSortSchluessel(a);
  const [hausB, whgB] = einheitSortSchluessel(b);
  return hausA - hausB || whgA - whgB || a.localeCompare(b);
}
