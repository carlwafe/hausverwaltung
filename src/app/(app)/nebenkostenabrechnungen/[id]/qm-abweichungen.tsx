"use client";

import { useActionState, useState } from "react";
import { DeleteButton } from "@/components/delete-button";
import { runFormAction } from "@/lib/form-utils";
import { speichereQmAbweichung, loescheQmAbweichung } from "../actions";

function formatQm(value: number) {
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(value)} m²`;
}

export type QmKostenkreis = { value: string; label: string; qmEcht: number };
export type QmAbweichungZeile = { id: string; label: string; qmEcht: number | null; qmVerwalter: number };

/**
 * Vergleichsrechnung "wie der Verwalter": pro Kostenkreis die vom Verwalter angesetzte (abweichende)
 * Gesamtwohnfläche eintragen. Die Positionstabelle zeigt dann zusätzlich den Kostenanteil mit diesen
 * Flächen — die echte, gespeicherte Abrechnung bleibt unverändert.
 */
export function QmAbweichungen({
  abrechnungId,
  kostenkreise,
  abweichungen,
}: {
  abrechnungId: string;
  kostenkreise: QmKostenkreis[];
  abweichungen: QmAbweichungZeile[];
}) {
  const [fehler, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) =>
      runFormAction(speichereQmAbweichung.bind(null, abrechnungId), formData),
    null,
  );
  const [kreis, setKreis] = useState("");
  const echt = kostenkreise.find((k) => k.value === kreis)?.qmEcht;

  return (
    <details className="mb-6" open={abweichungen.length > 0}>
      <summary className="cursor-pointer select-none text-sm font-medium text-neutral-300 hover:text-white">
        Vergleich mit dem Verwalter: abweichende Gesamtfläche je Kostenkreis ({abweichungen.length})
      </summary>
      <p className="mb-3 mt-2 text-xs text-neutral-500">
        Hat der Verwalter für einen Kostenkreis eine falsche Gesamtwohnfläche angesetzt, trag sie hier ein. In der
        Positionstabelle erscheint dann zusätzlich der Kostenanteil mit dieser Fläche zum Vergleich — die
        gespeicherte Abrechnung ändert sich dadurch nicht.
      </p>

      {abweichungen.length > 0 && (
        <table className="mb-3 w-full max-w-2xl text-sm">
          <thead className="text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="py-1 pr-3">Kostenkreis</th>
              <th className="py-1 pr-3 text-right">Unsere Fläche</th>
              <th className="py-1 pr-3 text-right">Fläche Verwalter</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {abweichungen.map((a) => (
              <tr key={a.id} className="border-t border-neutral-800">
                <td className="py-1.5 pr-3 text-white">{a.label}</td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right text-neutral-400">
                  {a.qmEcht !== null ? formatQm(a.qmEcht) : "–"}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right text-amber-400">{formatQm(a.qmVerwalter)}</td>
                <td className="py-1.5 text-right">
                  <DeleteButton
                    action={loescheQmAbweichung.bind(null, a.id, abrechnungId)}
                    confirmText="Diese Abweichung entfernen?"
                    size="sm"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="kostenkreis">
            Kostenkreis
          </label>
          <select
            id="kostenkreis"
            name="kostenkreis"
            required
            value={kreis}
            onChange={(e) => setKreis(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {kostenkreise.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label} — {formatQm(k.qmEcht)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-neutral-400" htmlFor="qmGesamt">
            Gesamtfläche laut Verwalter (m²)
          </label>
          <input
            id="qmGesamt"
            name="qmGesamt"
            type="number"
            step="0.001"
            min="0"
            required
            placeholder={echt ? String(echt) : "z.B. 489,466"}
            className="w-44 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Speichere…" : "Speichern"}
        </button>
        {fehler && <p className="w-full text-sm text-red-400">{fehler}</p>}
      </form>
    </details>
  );
}
