"use client";

import { useActionState, useState } from "react";
import { speichereAnreden } from "../actions";
import { mieterName, mieterNameNachnameZuerst } from "@/lib/mieter-name";

type Zeile = { id: string; anrede: "FRAU" | "HERR" | null; vorname: string; nachname: string; einheiten: string[] };

export function AnredeListe({ zeilen }: { zeilen: Zeile[] }) {
  const [nurOhne, setNurOhne] = useState(true);
  // Beim Filtern bleiben ausgeblendete Zeilen im Formular (nur versteckt), damit schon gewählte
  // Werte beim Speichern nicht verloren gehen.
  const [werte, setWerte] = useState<Record<string, string>>(() =>
    Object.fromEntries(zeilen.map((z) => [z.id, z.anrede ?? ""])),
  );
  const [meldung, formAction, pending] = useActionState(
    async (_prev: string | null, formData: FormData) => {
      try {
        return await speichereAnreden(formData);
      } catch (err) {
        return err instanceof Error ? err.message : "Unbekannter Fehler";
      }
    },
    null,
  );
  const geaendert = zeilen.filter((z) => (z.anrede ?? "") !== werte[z.id]).length;

  return (
    <form action={formAction}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" checked={nurOhne} onChange={(e) => setNurOhne(e.target.checked)} className="h-4 w-4" />
          nur Mieter ohne Anrede zeigen
        </label>
        <div className="flex items-center gap-3">
          {meldung && <p className="text-sm text-neutral-300">{meldung}</p>}
          <button
            type="submit"
            disabled={pending || geaendert === 0}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? "Speichern…" : `${geaendert} Änderung${geaendert === 1 ? "" : "en"} speichern`}
          </button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5">Name</th>
              <th className="px-4 py-2.5">Einheit (aktiv)</th>
              <th className="px-4 py-2.5">Anrede</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.id} className={`border-t border-neutral-800 ${nurOhne && z.anrede !== null ? "hidden" : ""}`}>
                <td className="px-4 py-2 text-white">
                  {mieterNameNachnameZuerst(z)}
                </td>
                <td className="px-4 py-2 text-neutral-400">{z.einheiten.join(", ") || "–"}</td>
                <td className="px-4 py-1.5">
                  <div className="flex gap-1" role="radiogroup" aria-label={`Anrede ${mieterName(z)}`}>
                    {[
                      ["FRAU", "Frau"],
                      ["HERR", "Herr"],
                      ["", "keine"],
                    ].map(([wert, label]) => (
                      <label
                        key={wert}
                        className={`cursor-pointer rounded-md border px-3 py-1 text-xs ${
                          werte[z.id] === wert
                            ? "border-white bg-white text-black"
                            : "border-neutral-700 text-neutral-300 hover:border-neutral-500"
                        }`}
                      >
                        <input
                          type="radio"
                          name={`anrede_${z.id}`}
                          value={wert}
                          checked={werte[z.id] === wert}
                          onChange={() => setWerte((w) => ({ ...w, [z.id]: wert }))}
                          className="sr-only"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
