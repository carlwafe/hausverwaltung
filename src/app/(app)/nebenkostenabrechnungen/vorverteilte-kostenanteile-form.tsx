"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { speichereVorverteilteKostenanteile } from "./actions";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type VorverteilteZeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  zeitraumVon: string; // ISO
  zeitraumBis: string; // ISO
  betrag: number | null;
};

/**
 * Eine Tabelle pro Kostenart mit Verteilerschlüssel VORVERTEILT (z.B. "Heizkosten Haus 2-12") —
 * eine Zeile pro Mietvertrag/Zeitraum dieser Abrechnung (deckt einen unterjährigen Mieterwechsel
 * korrekt ab, da Techem selbst schon pro Nutzungszeitraum aufteilt). Wirkt erst nach dem
 * bestehenden "Neu berechnen"-Button auf die Positionen, genau wie bei den Verbrauchswerten.
 */
export function VorverteilteKostenanteileForm({
  jahr,
  kostenartId,
  kostenartName,
  zeilen,
}: {
  jahr: number;
  kostenartId: string;
  kostenartName: string;
  zeilen: VorverteilteZeile[];
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereVorverteilteKostenanteile, formData),
    null,
  );

  return (
    <form action={formAction} className="mb-4 rounded-lg border border-neutral-800 p-4">
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="kostenartId" value={kostenartId} />
      <p className="mb-3 text-sm font-medium text-white">{kostenartName}</p>
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Zeitraum</th>
              <th className="px-4 py-2 text-right">Betrag (€)</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.mietvertragId} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-white">
                  {z.einheitBezeichnung}
                  <input type="hidden" name="mietvertragId" value={z.mietvertragId} />
                </td>
                <td className="px-4 py-2 text-neutral-300">{z.mieterNamen}</td>
                <td className="px-4 py-2 text-neutral-300">
                  {formatDate(z.zeitraumVon)} – {formatDate(z.zeitraumBis)}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`betrag_${z.mietvertragId}`}
                    defaultValue={z.betrag ?? ""}
                    placeholder="aus Techem-PDF"
                    className="w-32 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-neutral-400"
                  />
                </td>
              </tr>
            ))}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Keine Mietverträge für diese Kostenart in {jahr}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || zeilen.length === 0}
        className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
