"use client";

import { useActionState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { speichereVersendetAm } from "../actions";

/**
 * Versanddatum der Abrechnung. Erst ab diesem Datum zählt die Gegenrechnung der unbezahlten NK-Vorauszahlung
 * im Mietsaldo — vorher besteht der Rückstand tatsächlich noch. Unabhängig von Entwurf/Final.
 */
export function VersendetFeld({
  abrechnungId,
  versendetAm,
  heute,
  belegFehlt,
}: {
  abrechnungId: string;
  versendetAm: string | null;
  heute: string;
  /** Umlagefähige Positionen ohne Beleg (Belegprüfung) — Warnung vor dem Markieren, kein Sperren. */
  belegFehlt: number;
}) {
  const [fehler, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereVersendetAm.bind(null, abrechnungId), formData),
    null,
  );
  const [t, m, j] = (versendetAm ?? "").split("-").reverse();

  return (
    <div className="mb-6 max-w-3xl rounded-md border border-neutral-800 px-3 py-2">
      <form
        action={formAction}
        onSubmit={(e) => {
          const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
          if (versendetAm || submitter?.value === "zuruecknehmen" || belegFehlt === 0) return;
          if (
            !confirm(
              `Für ${belegFehlt} umlagefähige Position${belegFehlt === 1 ? "" : "en"} fehlt noch ein Beleg. Der Mieter darf die Belege einsehen. Trotzdem als versendet markieren?`,
            )
          ) {
            e.preventDefault();
          }
        }}
        className="flex flex-wrap items-center gap-3"
      >
        <span className={`text-sm ${versendetAm ? "text-green-400" : "text-neutral-300"}`}>
          {versendetAm ? `Versendet am ${t}.${m}.${j}` : "Noch nicht versendet"}
        </span>
        <DateInput key={versendetAm ?? "leer"} name="datum" defaultValue={versendetAm ?? heute} size="sm" />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-700 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {versendetAm ? "Datum ändern" : "Als versendet markieren"}
        </button>
        {versendetAm && (
          <button
            type="submit"
            name="aktion"
            value="zuruecknehmen"
            disabled={pending}
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
          >
            Versand zurücknehmen
          </button>
        )}
      </form>
      {fehler && <p className="mt-1 text-xs text-red-400">{fehler}</p>}
      <p className="mt-1.5 text-xs text-neutral-500">
        Erst ab dem Versanddatum zählt die Gutschrift der nicht gezahlten NK-Vorauszahlung im Mietsaldo (Mieterkonto,
        Jahres-/Quartalsübersicht, Offene Posten, Dashboard) und bei berechneten Abrechnungen auch die Nachzahlung/das
        Guthaben der Abrechnung in der Jahresübersicht — vorher besteht der Rückstand tatsächlich noch. Unabhängig vom
        Status Entwurf/Final. Das Datum bei einem späteren Versand oder Zugang beim Mieter nachtragen bzw. ändern.
      </p>
    </div>
  );
}
