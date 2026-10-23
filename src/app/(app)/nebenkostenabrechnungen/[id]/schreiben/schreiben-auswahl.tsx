"use client";

import { useMemo, useState } from "react";
import { DateInput } from "@/components/date-input";

export type SchreibenZeile = {
  mietvertragId: string;
  wohnung: string;
  mieter: string;
  beendet: boolean;
  kostenanteil: number;
  vorauszahlung: number;
  /** Wie in der Abrechnung: positiv = Guthaben, negativ = Nachzahlung. */
  saldo: number;
  /** false = manuelle Position ohne Aufschlüsselung (kein Schreiben möglich). */
  moeglich: boolean;
};

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const knopf = "rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900";

export function SchreibenAuswahl({
  abrechnungId,
  heute,
  frist: fristStart,
  zeilen,
}: {
  abrechnungId: string;
  heute: string;
  frist: string;
  zeilen: SchreibenZeile[];
}) {
  const [datum, setDatum] = useState(heute);
  const [frist, setFrist] = useState(fristStart);
  const [auswahl, setAuswahl] = useState<Set<string>>(new Set());
  const moegliche = useMemo(() => zeilen.filter((z) => z.moeglich), [zeilen]);

  const url = (ids?: string[]) => {
    const p = new URLSearchParams({ abrechnung: abrechnungId, datum });
    if (frist) p.set("frist", frist);
    if (ids?.length) p.set("mietvertrag", ids.join(","));
    return `/api/nebenkostenabrechnung/schreiben?${p.toString()}`;
  };
  const umschalten = (id: string) =>
    setAuswahl((alt) => {
      const neu = new Set(alt);
      if (neu.has(id)) neu.delete(id);
      else neu.add(id);
      return neu;
    });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-6">
        <div>
          <p className="mb-1 text-xs text-neutral-400">Briefdatum</p>
          <DateInput value={datum} onChange={(v) => v && setDatum(v)} size="sm" />
        </div>
        <div>
          <p className="mb-1 text-xs text-neutral-400">Zahlungsfrist Nachzahlung</p>
          <DateInput value={frist} onChange={setFrist} size="sm" />
        </div>
        <a href={url()} target="_blank" rel="noreferrer" className={knopf}>
          Alle {moegliche.length} als eine PDF
        </a>
        <a
          href={url([...auswahl])}
          target="_blank"
          rel="noreferrer"
          aria-disabled={auswahl.size === 0}
          className={`${knopf} ${auswahl.size === 0 ? "pointer-events-none opacity-40" : ""}`}
        >
          Ausgewählte ({auswahl.size}) als eine PDF
        </a>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs text-neutral-400">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  aria-label="Alle auswählen"
                  checked={moegliche.length > 0 && auswahl.size === moegliche.length}
                  onChange={(e) => setAuswahl(e.target.checked ? new Set(moegliche.map((z) => z.mietvertragId)) : new Set())}
                />
              </th>
              <th className="px-3 py-2">Wohnung</th>
              <th className="px-3 py-2">Mieter</th>
              <th className="px-3 py-2 text-right">Kostenanteil</th>
              <th className="px-3 py-2 text-right">Vorauszahlung</th>
              <th className="px-3 py-2 text-right">Ergebnis</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.mietvertragId} className={`border-t border-neutral-800 ${z.moeglich ? "" : "opacity-50"}`}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`${z.wohnung} auswählen`}
                    disabled={!z.moeglich}
                    checked={auswahl.has(z.mietvertragId)}
                    onChange={() => umschalten(z.mietvertragId)}
                  />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{z.wohnung}</td>
                <td className="px-3 py-2 text-white">
                  {z.mieter}
                  {z.beendet && <span className="ml-2 text-xs text-amber-400">ausgezogen – Anschrift ergänzen</span>}
                </td>
                <td className="px-3 py-2 text-right text-neutral-300">{euro(z.kostenanteil)}</td>
                <td className="px-3 py-2 text-right text-neutral-300">{euro(z.vorauszahlung)}</td>
                <td className={`whitespace-nowrap px-3 py-2 text-right ${z.saldo < -0.005 ? "text-red-400" : "text-green-400"}`}>
                  {Math.abs(z.saldo) < 0.005 ? "ausgeglichen" : z.saldo < 0 ? `Nachzahlung ${euro(-z.saldo)}` : `Guthaben ${euro(z.saldo)}`}
                </td>
                <td className="px-3 py-2 text-right">
                  {z.moeglich ? (
                    <a href={url([z.mietvertragId])} target="_blank" rel="noreferrer" className="text-neutral-300 underline hover:text-white">
                      PDF
                    </a>
                  ) : (
                    <span className="text-xs text-neutral-500">manuelle Position</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 max-w-3xl text-xs text-neutral-500">
        Ein ausgezogener Mieter bekommt im Anschriftfeld den Platzhalter „[neue Anschrift ergänzen]“ — die neue Anschrift steht
        nicht in der App. Für solche Fälle oder besondere Texte gibt es das Skript <code>scripts-tmp/nk-schreiben.ts</code>.
        Nach dem Versand die Kopie in der Mieterakte ablegen (Dokumente, Art „Schreiben“) und auf der Abrechnungsseite „Als versendet markieren“.
      </p>
    </div>
  );
}
