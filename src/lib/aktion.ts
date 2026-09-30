/**
 * Erwartbare Fehler in Server Actions (Validierung, fachliche Prüfungen, Gastzugriff).
 *
 * Hintergrund: In Produktion überträgt Next/React von einem in einer Server Action geworfenen
 * Fehler nur den Digest, nicht die Meldung — im Browser kommt eine generische Meldung an
 * ("Minified React error #441" bzw. "…omitted in production builds…"). Meldungen für den Nutzer
 * müssen deshalb als Rückgabewert zum Client. Dafür `throw new AktionsFehler("…")` werfen und die
 * Aktion mit `mitMeldung(…)` umschließen; unerwartete Fehler (Prisma, Programmierfehler) bleiben
 * normale `Error`s und damit generisch.
 */
export class AktionsFehler extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AktionsFehler";
  }
}

/** Zod-Validierungsfehler als eine Meldung ("Nachname ist erforderlich, Ungültige E-Mail"). */
export function zodFehler(error: { issues: { message: string }[] }): AktionsFehler {
  return new AktionsFehler(error.issues.map((i) => i.message).join(", "));
}

/**
 * Umschließt eine Server Action: ein geworfener `AktionsFehler` wird als Meldung (string)
 * zurückgegeben statt geworfen. `redirect()`/`notFound()` und alle anderen Fehler laufen unverändert
 * durch. Verwendung in `"use server"`-Dateien:
 *
 *   export const createMieter = mitMeldung(async (formData: FormData) => { … });
 *
 * Für `void`-Aktionen ist das Ergebnis `string | void` (von `runFormAction` ausgewertet), für
 * Aktionen, die schon `string | null` liefern, bleibt es `string | null`.
 */
export function mitMeldung<A extends unknown[], R>(
  aktion: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | string> {
  return async (...args: A) => {
    try {
      return await aktion(...args);
    } catch (err) {
      if (err instanceof AktionsFehler) return err.message;
      throw err;
    }
  };
}
