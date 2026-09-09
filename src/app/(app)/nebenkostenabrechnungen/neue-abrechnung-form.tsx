"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { createAbrechnung, erstelleLeereAbrechnung } from "./actions";

export function NeueAbrechnungForm() {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(createAbrechnung, formData),
    null,
  );
  const [errorLeer, formActionLeer, pendingLeer] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(erstelleLeereAbrechnung, formData),
    null,
  );

  return (
    <div className="space-y-4">
      <form action={formAction}>
        <div className="flex items-end gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="jahr">
              Jahr
            </label>
            <input
              id="jahr"
              name="jahr"
              type="number"
              required
              defaultValue={new Date().getFullYear() - 1}
              className="w-28 rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? "Berechne…" : "Abrechnung berechnen"}
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      </form>

      <div className="border-t border-neutral-800 pt-4">
        <form action={formActionLeer}>
          <div className="flex items-end gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="jahr-leer">
                Jahr
              </label>
              <input
                id="jahr-leer"
                name="jahr"
                type="number"
                required
                defaultValue={new Date().getFullYear() - 1}
                className="w-28 rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <button
              type="submit"
              disabled={pendingLeer}
              className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-neutral-200 hover:bg-neutral-900 disabled:opacity-50"
            >
              {pendingLeer ? "Lege an…" : "Leer anlegen (ohne Berechnung)"}
            </button>
          </div>
          <p className="mt-2 text-xs text-neutral-500">
            Legt eine leere Abrechnung an, ohne die Kostendaten des Jahres zu berechnen — für
            Jahre, deren Kosten unvollständig erfasst sind. Positionen (Guthaben/Nachzahlung pro
            Mietvertrag) trägst du danach auf der Abrechnungsseite manuell ein.
          </p>
          {errorLeer && <p className="mt-2 text-sm text-red-400">{errorLeer}</p>}
        </form>
      </div>
    </div>
  );
}
