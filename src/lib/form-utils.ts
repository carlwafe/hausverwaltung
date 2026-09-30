export function isRedirectError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "digest" in err &&
    typeof (err as { digest?: unknown }).digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT")
  );
}

/** Server Action für `runFormAction`: liefert bei erwartbaren Fehlern die Meldung (siehe `mitMeldung` in `aktion.ts`). */
export type FormAktion = (formData: FormData) => Promise<string | void>;

export async function runFormAction(action: FormAktion, formData: FormData): Promise<string | null> {
  try {
    const meldung = await action(formData);
    return typeof meldung === "string" ? meldung : null;
  } catch (err) {
    if (isRedirectError(err)) throw err;
    // In Produktion enthält ein geworfener Fehler aus einer Server Action keine Meldung mehr —
    // erwartbare Fehler kommen deshalb als Rückgabewert (AktionsFehler + mitMeldung).
    if (process.env.NODE_ENV === "production") {
      return "Unerwarteter Fehler beim Speichern. Bitte erneut versuchen.";
    }
    return err instanceof Error ? err.message : "Unbekannter Fehler";
  }
}
