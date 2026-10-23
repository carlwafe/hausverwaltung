"use client";

import { useState, useTransition } from "react";
import { speichereMietvertragNotiz } from "../actions";
import { MAX_MIETVERTRAG_NOTIZ } from "@/lib/mietvertrag-notiz";

/**
 * Interne Notiz zum Mietvertrag (z.B. weitere Bewohner, die nicht im Vertrag stehen). Hält ihren Zustand
 * selbst (die Aktion lädt die schwere Vertragsseite nicht neu). Gäste sehen sie nur; ohne Notiz blenden
 * sie die Box ganz aus.
 */
export function MietvertragNotiz({
  mietvertragId,
  notiz,
  bearbeitbar,
}: {
  mietvertragId: string;
  notiz: string;
  bearbeitbar: boolean;
}) {
  const [wert, setWert] = useState(notiz);
  const [gespeichert, setGespeichert] = useState(notiz);
  const [meldung, setMeldung] = useState<{ fehler: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!bearbeitbar && !notiz) return null;

  const geaendert = wert.trim() !== gespeichert.trim();

  function speichern() {
    setMeldung(null);
    startTransition(async () => {
      try {
        const fehler = await speichereMietvertragNotiz(mietvertragId, wert);
        if (fehler) {
          setMeldung({ fehler: true, text: fehler });
          return;
        }
        const bereinigt = wert.trim();
        setWert(bereinigt);
        setGespeichert(bereinigt);
        setMeldung({ fehler: false, text: bereinigt ? "Notiz gespeichert." : "Notiz entfernt." });
      } catch {
        setMeldung({ fehler: true, text: "Speichern fehlgeschlagen. Bitte erneut versuchen." });
      }
    });
  }

  return (
    <div className="my-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">Notiz</p>
      {bearbeitbar ? (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            Interne Notiz zu diesem Mietvertrag (z.B. weitere Bewohner, die nicht im Vertrag stehen). Ändert nichts an
            Beträgen oder Berechnungen; leer speichern entfernt die Notiz.
          </p>
          <textarea
            value={wert}
            onChange={(e) => {
              setWert(e.target.value);
              setMeldung(null);
            }}
            rows={3}
            maxLength={MAX_MIETVERTRAG_NOTIZ}
            disabled={isPending}
            placeholder="Notiz…"
            className="block w-full resize-y rounded-md border border-neutral-800 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={speichern}
              disabled={isPending || !geaendert}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {isPending ? "Speichern…" : "Notiz speichern"}
            </button>
            {meldung && (
              <span className={`text-xs ${meldung.fehler ? "text-red-400" : "text-green-400"}`}>{meldung.text}</span>
            )}
          </div>
        </>
      ) : (
        <p className="whitespace-pre-wrap text-sm text-neutral-200">{notiz}</p>
      )}
    </div>
  );
}
