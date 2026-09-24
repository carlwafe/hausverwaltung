"use client";

import { useActionState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { verrechneNachzahlungAlsForderung } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

/**
 * Verrechnet die offene Nachzahlung einer Position als datierte Forderung aufs Mieterkonto (statt
 * sie per Überweisung einzuziehen) — die Position gilt danach als beglichen, die Forderung erscheint
 * im Mieterkonto an diesem Datum. Rückgängig: die Forderung unter "Zahlungen" stornieren.
 */
export function NachzahlungVerrechnenForm({ positionId, offen }: { positionId: string; offen: number }) {
  const [fehler, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) =>
      runFormAction(verrechneNachzahlungAlsForderung.bind(null, positionId), formData),
    null,
  );

  return (
    <form action={formAction} className="mb-2 flex flex-wrap items-end gap-3 text-xs">
      <span className="pb-1.5 text-neutral-400">
        Offene Nachzahlung <strong className="text-red-400">{formatEuro(offen)}</strong> als Forderung aufs Mieterkonto verrechnen am
      </span>
      <DateInput name="datum" required size="sm" />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-2 py-1 font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Verrechne…" : "Verrechnen"}
      </button>
      {fehler && <p className="w-full text-red-400">{fehler}</p>}
    </form>
  );
}
