"use client";

import { useState } from "react";
import type { MieterkontoJahr } from "@/lib/mieterkonto";
import type { Kautionskonto } from "@/lib/kautionskonto";
import { MieterkontoAnsicht } from "./mieterkonto-ansicht";
import { NebenkostenAnsicht, type NkJahrDaten } from "./nebenkosten-ansicht";
import { KautionAnsicht } from "./kaution-ansicht";

type Reiter = "mieterkonto" | "nebenkosten" | "kaution";

const REITER: { id: Reiter; label: string }[] = [
  { id: "mieterkonto", label: "Mieterkonto" },
  { id: "nebenkosten", label: "Nebenkostenabrechnung" },
  { id: "kaution", label: "Kautionsabrechnung" },
];

/**
 * Reiterleiste der Mietvertragsseite: Mieterkonto, Nebenkostenabrechnung und Kaution — immer nur
 * eine Tabelle sichtbar. Bei Mieterkonto und Nebenkostenabrechnung sitzt die Jahresauswahl mit in
 * der Leiste (je Reiter eigenes Jahr, weil die verfügbaren Jahre verschieden sind). Alle Daten
 * kommen fertig vom Server, der Wechsel passiert nur im Browser.
 */
export function MietvertragReiter({
  mietvertragId,
  kontoJahre,
  konten,
  standardKontoJahr,
  stichtagAb,
  nkJahre,
  nkDaten,
  kaution,
  kopf,
}: {
  mietvertragId: string;
  // Absteigend sortiert (neuestes Jahr zuerst).
  kontoJahre: number[];
  konten: Record<number, MieterkontoJahr>;
  standardKontoJahr: number;
  stichtagAb: { jahr: number; datum: string } | null;
  // Abrechnungsjahre mit einer Position für diesen Mietvertrag, absteigend.
  nkJahre: number[];
  nkDaten: Record<number, NkJahrDaten>;
  kaution: { konto: Kautionskonto; anlageform: string | null; zinssatz: number | null; mietende: Date | null };
  kopf: { mieter: string; einheit: string; wohnflaeche: number; mietbeginn: Date | null };
}) {
  const [reiter, setReiter] = useState<Reiter>("mieterkonto");
  const [kontoJahr, setKontoJahr] = useState(kontoJahre.includes(standardKontoJahr) ? standardKontoJahr : kontoJahre[0]);
  const [nkJahr, setNkJahr] = useState<number | null>(nkJahre[0] ?? null);

  const jahrAuswahl =
    reiter === "mieterkonto"
      ? { jahre: kontoJahre, wert: kontoJahr, setzen: setKontoJahr }
      : reiter === "nebenkosten" && nkJahr !== null
        ? { jahre: nkJahre, wert: nkJahr, setzen: setNkJahr }
        : null;

  return (
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-neutral-800">
        <div role="tablist" className="flex gap-1">
          {REITER.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={reiter === r.id}
              onClick={() => setReiter(r.id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                reiter === r.id
                  ? "border-white text-white"
                  : "border-transparent text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {jahrAuswahl && (
          <label className="mb-1.5 flex items-center gap-2 text-sm text-neutral-400">
            Jahr
            <select
              value={jahrAuswahl.wert}
              onChange={(e) => jahrAuswahl.setzen(Number(e.target.value))}
              aria-label="Jahr wählen"
              className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm font-medium text-white outline-none focus:border-neutral-400"
            >
              {jahrAuswahl.jahre.map((j) => (
                <option key={j} value={j}>
                  {j}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {reiter === "mieterkonto" && (
        <MieterkontoAnsicht mietvertragId={mietvertragId} jahr={kontoJahr} konto={konten[kontoJahr]} stichtagAb={stichtagAb} />
      )}
      {reiter === "nebenkosten" && <NebenkostenAnsicht jahr={nkJahr} daten={nkJahr !== null ? nkDaten[nkJahr] ?? null : null} kopf={kopf} />}
      {reiter === "kaution" && (
        <KautionAnsicht
          konto={kaution.konto}
          anlageform={kaution.anlageform}
          zinssatz={kaution.zinssatz}
          mietende={kaution.mietende}
          kopf={kopf}
        />
      )}
    </div>
  );
}
