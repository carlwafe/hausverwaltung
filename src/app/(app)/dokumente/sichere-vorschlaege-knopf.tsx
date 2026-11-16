"use client";

import { useState, useTransition } from "react";
import { uebernehmeSichereVorschlaege } from "./actions";

// Sammelbestätigung im Eingang: ordnet alle Dokumente zu, bei denen es genau eine sichere Kostenposition
// gibt (Betrag stimmt, dazu Rechnungsnummer bzw. Empfänger und Datum). Alles andere bleibt zur Prüfung stehen.
export function SichereVorschlaegeKnopf() {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        title="„Sicher“ = Betrag stimmt und Rechnungsnummer (oder Aussteller/IBAN plus Zahlungsdatum) passt, nur bei genau einem Treffer. Alles andere ordnest du auf der Detailseite zu."
        disabled={pending}
        onClick={() => {
          if (!confirm("Alle Dokumente zuordnen, für die es genau eine sichere Kostenposition gibt?")) return;
          setMeldung(null);
          startTransition(async () => {
            const fehler = await uebernehmeSichereVorschlaege();
            setMeldung(typeof fehler === "string" ? fehler : "Fertig. Die zugeordneten Dokumente liegen jetzt an ihren Kostenpositionen.");
          });
        }}
        className="h-10 rounded-md border border-neutral-700 px-3 font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Ordnet zu…" : "Sichere Vorschläge übernehmen"}
      </button>
      {meldung && <span className="text-xs text-neutral-300">{meldung}</span>}
    </div>
  );
}
