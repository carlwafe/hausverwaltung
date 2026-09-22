// Baut die Gebäude-Auswahl für Formulare: ein ganzes Haus (mehrere Hausnummern desselben
// Bauwerks, z.B. "Haus 2, 4, 6" für Grundsteuer, die pro Bauwerk statt pro Adresse abgerechnet
// wird), eine Kostengruppe (frei zusammengestellte Gebäude über Haus-Grenzen hinweg, z.B. wenn
// ein Versorger mehrere Häuser gemeinsam abrechnet), eine einzelne Adresse oder eine einzelne
// Einheit (z.B. für eine Reparatur, die nur eine Wohnung betrifft). Haus, Kostengruppe, Gebäude
// und Einheit haben in der DB getrennte, eigene IDs — der Options-Wert im <select> trägt deshalb
// ein Präfix ("haus:"/"kostengruppe:"/"gebaeude:"/"einheit:"), damit ein einzelnes Dropdown-Feld
// zwischen allen vieren unterscheiden kann.
export type GebaeudeMitGruppen = {
  id: string;
  strasse: string;
  hausnummer: string;
  haus: { id: string; reihenfolge: number | null } | null;
  kostengruppen: { id: string; bezeichnung: string }[];
};

// Für vergleicheHaus: alles, was ein Haus für die Sortierung braucht — Reihenfolge plus seine
// Mitglieder-Adressen (für den Fallback ohne gesetzte Reihenfolge).
export type HausMitReihenfolge = {
  reihenfolge: number | null;
  gebaeude: { hausnummer: string }[];
};

export type EinheitMitAdresse = {
  id: string;
  bezeichnung: string;
  gebaeudeId: string;
  gebaeude: { strasse: string; hausnummer: string };
};

export type GebaeudeAuswahlOption = { value: string; label: string };
export type GebaeudeAuswahlGruppe = { label: string; optionen: GebaeudeAuswahlOption[] };

const GEBAEUDE_PREFIX = "gebaeude:";
const HAUS_PREFIX = "haus:";
const KOSTENGRUPPE_PREFIX = "kostengruppe:";
const EINHEIT_PREFIX = "einheit:";

export function gebaeudeWert(id: string): string {
  return `${GEBAEUDE_PREFIX}${id}`;
}

export function hausWert(id: string): string {
  return `${HAUS_PREFIX}${id}`;
}

export function kostengruppeWert(id: string): string {
  return `${KOSTENGRUPPE_PREFIX}${id}`;
}

export function einheitWert(id: string): string {
  return `${EINHEIT_PREFIX}${id}`;
}

/**
 * Anzeige-Label für ein Haus anhand seiner aktuellen Mitglieder, z.B. "Haus 2, 4, 6" — ohne
 * Straßenname, der ist bei mehreren Hausnummern ohnehin implizit (in der App bisher immer
 * dieselbe Straße) und machte das Label unnötig lang. Ein Haus mit nur einer Adresse (z.B. die
 * Garagen) zeigt stattdessen direkt die Adresse selbst, z.B. "Koenigsberger Strasse G" — "Haus G"
 * wäre hier weder kürzer noch verständlicher.
 */
export function hausLabel(mitglieder: { strasse: string; hausnummer: string }[]): string {
  if (mitglieder.length === 0) return "Haus (noch ohne Adressen)";
  if (mitglieder.length === 1) return `${mitglieder[0].strasse} ${mitglieder[0].hausnummer}`;
  const sortiert = [...mitglieder].sort((a, b) => parseInt(a.hausnummer, 10) - parseInt(b.hausnummer, 10));
  return `Haus ${sortiert.map((g) => g.hausnummer).join(", ")}`;
}

/**
 * Sortiert Häuser in ihrer tatsächlichen Reihenfolge (Haus.reihenfolge, z.B. nach Lage auf dem
 * Grundstück) statt alphabetisch/numerisch nach Hausnummer — die Häuser sind nicht der Reihe nach
 * durchnummeriert (z.B. liegt "Haus 5, 7, 9" nach "Haus 14, 16, 18"). Diese eine Funktion ist die
 * einzige Stelle, die diese Reihenfolge kennt — jede Seite, die mehrere Häuser aufzählt, sortiert
 * über sie statt über eine eigene, potenziell alphabetische Sortierung. Ein Haus ohne gesetzte
 * Reihenfolge (z.B. neu angelegt) fällt ans Ende, untereinander sortiert nach der niedrigsten
 * eigenen Hausnummer.
 */
export function vergleicheHaus(a: HausMitReihenfolge, b: HausMitReihenfolge): number {
  if (a.reihenfolge !== null && b.reihenfolge !== null) return a.reihenfolge - b.reihenfolge;
  if (a.reihenfolge !== null) return -1;
  if (b.reihenfolge !== null) return 1;
  const minA = Math.min(...a.gebaeude.map((g) => parseInt(g.hausnummer, 10) || 0));
  const minB = Math.min(...b.gebaeude.map((g) => parseInt(g.hausnummer, 10) || 0));
  return minA - minB;
}

/**
 * Vergleicht zwei Adressen (Gebaeude) nach der Reihenfolge ihres jeweiligen Hauses (siehe
 * vergleicheHaus) — für Listen, die Adressen/Einheiten mehrerer Häuser gemeinsam anzeigen (z.B.
 * die Einheiten-Liste, deren Standard-Reihenfolge bisher rein numerisch nach Hausnummer lief und
 * dadurch nicht der tatsächlichen Haus-Gruppierung folgte). Zwei Adressen desselben Hauses bleiben
 * gleich (Rückgabe 0) — die Aufrufer sortieren dort selbst weiter nach Hausnummer. Eine Adresse
 * ohne Haus-Zuordnung fällt hinter alle zugeordneten, sortiert unter sich nach Straße+Hausnummer.
 */
export function vergleicheGebaeudeNachHaus(
  a: { strasse: string; hausnummer: string; haus: HausMitReihenfolge | null },
  b: { strasse: string; hausnummer: string; haus: HausMitReihenfolge | null },
): number {
  if (a.haus && b.haus) return vergleicheHaus(a.haus, b.haus);
  if (a.haus) return -1;
  if (b.haus) return 1;
  const strasseCompare = a.strasse.localeCompare(b.strasse, "de");
  if (strasseCompare !== 0) return strasseCompare;
  return Number(a.hausnummer) - Number(b.hausnummer);
}

/**
 * Anzeige (Label + Link) für "welchem Gebäude gehört diese Adresse an" — gehört die Adresse zu
 * einem Haus (mehrere Hausnummern desselben Bauwerks), zeigt es dessen Haus-Label mit Link auf die
 * Haus-Seite; sonst (noch) keinem Haus zugeordnet, zeigt es die einzelne Adresse mit Link auf ihre
 * eigene Gebäude-Seite. Eine Stelle für jede Tabelle/Liste, die pro Zeile "das Gebäude" anzeigen
 * will (z.B. Einheiten-Liste) — verhindert, dass dort versehentlich nur die Hausnummer statt des
 * ganzen Hauses steht.
 */
export function gebaeudeGruppeAnzeige(gebaeude: {
  id: string;
  strasse: string;
  hausnummer: string;
  haus: { id: string; gebaeude: { strasse: string; hausnummer: string }[] } | null;
}): { label: string; href: string } {
  if (gebaeude.haus) {
    return { label: hausLabel(gebaeude.haus.gebaeude), href: `/haeuser/${gebaeude.haus.id}` };
  }
  return { label: `${gebaeude.strasse} ${gebaeude.hausnummer}`, href: `/gebaeude/${gebaeude.id}` };
}

export function gruppiereGebaeude(
  gebaeude: GebaeudeMitGruppen[],
  einheiten: EinheitMitAdresse[] = [],
): GebaeudeAuswahlGruppe[] {
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

  const hausOptionen: GebaeudeAuswahlOption[] = [...hausGruppen.entries()]
    .map(([hausId, liste]) => ({ hausId, reihenfolge: liste[0].haus!.reihenfolge, gebaeude: liste }))
    .sort(vergleicheHaus)
    .map(({ hausId, gebaeude }) => ({ value: hausWert(hausId), label: hausLabel(gebaeude) }));

  const kostengruppeOptionen: GebaeudeAuswahlOption[] = [...kostengruppenNamen.entries()]
    .map(([id, bezeichnung]) => ({ value: kostengruppeWert(id), label: bezeichnung }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  // Alle Adressen bleiben zusätzlich einzeln wählbar — Haus-, Kostengruppen- und Gebäude-IDs
  // kommen aus unterschiedlichen Tabellen, es gibt also keine Kollisionsgefahr mit den Optionen
  // oben.
  const einzelOptionen: GebaeudeAuswahlOption[] = gebaeude
    .map((g) => ({ value: gebaeudeWert(g.id), label: `${g.strasse} ${g.hausnummer}` }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  // Führendes "HS <Hausnummer> " aus der Bezeichnung entfernt, da Straße+Hausnummer bereits im
  // Label davor stehen (siehe Muster in src/lib/einheit-sort.ts) — ohne den Schnitt stünde die
  // Hausnummer redundant doppelt im Label.
  const einheitOptionen: GebaeudeAuswahlOption[] = einheiten
    .map((e) => ({
      value: einheitWert(e.id),
      label: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} — ${e.bezeichnung.replace(/^HS\s*\S+\s*/i, "")}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  const gruppen: GebaeudeAuswahlGruppe[] = [];
  if (hausOptionen.length > 0) gruppen.push({ label: "Ganzes Haus", optionen: hausOptionen });
  if (kostengruppeOptionen.length > 0) gruppen.push({ label: "Kostengruppe (mehrere Häuser)", optionen: kostengruppeOptionen });
  if (einzelOptionen.length > 0) gruppen.push({ label: "Einzelne Adresse", optionen: einzelOptionen });
  if (einheitOptionen.length > 0) gruppen.push({ label: "Einzelne Wohnung", optionen: einheitOptionen });
  return gruppen;
}

/** Löst gebaeudeId/hausId/kostengruppeId/einheitId einer Kostenposition zum passenden Wert für
 * das Auswahl-<select> auf. einheitId hat Vorrang — die spezifischste der vier Ebenen. */
export function gebaeudeAuswahlWert(
  gebaeudeId: string | null,
  hausId: string | null,
  kostengruppeId: string | null,
  einheitId: string | null = null,
): string {
  if (einheitId) return einheitWert(einheitId);
  if (kostengruppeId) return kostengruppeWert(kostengruppeId);
  if (hausId) return hausWert(hausId);
  if (gebaeudeId) return gebaeudeWert(gebaeudeId);
  return "";
}

/** Zerlegt einen Auswahl-Wert wieder in { gebaeudeId, hausId, kostengruppeId, einheitId } zum
 * Speichern. */
export function parseGebaeudeAuswahlWert(wert: string): {
  gebaeudeId: string | null;
  hausId: string | null;
  kostengruppeId: string | null;
  einheitId: string | null;
} {
  if (wert.startsWith(EINHEIT_PREFIX)) {
    return { gebaeudeId: null, hausId: null, kostengruppeId: null, einheitId: wert.slice(EINHEIT_PREFIX.length) };
  }
  if (wert.startsWith(HAUS_PREFIX)) {
    return { gebaeudeId: null, hausId: wert.slice(HAUS_PREFIX.length), kostengruppeId: null, einheitId: null };
  }
  if (wert.startsWith(KOSTENGRUPPE_PREFIX)) {
    return {
      gebaeudeId: null,
      hausId: null,
      kostengruppeId: wert.slice(KOSTENGRUPPE_PREFIX.length),
      einheitId: null,
    };
  }
  if (wert.startsWith(GEBAEUDE_PREFIX)) {
    return { gebaeudeId: wert.slice(GEBAEUDE_PREFIX.length), hausId: null, kostengruppeId: null, einheitId: null };
  }
  return { gebaeudeId: null, hausId: null, kostengruppeId: null, einheitId: null };
}

/** Anzeige-Label für eine bestehende Kostenposition (gebaeude, haus, kostengruppe ODER einheit
 * gesetzt, oder keins — einheit hat Vorrang als spezifischste Ebene). */
export function gebaeudeOderHausLabel(
  gebaeude: { strasse: string; hausnummer: string } | null,
  haus: { gebaeude: { strasse: string; hausnummer: string }[] } | null,
  kostengruppe?: { bezeichnung: string } | null,
  einheit?: { bezeichnung: string; gebaeude: { strasse: string; hausnummer: string } } | null,
): string {
  if (einheit) return `${einheit.gebaeude.strasse} ${einheit.gebaeude.hausnummer} — ${einheit.bezeichnung}`;
  if (kostengruppe) return kostengruppe.bezeichnung;
  if (haus) return hausLabel(haus.gebaeude);
  if (gebaeude) return `${gebaeude.strasse} ${gebaeude.hausnummer}`;
  return "Objekt gesamt";
}
