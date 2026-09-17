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
    return <span className="whitespace-nowrap text-xs text-green-400">Bereits gemerkt</span>;
  }
  if (datum === null || betrag === null) return null;

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
