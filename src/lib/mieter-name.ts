// Anzeigename eines Mieters. Der Vorname ist optional (leer bei Firmen/Genossenschaften/Behörden,
// deren voller Name dann im Nachnamen steht) — daher nie einfach "vorname nachname" zusammensetzen,
// sonst entstehen führende Leerzeichen bzw. "Firma, " in Listen.

type Name = { vorname: string; nachname: string };

const teile = (...t: string[]) => t.map((s) => s.trim()).filter(Boolean);

/** "Anna Muster" bzw. "Wankendorfer Baugenossenschaft eG". */
export function mieterName(m: Name): string {
  return teile(m.vorname, m.nachname).join(" ");
}

/** "Muster, Anna" bzw. "Wankendorfer Baugenossenschaft eG" — für Auswahllisten nach Nachnamen. */
export function mieterNameNachnameZuerst(m: Name): string {
  return teile(m.nachname, m.vorname).join(", ");
}
