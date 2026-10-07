"use client";

import { useState, useTransition } from "react";
import { speichereBuchungKommentar } from "@/app/(app)/buchungen/actions";
import { MAX_BUCHUNG_KOMMENTAR } from "@/lib/buchung-kommentar";

/**
 * Kommentar zu einer einzelnen Buchung (Detailseite der Zahlung). Buchungen sind unveränderlich, der
 * Text liegt in einer eigenen Tabelle (BuchungKommentar) und lässt sich jederzeit ändern oder durch
 * Leeren entfernen. Das Feld hält seinen Zustand selbst (die Aktion lädt die Seite nicht neu).
 * Gäste sehen den Kommentar nur; ohne Kommentar blenden sie die Box ganz aus.
 */
export function BuchungKommentar({
  buchungId,
  kommentar,
  letzteAenderung,
  bearbeitbar,
}: {
  buchungId: string;
  kommentar: string;
  /** Vorformatiert („am 07.10.2026, 14:05 von …“), leer ohne Kommentar. */
  letzteAenderung: string;
  bearbeitbar: boolean;
}) {
  const [wert, setWert] = useState(kommentar);
  const [gespeichert, setGespeichert] = useState(kommentar);
  const [aenderung, setAenderung] = useState(letzteAenderung);
  const [meldung, setMeldung] = useState<{ fehler: boolean; text: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!bearbeitbar && !kommentar) return null;

  const geaendert = wert.trim() !== gespeichert.trim();

  function speichern() {
    setMeldung(null);
    startTransition(async () => {
      try {
        const fehler = await speichereBuchungKommentar(buchungId, wert);
        if (fehler) {
          setMeldung({ fehler: true, text: fehler });
          return;
        }
        const bereinigt = wert.trim();
        setWert(bereinigt);
        setGespeichert(bereinigt);
        setAenderung(bereinigt ? "gerade eben" : "");
        setMeldung({ fehler: false, text: bereinigt ? "Kommentar gespeichert." : "Kommentar entfernt." });
      } catch {
        setMeldung({ fehler: true, text: "Speichern fehlgeschlagen. Bitte erneut versuchen." });
      }
    });
  }

  return (
    <div className="mt-4 max-w-xl rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">Kommentar</p>
      {bearbeitbar ? (
        <>
          <p className="mb-2 text-xs text-neutral-500">
            Interne Notiz zu dieser Buchung (z.B. Hintergrund, Absprache, Rückfrage). Ändert nichts an den Beträgen;
            leer speichern entfernt den Kommentar.
          </p>
          <textarea
            value={wert}
            onChange={(e) => {
              setWert(e.target.value);
              setMeldung(null);
            }}
            rows={3}
            maxLength={MAX_BUCHUNG_KOMMENTAR}
            disabled={isPending}
            placeholder="Kommentar…"
            className="block w-full resize-y rounded-md border border-neutral-800 bg-transparent px-3 py-2 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
          />
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={speichern}
              disabled={isPending || !geaendert}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {isPending ? "Speichern…" : "Kommentar speichern"}
            </button>
            {meldung ? (
              <span className={`text-xs ${meldung.fehler ? "text-red-400" : "text-green-400"}`}>{meldung.text}</span>
            ) : (
              aenderung &&
              !geaendert && <span className="text-xs text-neutral-500">Zuletzt geändert {aenderung}</span>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-neutral-200">{kommentar}</p>
          {letzteAenderung && <p className="mt-2 text-xs text-neutral-500">Zuletzt geändert {letzteAenderung}</p>}
        </>
      )}
    </div>
  );
}
