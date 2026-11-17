// Gemeinsame Klassen der Abrechnungsseite, damit Karten und aufklappbare Abschnitte gleich aussehen
// (Server- und Client-Komponenten nutzen sie, deshalb eine eigene Datei ohne Abhängigkeiten).

/** Karte der Schritt-Reihe oben (Belege, Schreiben, Versand). */
export const SCHRITT_KARTE = "flex flex-col rounded-lg border border-neutral-800 p-4";

/** Kleine Überschrift einer Schritt-Karte. */
export const SCHRITT_TITEL = "text-xs font-medium uppercase tracking-wide text-neutral-500";

/** Link oder Knopf in einer Schritt-Karte. */
export const SCHRITT_KNOPF =
  "inline-flex h-9 items-center whitespace-nowrap rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50";

/** Aufklappbarer Abschnitt (`<details>`) im unteren Teil der Seite. */
export const PANEL = "rounded-lg border border-neutral-800";

/** `<summary>` eines solchen Abschnitts. */
export const PANEL_KOPF = "cursor-pointer select-none px-4 py-3 text-sm font-medium text-neutral-200 hover:text-white";

/** Inhalt unter dem `<summary>`. */
export const PANEL_INHALT = "border-t border-neutral-800 px-4 py-4";
