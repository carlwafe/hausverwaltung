// Baut die Gebäude-Auswahl für Formulare: entweder ein ganzes Haus (mehrere Hausnummern
// desselben Bauwerks, z.B. "Haus 2, 4, 6" für Grundsteuer, die pro Bauwerk statt pro Adresse
// abgerechnet wird) oder eine einzelne Adresse (z.B. für eine Reparatur, die nur eine Wohnung
// betrifft). Haus und Gebäude haben in der DB getrennte, eigene IDs — der Options-Wert im
// <select> trägt deshalb ein Präfix ("haus:"/"gebaeude:"), damit ein einzelnes Dropdown-Feld
// zwischen beiden unterscheiden kann.
export type GebaeudeMitHaus = {
  id: string;
  strasse: string;
  hausnummer: string;
  haus: { id: string } | null;
};

export type GebaeudeAuswahlOption = { value: string; label: string };
export type GebaeudeAuswahlGruppe = { label: string; optionen: GebaeudeAuswahlOption[] };

const GEBAEUDE_PREFIX = "gebaeude:";
const HAUS_PREFIX = "haus:";

export function gebaeudeWert(id: string): string {
  return `${GEBAEUDE_PREFIX}${id}`;
}

export function hausWert(id: string): string {
  return `${HAUS_PREFIX}${id}`;
}

/** Anzeige-Label für ein Haus anhand seiner aktuellen Mitglieder, z.B. "Haus 2, 4, 6 (Breslauer Str.)". */
export function hausLabel(mitglieder: { strasse: string; hausnummer: string }[]): string {
  if (mitglieder.length === 0) return "Haus (noch ohne Adressen)";
  const sortiert = [...mitglieder].sort((a, b) => parseInt(a.hausnummer, 10) - parseInt(b.hausnummer, 10));
  return `Haus ${sortiert.map((g) => g.hausnummer).join(", ")} (${sortiert[0].strasse})`;
}

export function gruppiereGebaeude(gebaeude: GebaeudeMitHaus[]): GebaeudeAuswahlGruppe[] {
  const hausGruppen = new Map<string, GebaeudeMitHaus[]>();
  for (const g of gebaeude) {
    if (!g.haus) continue;
    const liste = hausGruppen.get(g.haus.id) ?? [];
    liste.push(g);
    hausGruppen.set(g.haus.id, liste);
  }

  const hausOptionen: GebaeudeAuswahlOption[] = [...hausGruppen.entries()].map(([hausId, liste]) => ({
    value: hausWert(hausId),
    label: hausLabel(liste),
  }));
  hausOptionen.sort((a, b) => a.label.localeCompare(b.label, "de"));

  // Alle Adressen bleiben zusätzlich einzeln wählbar — Haus- und Gebäude-IDs kommen aus
  // unterschiedlichen Tabellen, es gibt also keine Kollisionsgefahr mit den Haus-Optionen oben.
  const einzelOptionen: GebaeudeAuswahlOption[] = gebaeude
    .map((g) => ({ value: gebaeudeWert(g.id), label: `${g.strasse} ${g.hausnummer}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  const gruppen: GebaeudeAuswahlGruppe[] = [];
  if (hausOptionen.length > 0) gruppen.push({ label: "Ganzes Haus", optionen: hausOptionen });
  if (einzelOptionen.length > 0) gruppen.push({ label: "Einzelne Adresse", optionen: einzelOptionen });
  return gruppen;
}

/** Löst gebaeudeId/hausId einer Kostenposition zum passenden Wert für das Auswahl-<select> auf. */
export function gebaeudeAuswahlWert(gebaeudeId: string | null, hausId: string | null): string {
  if (hausId) return hausWert(hausId);
  if (gebaeudeId) return gebaeudeWert(gebaeudeId);
  return "";
}

/** Zerlegt einen Auswahl-Wert wieder in { gebaeudeId, hausId } zum Speichern. */
export function parseGebaeudeAuswahlWert(wert: string): { gebaeudeId: string | null; hausId: string | null } {
  if (wert.startsWith(HAUS_PREFIX)) return { gebaeudeId: null, hausId: wert.slice(HAUS_PREFIX.length) };
  if (wert.startsWith(GEBAEUDE_PREFIX)) return { gebaeudeId: wert.slice(GEBAEUDE_PREFIX.length), hausId: null };
  return { gebaeudeId: null, hausId: null };
}

/** Anzeige-Label für eine bestehende Kostenposition (gebaeude ODER haus gesetzt, oder keins). */
export function gebaeudeOderHausLabel(
  gebaeude: { strasse: string; hausnummer: string } | null,
  haus: { gebaeude: { strasse: string; hausnummer: string }[] } | null,
): string {
  if (haus) return hausLabel(haus.gebaeude);
  if (gebaeude) return `${gebaeude.strasse} ${gebaeude.hausnummer}`;
  return "Objekt gesamt";
}
