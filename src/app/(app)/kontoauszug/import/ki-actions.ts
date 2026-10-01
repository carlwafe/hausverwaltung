"use server";

import { requireEditor } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import {
  klassifiziereMitKi,
  type KiEingabeZeile,
  type KiKontext,
  type KiVorschlag,
} from "@/lib/import/ki-klassifizierung";

const MAX_ZEILEN = 80;

/** Manuell ausgelöste KI-Zweitmeinung für unsichere Import-Zeilen (nur Vorschläge, keine Buchung). */
export const kiPruefeZeilen = mitMeldung(async function kiPruefeZeilen(
  zeilen: KiEingabeZeile[],
  kontext: KiKontext,
): Promise<{ vorschlaege: KiVorschlag[] }> {
  await requireEditor();
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new AktionsFehler("KI-Prüfung nicht eingerichtet: ANTHROPIC_API_KEY fehlt in der Umgebung.");
  }
  if (zeilen.length === 0) throw new AktionsFehler("Keine Zeilen zum Prüfen.");
  if (zeilen.length > MAX_ZEILEN) {
    throw new AktionsFehler(`Bitte höchstens ${MAX_ZEILEN} Zeilen auf einmal prüfen (Filter nutzen).`);
  }
  try {
    return { vorschlaege: await klassifiziereMitKi(zeilen, kontext) };
  } catch (err) {
    console.error("KI-Prüfung fehlgeschlagen", err);
    throw new AktionsFehler("KI-Prüfung fehlgeschlagen — Details in den Server-Logs. Der Import funktioniert weiter wie gewohnt.");
  }
});
