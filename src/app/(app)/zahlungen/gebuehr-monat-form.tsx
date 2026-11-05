"use client";

import { useActionState, useState } from "react";
import { aendereGebuehrMonat } from "./actions";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

/**
 * Monat, unter dem eine Gebühren-Forderung oder Gebühren-Zahlung im Mieterkonto steht (z.B. die Rücklastschriftgebühr
 * beim Mietmonat der geplatzten Lastschrift). Ändern = Storno + Neuanlage; „nach Datum“ setzt den Monat zurück.
 */
export function GebuehrMonatForm({
  buchungId,
  datum,
  periodeMonat,
  periodeJahr,
  bearbeitbar,
}: {
  buchungId: string;
  datum: Date;
  periodeMonat: number | null;
  periodeJahr: number | null;
  bearbeitbar: boolean;
}) {
  const [meldung, formAction, pending] = useActionState(aendereGebuehrMonat.bind(null, buchungId), null);
  const [monat, setMonat] = useState(periodeMonat ? String(periodeMonat) : "");
  const [jahr, setJahr] = useState(String(periodeJahr ?? datum.getFullYear()));
  const aktuell =
    periodeMonat && periodeJahr === datum.getFullYear()
      ? `${MONATE[periodeMonat - 1]} ${periodeJahr}`
      : `nach Datum (${MONATE[datum.getMonth()]} ${datum.getFullYear()})`;
  const geaendert = monat !== (periodeMonat ? String(periodeMonat) : "") || (monat !== "" && jahr !== String(periodeJahr ?? ""));

  return (
    <div className="mt-4 max-w-xl rounded-lg border border-neutral-800 p-4 text-sm">
      <p className="flex justify-between">
        <span className="text-neutral-400">Im Mieterkonto unter</span>
        <span className="text-white">{aktuell}</span>
      </p>
      {bearbeitbar && (
        <form action={formAction} className="mt-3 flex flex-wrap items-center gap-2">
          <select
            name="periodeMonat"
            value={monat}
            onChange={(e) => setMonat(e.target.value)}
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
          >
            <option value="" className="bg-neutral-900">
              nach Datum
            </option>
            {MONATE.map((name, idx) => (
              <option key={name} value={idx + 1} className="bg-neutral-900">
                {name}
              </option>
            ))}
          </select>
          {monat !== "" && (
            <input
              type="number"
              name="periodeJahr"
              value={jahr}
              onChange={(e) => setJahr(e.target.value)}
              className="w-20 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          )}
          <button
            type="submit"
            disabled={pending || !geaendert}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Monat ändern"}
          </button>
        </form>
      )}
      {meldung && <p className="mt-2 text-sm text-red-400">{meldung}</p>}
      <p className="mt-2 text-xs text-neutral-500">
        Nur die Einordnung im Mieterkonto (innerhalb des Jahres des Datums) — Saldo, offene Gebühren und
        Jahresübersicht rechnen weiter nach dem Datum. Ändern storniert die Buchung und legt sie mit dem neuen Monat neu an.
      </p>
    </div>
  );
}
