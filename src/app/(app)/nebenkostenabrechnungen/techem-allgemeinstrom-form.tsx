"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { speichereTechemAllgemeinstromAnteil } from "./actions";

/**
 * Ein Teil der Techem-Gesamtabrechnung dieser Kostenart ist in Wahrheit bereits verrechneter
 * Allgemeinstrom (z.B. Betriebsstrom der Heizungsanlage) — der hier erfasste Betrag wird beim
 * nächsten "Neu berechnen" vom Allgemeinstrom-Pool desselben Gebäude-/Haus-/Kostengruppen-Scopes
 * abgezogen, damit er nicht zusätzlich über die Wohnfläche umgelegt wird.
 */
export function TechemAllgemeinstromForm({
  jahr,
  kostenartId,
  betrag,
}: {
  jahr: number;
  kostenartId: string;
  betrag: number | null;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereTechemAllgemeinstromAnteil, formData),
    null,
  );

  return (
    <form action={formAction} className="mt-2 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-2">
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="kostenartId" value={kostenartId} />
      <label className="text-xs text-neutral-400">
        Davon bereits über Techem verrechneter Allgemeinstrom-Anteil (€)
      </label>
      <input
        type="text"
        inputMode="decimal"
        name="betrag"
        defaultValue={betrag === null ? "" : String(betrag).replace(".", ",")}
        placeholder="0,00"
        className="w-28 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-right text-sm outline-none focus:border-neutral-400"
      />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichere…" : "Speichern"}
      </button>
      {error && <p className="w-full text-xs text-red-400">{error}</p>}
    </form>
  );
}
