"use client";

import { useActionState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { speichereVersendetAm } from "../actions";
import { SCHRITT_KARTE, SCHRITT_KNOPF, SCHRITT_TITEL } from "./panel";

/**
 * Versanddatum der Abrechnung. Erst ab diesem Datum zählt die Gegenrechnung der unbezahlten BK-Vorauszahlung
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
    <div className={SCHRITT_KARTE}>
      <p className={SCHRITT_TITEL}>3 · Versand</p>
      <p className={`mt-1 text-sm font-medium ${versendetAm ? "text-green-400" : "text-white"}`}>
        {versendetAm ? `Versendet am ${t}.${m}.${j}` : "Noch nicht versendet"}
      </p>
      <details className="mb-3 mt-1 text-xs text-neutral-500">
        <summary className="cursor-pointer select-none hover:text-white">Was bewirkt das Versanddatum?</summary>
        <p className="mt-1.5">
          Ab dem Versanddatum zählt die Gutschrift der nicht gezahlten BK-Vorauszahlung im Mietsaldo und (bei berechneten
          Abrechnungen) die Nachzahlung/das Guthaben in der Jahresübersicht; vorher besteht der Rückstand noch. Unabhängig
          vom Status Entwurf/Final. Datum bei späterem Zugang beim Mieter nachtragen. Bei manuellen Positionen mit
          Vorauszahlung &gt; 0 wird die Gutschrift als Soll minus eingetragene Vorauszahlung gerechnet — vor dem Markieren
          prüfen, ob das stimmt.
        </p>
      </details>
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
        className="mt-auto flex flex-wrap items-center gap-2"
      >
        <DateInput key={versendetAm ?? "leer"} name="datum" defaultValue={versendetAm ?? heute} size="sm" />
        <button
          type="submit"
          disabled={pending}
          className={SCHRITT_KNOPF}
        >
          {versendetAm ? "Datum ändern" : "Als versendet markieren"}
        </button>
        {versendetAm && (
          <button
            type="submit"
            name="aktion"
            value="zuruecknehmen"
            disabled={pending}
            className={`${SCHRITT_KNOPF} font-normal text-neutral-300`}
          >
            Zurücknehmen
          </button>
        )}
      </form>
      {fehler && <p className="mt-2 text-xs text-red-400">{fehler}</p>}
    </div>
  );
}
