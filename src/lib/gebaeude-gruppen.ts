// Baut die Gebäude-Auswahl für Formulare: ein ganzes Haus (mehrere Hausnummern desselben
// Bauwerks, z.B. "Haus 2, 4, 6" für Grundsteuer, die pro Bauwerk statt pro Adresse abgerechnet
// wird), eine Kostengruppe (frei zusammengestellte Gebäude über Haus-Grenzen hinweg, z.B. wenn
// ein Versorger mehrere Häuser gemeinsam abrechnet) oder eine einzelne Adresse (z.B. für eine
// Reparatur, die nur eine Wohnung betrifft). Haus, Kostengruppe und Gebäude haben in der DB
// getrennte, eigene IDs — der Options-Wert im <select> trägt deshalb ein Präfix
// ("haus:"/"kostengruppe:"/"gebaeude:"), damit ein einzelnes Dropdown-Feld zwischen allen dreien
// unterscheiden kann.
export type GebaeudeMitGruppen = {
  id: string;
  strasse: string;
  hausnummer: string;
  haus: { id: string } | null;
  kostengruppen: { id: string; bezeichnung: string }[];
};

export type GebaeudeAuswahlOption = { value: string; label: string };
export type GebaeudeAuswahlGruppe = { label: string; optionen: GebaeudeAuswahlOption[] };

const GEBAEUDE_PREFIX = "gebaeude:";
const HAUS_PREFIX = "haus:";
const KOSTENGRUPPE_PREFIX = "kostengruppe:";

export function gebaeudeWert(id: string): string {
  return `${GEBAEUDE_PREFIX}${id}`;
}

export function hausWert(id: string): string {
  return `${HAUS_PREFIX}${id}`;
}

export function kostengruppeWert(id: string): string {
  return `${KOSTENGRUPPE_PREFIX}${id}`;
}

/** Anzeige-Label für ein Haus anhand seiner aktuellen Mitglieder, z.B. "Haus 2, 4, 6 (Breslauer Str.)". */
export function hausLabel(mitglieder: { strasse: string; hausnummer: string }[]): string {
  if (mitglieder.length === 0) return "Haus (noch ohne Adressen)";
  const sortiert = [...mitglieder].sort((a, b) => parseInt(a.hausnummer, 10) - parseInt(b.hausnummer, 10));
  return `Haus ${sortiert.map((g) => g.hausnummer).join(", ")} (${sortiert[0].strasse})`;
}

export function gruppiereGebaeude(gebaeude: GebaeudeMitGruppen[]): GebaeudeAuswahlGruppe[] {
  const hausGruppen = new Map<string, GebaeudeMitGruppen[]>();
  const kostengruppenNamen = new Map<string, string>();
  for (const g of gebaeude) {
    if (g.haus) {
      const liste = hausGruppen.get(g.haus.id) ?? [];
      liste.push(g);
      hausGruppen.set(g.haus.id, liste);
    }
    for (const kg of g.kostengruppen) {
      kostengruppenNamen.set(kg.id, kg.bezeichnung);
    }
  }

  const hausOptionen: GebaeudeAuswahlOption[] = [...hausGruppen.entries()].map(([hausId, liste]) => ({
    value: hausWert(hausId),
    label: hausLabel(liste),
  }));
  hausOptionen.sort((a, b) => a.label.localeCompare(b.label, "de"));

  const kostengruppeOptionen: GebaeudeAuswahlOption[] = [...kostengruppenNamen.entries()]
    .map(([id, bezeichnung]) => ({ value: kostengruppeWert(id), label: bezeichnung }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  // Alle Adressen bleiben zusätzlich einzeln wählbar — Haus-, Kostengruppen- und Gebäude-IDs
  // kommen aus unterschiedlichen Tabellen, es gibt also keine Kollisionsgefahr mit den Optionen
  // oben.
  const einzelOptionen: GebaeudeAuswahlOption[] = gebaeude
    .map((g) => ({ value: gebaeudeWert(g.id), label: `${g.strasse} ${g.hausnummer}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  const gruppen: GebaeudeAuswahlGruppe[] = [];
  if (hausOptionen.length > 0) gruppen.push({ label: "Ganzes Haus", optionen: hausOptionen });
  if (kostengruppeOptionen.length > 0) gruppen.push({ label: "Kostengruppe (mehrere Häuser)", optionen: kostengruppeOptionen });
  if (einzelOptionen.length > 0) gruppen.push({ label: "Einzelne Adresse", optionen: einzelOptionen });
  return gruppen;
}

/** Löst gebaeudeId/hausId/kostengruppeId einer Kostenposition zum passenden Wert für das
 * Auswahl-<select> auf. */
export function gebaeudeAuswahlWert(
  gebaeudeId: string | null,
  hausId: string | null,
  kostengruppeId: string | null,
): string {
  if (kostengruppeId) return kostengruppeWert(kostengruppeId);
  if (hausId) return hausWert(hausId);
  if (gebaeudeId) return gebaeudeWert(gebaeudeId);
  return "";
}

/** Zerlegt einen Auswahl-Wert wieder in { gebaeudeId, hausId, kostengruppeId } zum Speichern. */
export function parseGebaeudeAuswahlWert(
  wert: string,
): { gebaeudeId: string | null; hausId: string | null; kostengruppeId: string | null } {
  if (wert.startsWith(HAUS_PREFIX)) {
    return { gebaeudeId: null, hausId: wert.slice(HAUS_PREFIX.length), kostengruppeId: null };
  }
  if (wert.startsWith(KOSTENGRUPPE_PREFIX)) {
    return { gebaeudeId: null, hausId: null, kostengruppeId: wert.slice(KOSTENGRUPPE_PREFIX.length) };
  }
  if (wert.startsWith(GEBAEUDE_PREFIX)) {
    return { gebaeudeId: wert.slice(GEBAEUDE_PREFIX.length), hausId: null, kostengruppeId: null };
  }
  return { gebaeudeId: null, hausId: null, kostengruppeId: null };
}

/** Anzeige-Label für eine bestehende Kostenposition (gebaeude, haus ODER kostengruppe gesetzt,
 * oder keins). */
export function gebaeudeOderHausLabel(
  gebaeude: { strasse: string; hausnummer: string } | null,
  haus: { gebaeude: { strasse: string; hausnummer: string }[] } | null,
  kostengruppe?: { bezeichnung: string } | null,
): string {
  if (kostengruppe) return kostengruppe.bezeichnung;
  if (haus) return hausLabel(haus.gebaeude);
  if (gebaeude) return `${gebaeude.strasse} ${gebaeude.hausnummer}`;
  return "Objekt gesamt";
}
