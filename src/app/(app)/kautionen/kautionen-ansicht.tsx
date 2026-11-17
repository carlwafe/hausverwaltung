"use client";

import { useRef, useState } from "react";
import type { KautionUebersichtZeile } from "@/lib/kautionen-uebersicht";
import type { KautionPhase } from "@/lib/kaution-schritt";
import { KautionenTable } from "./kautionen-table";
import { KautionsbuchungenTable, type KautionsbuchungRow } from "./kautionsbuchungen-table";
import { NeueKautionsbuchungForm } from "./neue-kautionsbuchung-form";

export type KautionenReiter = "zu-tun" | "hinterlegt" | "erledigt" | "buchungen";

const PHASE: Record<Exclude<KautionenReiter, "buchungen">, KautionPhase> = {
  "zu-tun": "ZU_TUN",
  hinterlegt: "HINTERLEGT",
  erledigt: "ERLEDIGT",
};

/**
 * Reiter der Kautionsseite — immer nur eine Tabelle sichtbar. Der gewählte Reiter steht in der Adresse
 * (`?ansicht=`), damit „Zurück“ von einer Buchung wieder dort landet.
 */
export function KautionenAnsicht({
  startReiter,
  kautionen,
  buchungen,
  mietvertraege,
  virtuelleGutschriften,
}: {
  startReiter: KautionenReiter;
  kautionen: KautionUebersichtZeile[];
  buchungen: KautionsbuchungRow[];
  mietvertraege: { id: string; label: string }[];
  virtuelleGutschriften: { id: string; label: string; datumISO: string | null }[];
}) {
  const [reiter, setReiter] = useState<KautionenReiter>(startReiter);
  // Offenes Formular „Kautionsbuchung“; `schluessel` setzt es beim Öffnen aus einer anderen Kaution zurück.
  const [formular, setFormular] = useState<{ mietvertragId: string; schluessel: number } | null>(null);
  const formularRef = useRef<HTMLDivElement>(null);

  function wechsle(r: KautionenReiter) {
    setReiter(r);
    const url = new URL(window.location.href);
    if (r === "zu-tun") url.searchParams.delete("ansicht");
    else url.searchParams.set("ansicht", r);
    window.history.replaceState(window.history.state, "", url);
  }

  function oeffneFormular(mietvertragId: string) {
    setFormular((f) => ({ mietvertragId, schluessel: (f?.schluessel ?? 0) + 1 }));
    requestAnimationFrame(() => formularRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  const anzahl = (p: KautionPhase) => kautionen.filter((k) => k.phase === p).length;
  const REITER: { id: KautionenReiter; label: string; anzahl: number; hervorheben?: boolean }[] = [
    { id: "zu-tun", label: "Zu tun", anzahl: anzahl("ZU_TUN"), hervorheben: true },
    { id: "hinterlegt", label: "Hinterlegt", anzahl: anzahl("HINTERLEGT") },
    { id: "erledigt", label: "Erledigt", anzahl: anzahl("ERLEDIGT") },
    { id: "buchungen", label: "Alle Buchungen", anzahl: buchungen.length },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-neutral-800">
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {REITER.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={reiter === r.id}
              onClick={() => wechsle(r.id)}
              className={`-mb-px flex items-center gap-2 rounded-t-lg border px-4 py-2.5 text-sm font-semibold transition-colors ${
                reiter === r.id
                  ? "border-neutral-700 border-b-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              {r.label}
              <span
                className={`rounded-full px-1.5 text-xs font-medium ${
                  r.hervorheben && r.anzahl > 0 ? "bg-amber-500/15 text-amber-400" : "bg-neutral-800 text-neutral-400"
                }`}
              >
                {r.anzahl}
              </span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => (formular ? setFormular(null) : oeffneFormular(""))}
          className="mb-2 h-10 rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-800"
        >
          + Kautionsbuchung
        </button>
      </div>

      <div ref={formularRef} className="scroll-mt-4">
        {formular && (
          <NeueKautionsbuchungForm
            key={formular.schluessel}
            mietvertraege={mietvertraege}
            virtuelleGutschriften={virtuelleGutschriften}
            vorauswahlMietvertragId={formular.mietvertragId}
            onSchliessen={() => setFormular(null)}
          />
        )}
      </div>

      {reiter === "buchungen" ? (
        <KautionsbuchungenTable rows={buchungen} />
      ) : (
        <KautionenTable
          phase={PHASE[reiter]}
          rows={kautionen.filter((k) => k.phase === PHASE[reiter])}
          onBuchungErfassen={oeffneFormular}
        />
      )}
    </div>
  );
}
