"use client";

import { useState, useTransition } from "react";
import { pruefeEingangPerKi } from "./actions";

// Zweite Stufe der Erkennung im Eingang: Die Regeln lesen beim Hochladen lokal; was sie nicht sicher erkannt haben (Scan,
// Bild, mehrdeutige Beträge, Sammel-PDF), prüft hier die KI (Claude) — erst auf Klick, die Dokumente gehen dafür an Anthropic.
export function KiPruefungKnopf({ anzahl }: { anzahl: number }) {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <button
        type="button"
        title="Die Regeln beim Hochladen haben diese Dokumente nicht sicher erkannt. Vertrag, Schreiben, Protokoll und Foto sind ausgenommen – die startest du am einzelnen Dokument."
        disabled={pending}
        onClick={() => {
          if (!confirm(`${anzahl} nicht erkannte Dokumente (höchstens 6 pro Klick) zum Lesen an die KI (Anthropic) senden?`)) return;
          setMeldung(null);
          startTransition(async () => {
            const fehler = await pruefeEingangPerKi();
            setMeldung(typeof fehler === "string" ? fehler : "Fertig.");
          });
        }}
        className="h-10 rounded-md border border-neutral-700 px-3 font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "KI liest…" : `Nicht erkannte per KI prüfen (${anzahl})`}
      </button>
      {meldung && <span className="text-xs text-neutral-300">{meldung}</span>}
    </div>
  );
}
