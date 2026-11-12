"use client";

import { useState } from "react";
import type { MieterkontoJahr } from "@/lib/mieterkonto";
import type { Kautionskonto } from "@/lib/kautionskonto";
import { MieterkontoAnsicht } from "./mieterkonto-ansicht";
import { NebenkostenAnsicht, type NkJahrDaten } from "./nebenkosten-ansicht";
import { KautionAnsicht } from "./kaution-ansicht";

type Reiter = "mieterkonto" | "nebenkosten" | "kaution";

// Symbole (Heroicons-Umrisse), damit die Reiter als Navigation auffallen und nicht wie Überschriften wirken.
const SYMBOLE: Record<Reiter, string> = {
  mieterkonto: "M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z",
  nebenkosten: "M15.75 15.75V18m-7.5-6.75h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V13.5Zm0 2.25h.008v.008H8.25v-.008Zm0 2.25h.008v.008H8.25V18Zm2.498-6.75h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V13.5Zm0 2.25h.007v.008h-.007v-.008Zm0 2.25h.007v.008h-.007V18Zm2.504-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5Zm0 2.25h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V18Zm2.498-6.75h.008v.008h-.008v-.008Zm0 2.25h.008v.008h-.008V13.5ZM8.25 6h7.5v2.25h-7.5V6ZM12 2.25c-1.892 0-3.758.11-5.593.322C5.307 2.7 4.5 3.65 4.5 4.757V19.5a2.25 2.25 0 0 0 2.25 2.25h10.5a2.25 2.25 0 0 0 2.25-2.25V4.757c0-1.108-.806-2.057-1.907-2.185A48.507 48.507 0 0 0 12 2.25Z",
  kaution: "M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z",
};

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
  kaution: { konto: Kautionskonto; anlageform: string | null; mietende: Date | null };
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
        <div role="tablist" className="flex flex-wrap gap-1.5">
          {REITER.map((r) => (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={reiter === r.id}
              onClick={() => setReiter(r.id)}
              className={`-mb-px flex items-center gap-2 rounded-t-lg border px-5 py-3 text-base font-semibold transition-colors ${
                reiter === r.id
                  ? "border-neutral-700 border-b-neutral-950 bg-neutral-950 text-white"
                  : "border-neutral-800 bg-neutral-900 text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800 hover:text-white"
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 shrink-0"
                aria-hidden="true"
              >
                <path d={SYMBOLE[r.id]} />
              </svg>
              {r.label}
            </button>
          ))}
        </div>
        {jahrAuswahl && (
          <label className="mb-2 flex items-center gap-2 text-sm text-neutral-400">
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
      {reiter === "nebenkosten" && (
        <NebenkostenAnsicht
          jahr={nkJahr}
          daten={nkJahr !== null ? nkDaten[nkJahr] ?? null : null}
          kopf={kopf}
          // Link zur Anpassung der Vorauszahlung nur bei der neuesten Abrechnung.
          mietvertragId={nkJahr === nkJahre[0] ? mietvertragId : null}
        />
      )}
      {reiter === "kaution" && (
        <KautionAnsicht
          konto={kaution.konto}
          anlageform={kaution.anlageform}
          mietende={kaution.mietende}
          kopf={kopf}
        />
      )}
    </div>
  );
}
