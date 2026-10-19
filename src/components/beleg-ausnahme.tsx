"use client";

import { useState, useTransition } from "react";
import { BelegBadge } from "@/components/beleg-badge";
import { MAX_BELEG_AUSNAHME_GRUND, type BelegStatus } from "@/lib/beleg-anzeige";
import { setzeBelegAusnahme, entferneBelegAusnahme } from "@/app/(app)/kosten/actions";

/**
 * Belegstatus einer Kostenposition für die Nebenkostenabrechnung (Detailseite der Kostenposition): Der Mieter darf die
 * Belege einsehen, deshalb braucht jede umlagefähige Position ein Dokument — oder die ausdrückliche Markierung „Kein
 * Beleg nötig“ mit Grund. Hält den Zustand selbst (die Aktionen laden die Seite nicht neu).
 */
export function BelegAusnahme({
  buchungId,
  status: startStatus,
  grund: startGrund,
  gesetztVon,
  ueberAndereTeile,
  bearbeitbar,
}: {
  buchungId: string;
  status: BelegStatus;
  grund: string;
  gesetztVon: string;
  /** Belegt, aber nur über ein Dokument an einem anderen Teil derselben Aufteilung. */
  ueberAndereTeile: boolean;
  bearbeitbar: boolean;
}) {
  const [status, setStatus] = useState<BelegStatus>(startStatus);
  const [grund, setGrund] = useState(startGrund);
  const [eingabe, setEingabe] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Nicht umlagefähig bzw. in der Techem-Abrechnung enthalten: nichts zu prüfen, keine Box.
  if (status === "ENTFAELLT") return null;

  function setzen() {
    setFehler(null);
    startTransition(async () => {
      try {
        const meldung = await setzeBelegAusnahme(buchungId, eingabe);
        if (meldung) {
          setFehler(meldung);
          return;
        }
        setGrund(eingabe.trim());
        setStatus("AUSNAHME");
      } catch {
        setFehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  function entfernen() {
    setFehler(null);
    startTransition(async () => {
      try {
        const meldung = await entferneBelegAusnahme(buchungId);
        if (meldung) {
          setFehler(meldung);
          return;
        }
        setGrund("");
        setEingabe("");
        setStatus("FEHLT");
      } catch {
        setFehler("Entfernen fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="mt-6 max-w-xl rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 flex items-center gap-2 text-sm font-medium text-white">
        Beleg für die Nebenkostenabrechnung <BelegBadge status={status} />
      </p>
      <p className="text-xs text-neutral-500">
        Der Mieter darf die Belege zur Abrechnung einsehen. Umlagefähige Kostenpositionen sollten deshalb ein Dokument
        haben (Rechnung, Bescheid, Abrechnung).
      </p>
      {status === "BELEGT" && ueberAndereTeile && (
        <p className="mt-2 text-xs text-neutral-400">
          Der Beleg hängt an einem anderen Teil derselben Aufteilung und deckt diese Position mit ab.
        </p>
      )}
      {status === "AUSNAHME" && (
        <div className="mt-3">
          <p className="text-sm text-neutral-200">Kein Beleg nötig: {grund}</p>
          {gesetztVon && <p className="mt-0.5 text-xs text-neutral-500">Markiert von {gesetztVon}</p>}
          {bearbeitbar && (
            <button
              type="button"
              onClick={entfernen}
              disabled={isPending}
              className="mt-2 rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
            >
              Markierung entfernen
            </button>
          )}
        </div>
      )}
      {status === "FEHLT" && bearbeitbar && (
        <div className="mt-3">
          <p className="mb-1 text-xs text-neutral-400">
            Beleg oben hochladen oder zuordnen. Gibt es dazu bewusst kein Dokument (z.B. Pauschale), mit Grund
            markieren:
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={eingabe}
              onChange={(e) => {
                setEingabe(e.target.value);
                setFehler(null);
              }}
              maxLength={MAX_BELEG_AUSNAHME_GRUND}
              disabled={isPending}
              placeholder="Grund, z.B. Pauschale ohne Rechnung"
              className="min-w-64 flex-1 rounded-md border border-neutral-800 bg-transparent px-3 py-1.5 text-sm text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={setzen}
              disabled={isPending || !eingabe.trim()}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900 disabled:opacity-50"
            >
              Kein Beleg nötig
            </button>
          </div>
        </div>
      )}
      {fehler && <p className="mt-2 text-xs text-red-400">{fehler}</p>}
    </div>
  );
}
