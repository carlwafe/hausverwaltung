"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { speichereVerbrauchswerte } from "./actions";

export function VerbrauchswerteForm({
  jahr,
  kostenartId,
  masseinheit,
  einheiten,
}: {
  jahr: number;
  kostenartId: string;
  masseinheit: string | null;
  einheiten: { id: string; bezeichnung: string; adresse: string; wert: number | null }[];
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereVerbrauchswerte, formData),
    null,
  );

  return (
    <form action={formAction}>
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="kostenartId" value={kostenartId} />
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Adresse</th>
              <th className="px-4 py-2 text-right">Ablesewert{masseinheit ? ` (${masseinheit})` : ""}</th>
            </tr>
          </thead>
          <tbody>
            {einheiten.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-white">
                  {e.bezeichnung}
                  <input type="hidden" name="einheitId" value={e.id} />
                </td>
                <td className="px-4 py-2 text-neutral-300">{e.adresse}</td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`wert_${e.id}`}
                    defaultValue={e.wert ?? ""}
                    className="w-32 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-neutral-400"
                  />
                </td>
              </tr>
            ))}
            {einheiten.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                  Keine Wohnungs-Einheiten vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || einheiten.length === 0}
        className="mt-4 rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
