"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { createAbrechnung, erstelleLeereAbrechnung } from "./actions";

// Ein Jahresfeld, zwei Wege: Der Hauptknopf berechnet, der zweite legt nur die leere Hülle an
// (eigene Aktion über `formAction` am Knopf).
export function NeueAbrechnungForm({ vorschlagJahr }: { vorschlagJahr: number | null }) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(createAbrechnung, formData),
    null,
  );
  const [errorLeer, formActionLeer, pendingLeer] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(erstelleLeereAbrechnung, formData),
    null,
  );
  // Gesteuertes Feld: React leert ungesteuerte Felder nach jeder Aktion — das Jahr soll bei einer
  // Fehlermeldung stehen bleiben.
  const [jahr, setJahr] = useState(vorschlagJahr === null ? "" : String(vorschlagJahr));
  const laeuft = pending || pendingLeer;
  const meldung = error ?? errorLeer;

  return (
    <form action={formAction}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-28">
          <label className="mb-1 block text-sm font-medium text-neutral-300" htmlFor="jahr">
            Jahr
          </label>
          <input
            id="jahr"
            name="jahr"
            type="number"
            inputMode="numeric"
            required
            min={2000}
            max={2100}
            placeholder="JJJJ"
            value={jahr}
            onChange={(e) => setJahr(e.target.value)}
            className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm text-white tabular-nums outline-none focus:border-neutral-400"
          />
        </div>
        <button
          type="submit"
          disabled={laeuft}
          className="h-10 w-full rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50 sm:w-48"
        >
          {pending ? "Berechne…" : "Abrechnung berechnen"}
        </button>
        <button
          type="submit"
          formAction={formActionLeer}
          disabled={laeuft}
          title="Legt die Abrechnung ohne Berechnung an — die Positionen trägst du danach von Hand ein."
          className="h-10 w-full rounded-md border border-neutral-700 px-4 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-50 sm:w-48"
        >
          {pendingLeer ? "Lege an…" : "Leer anlegen"}
        </button>
      </div>
      {meldung && <p className="mt-3 text-sm text-red-400">{meldung}</p>}
      <p className="mt-3 text-xs text-neutral-500">
        „Abrechnung berechnen“ verteilt die umlagefähigen Kosten des Jahres auf alle Einheiten. „Leer anlegen“ ist
        für Jahre mit unvollständig erfassten Kosten: Guthaben oder Nachzahlung je Mietvertrag trägst du dann auf der
        Abrechnungsseite von Hand ein.
      </p>
    </form>
  );
}
