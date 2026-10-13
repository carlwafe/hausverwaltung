// Temporäre Hilfen für die Mandatsformulare (Seite „Lastschrift-Mandate“, Entscheidung 13.10.2026): Die Mandate werden
// nur gedruckt, nichts wird gespeichert. Ohne Browser-/Server-Abhängigkeiten, damit auch Client-Komponenten sie nutzen.

/** Gläubigerangaben im Formular; stehen nicht im Quelltext, sondern am Objekt (Seite „Objekt“) und werden dort vorbelegt. */
export const GLAEUBIGER_LEER = {
  zahlungsempfaenger: "",
  zahlungsempfaengerAnschrift: "", // optional
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

/**
 * Gläubiger-ID (SEPA Creditor Identifier): Ländercode, zwei Prüfziffern, Geschäftsbereichskennung (3 Zeichen, meist
 * "ZZZ"), nationale Kennung. Die Prüfziffer wird wie bei der IBAN über Modulo 97 berechnet — der Geschäftsbereich
 * (Stellen 5–7) zählt nicht mit. Leerzeichen und Kleinschreibung werden ignoriert.
 */
export function glaeubigerIdGueltig(eingabe: string): boolean {
  const id = eingabe.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{3}[A-Z0-9]{1,28}$/.test(id) || id.length > 35) return false;
  const umgestellt = id.slice(7) + id.slice(0, 2) + "00";
  const ziffern = [...umgestellt].map((c) => (/\d/.test(c) ? c : String(c.charCodeAt(0) - 55))).join("");
  let rest = 0;
  for (const z of ziffern) rest = (rest * 10 + Number(z)) % 97;
  return 98 - rest === Number(id.slice(2, 4));
}
