"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { speichereSchuldzinsenJahreswert } from "./actions";

const feld = "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

export function JahreswertForm({ jahr }: { jahr: number }) {
  const [fehler, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereSchuldzinsenJahreswert, formData),
    null,
  );
  return (
    <form action={formAction} className="mt-3 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem_1fr_auto] sm:items-end">
      <input type="hidden" name="jahr" value={jahr} />
      <div>
        <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-bezeichnung">Darlehen</label>
        <input id="jw-bezeichnung" name="bezeichnung" required maxLength={100} placeholder="z.B. Darlehen 1 (Bank)" className={feld} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-betrag">Zinsen {jahr} (€)</label>
        <input id="jw-betrag" name="betrag" required inputMode="decimal" placeholder="0,00" className={feld} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400" htmlFor="jw-bemerkung">Bemerkung (optional)</label>
        <input id="jw-bemerkung" name="bemerkung" maxLength={200} placeholder="z.B. Raten Januar–September" className={feld} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Hinzufügen"}
      </button>
      {fehler && <p className="text-sm text-red-400 sm:col-span-4">{fehler}</p>}
    </form>
  );
}
