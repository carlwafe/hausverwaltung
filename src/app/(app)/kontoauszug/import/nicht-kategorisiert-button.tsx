"use client";

import { useActionState, useEffect } from "react";
import { parkeAlsNichtKategorisiert } from "./actions";

/**
 * Pro Zeile in jeder der 5 Import-Sektionen: eine Buchung, die sich nicht sofort klar zuordnen
 * lässt, explizit als "nicht kategorisiert" parken (siehe NichtZugeordneteBuchung) — unabhängig
 * von der normalen Mehrfachauswahl-Checkbox/dem Zuordnungs-Dropdown dieser Zeile. Erscheint danach
 * oben auf /kosten zur späteren Auflösung.
 */
export function NichtKategorisiertButton({
  datum,
  betrag,
  empfaenger,
  verwendungszweck,
  rohdaten,
  importBatchId,
  quelle,
  bereitsGemerkt,
  onParked,
  symbol = false,
}: {
  datum: string | null;
  betrag: number | null;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Record<string, string>;
  importBatchId: string;
  quelle: string;
  bereitsGemerkt: boolean;
  onParked: () => void;
  /** Nur ein Symbol statt Text (schmale Aktions-Spalte der Import-Tabelle am Computer). */
  symbol?: boolean;
}) {
  const [message, formAction, pending] = useActionState(async () => {
    if (datum === null || betrag === null) return null;
    return parkeAlsNichtKategorisiert(
      { datum, betrag, empfaenger: empfaenger || null, verwendungszweck: verwendungszweck || null, rohdaten, importBatchId },
      quelle,
    );
  }, null);

  useEffect(() => {
    if (message) onParked();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (bereitsGemerkt) {
    if (symbol) {
      return (
        <span
          title="Bereits als nicht kategorisiert gemerkt"
          aria-label="Bereits als nicht kategorisiert gemerkt"
          className="flex h-7 w-7 items-center justify-center text-green-400"
        >
          ✓
        </span>
      );
    }
    return <span className="whitespace-nowrap text-xs text-green-400">Bereits gemerkt</span>;
  }
  if (datum === null || betrag === null) return null;

  const titel = "Nicht kategorisiert importieren: Buchung ohne Zuordnung parken — erscheint danach oben auf /kosten zur späteren Klärung";
  if (symbol) {
    return (
      <form action={formAction}>
        <button
          type="submit"
          disabled={pending}
          title={titel}
          aria-label="Nicht kategorisiert importieren"
          className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
        >
          {pending ? (
            "…"
          ) : (
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-4 w-4">
              <path d="M3 11.5h4l1 2h4l1-2h4" strokeLinejoin="round" />
              <path d="M5 4.5h10l2 7v4h-14v-4z" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      </form>
    );
  }

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        title="Diese Buchung ohne Zuordnung parken — erscheint danach oben auf /kosten zur späteren Klärung"
        className="whitespace-nowrap rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 disabled:opacity-50"
      >
        {pending ? "…" : "Nicht kategorisiert importieren"}
      </button>
    </form>
  );
}
