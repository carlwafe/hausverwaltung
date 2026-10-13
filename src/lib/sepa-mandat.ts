// Temporäre Hilfen für die Mandatsformulare (Seite „Lastschrift-Mandate“, Entscheidung 13.10.2026): Die Mandate werden
// nur gedruckt, nichts wird gespeichert. Ohne Browser-/Server-Abhängigkeiten, damit auch Client-Komponenten sie nutzen.

/** Gläubigerangaben im Formular; stehen nicht im Quelltext, sondern werden einmal eingegeben und im Browser gemerkt. */
export const GLAEUBIGER_LEER = {
  zahlungsempfaenger: "",
  name: "",
  anschrift: "",
  id: "",
};

/**
 * Vorschlag für die Mandatsreferenz: eindeutig je Einheit und ohne Personendaten (steht auf dem Kontoauszug des
 * Mieters), z.B. "HS 6 WHG 4 - 1OG recht" → "EUT-HS6WHG4-001". Höchstens 35 Zeichen, nur SEPA-zulässige Zeichen.
 * Bei einem neuen Mandat für dieselbe Einheit die Endnummer von Hand hochzählen.
 */
export function mandatsreferenz(einheitBezeichnung: string): string {
  const teil = einheitBezeichnung.split(" - ")[0];
  const slug = teil.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 22);
  return `EUT-${slug || "X"}-001`;
}

export type MandatVertrag = {
  id: string;
  einheit: string;
  mieterNamen: string;
  strasse: string; // "Breslauer Str. 6"
  plzOrt: string; // "23701 Eutin"
  beginn: string | null; // ISO
};

export type MandatGlaeubiger = typeof GLAEUBIGER_LEER;

export type MandatBlattDaten = {
  glaeubiger: MandatGlaeubiger;
  referenz: string;
  mietobjekt: string;
  kontoinhaber: string;
  kontoinhaberAnschrift: string;
};
