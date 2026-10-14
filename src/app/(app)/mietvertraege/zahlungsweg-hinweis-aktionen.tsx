"use client";

import { useState, useTransition } from "react";
import { uebernehmeZahlungswegHinweis, verwerfeZahlungswegHinweis } from "./actions";

/** Knöpfe zur Warnung „Zahlungsweg prüfen“: Vorschlag übernehmen oder ausblenden. */
export function ZahlungswegHinweisAktionen({ id }: { id: string }) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function ausfuehren(aktion: (id: string) => Promise<string | null>) {
    setFehler(null);
    start(async () => setFehler(await aktion(id)));
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() => ausfuehren(uebernehmeZahlungswegHinweis)}
        className="rounded border border-amber-500/40 px-2 py-0.5 text-xs text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
      >
        Übernehmen
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => ausfuehren(verwerfeZahlungswegHinweis)}
        className="rounded border border-neutral-700 px-2 py-0.5 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
      >
        Hinweis verwerfen
      </button>
      {fehler && <span className="text-xs text-red-400">{fehler}</span>}
    </span>
  );
}
