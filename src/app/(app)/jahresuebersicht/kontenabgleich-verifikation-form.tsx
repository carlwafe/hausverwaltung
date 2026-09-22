"use client";

import { useActionState, useState } from "react";
import { speichereKontenabgleichVerifikation, loescheKontenabgleichVerifikation } from "./actions";
import { DeleteButton } from "@/components/delete-button";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

/**
 * Der externe Gegencheck zum Kontenabgleich (siehe ladeKontenabgleich in page.tsx): der dort
 * berechnete Kontostand ist nur intern konsistent (rechnet sich selbst nach) — erst der Abgleich
 * gegen den tatsächlichen, vom echten Kontoauszug abgelesenen Kontostand kann eine wirklich
 * fehlende oder falsch geflaggte Buchung aufdecken.
 */
export function KontenabgleichVerifikationForm({
  jahr,
  kontostandLautJournal,
  gespeicherterWert,
}: {
  jahr: number;
  kontostandLautJournal: number;
  gespeicherterWert: number | null;
}) {
  const [fehler, formAction, pending] = useActionState(speichereKontenabgleichVerifikation, null);
  const [eingabe, setEingabe] = useState(gespeicherterWert !== null ? String(gespeicherterWert) : "");
  const eingabeZahl = eingabe.trim() === "" ? null : Number(eingabe);
  const differenz =
    eingabeZahl !== null && !Number.isNaN(eingabeZahl)
      ? Math.round((kontostandLautJournal - eingabeZahl) * 100) / 100
      : null;

  return (
    <div className="mt-3 rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">Abgleich gegen den echten Kontoauszug</p>
      <p className="mb-3 text-xs text-neutral-500">
        Der Kontenabgleich oben rechnet sich nur selbst nach — erst der Vergleich mit dem
        tatsächlichen, vom Kontoauszug abgelesenen Kontostand zeigt, ob dem Journal wirklich eine
        Buchung fehlt.
      </p>
      {/* DeleteButton ist selbst ein <form> — als Kind eines anderen <form> verschachtelt und
          damit ungültiges HTML (Hydration-Warnung). Das äußere <div> trägt das Flex-Layout, das
          Speichern-<form> bekommt "contents" (Kinder bleiben normale Flex-Items), DeleteButton
          steht als echtes Geschwister daneben — gleiches Layout, kein verschachteltes Formular. */}
      <div className="flex flex-wrap items-end gap-3">
        <form action={formAction} className="contents">
          <input type="hidden" name="jahr" value={jahr} />
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Kontostand laut Kontoauszug am 31.12.{jahr}
            </label>
            <input
              type="number"
              step="0.01"
              name="kontostandLautBankauszug"
              value={eingabe}
              onChange={(e) => setEingabe(e.target.value)}
              placeholder="z.B. 42000.00"
              className="w-44 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            />
          </div>
          <button
            type="submit"
            disabled={pending || eingabe.trim() === ""}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Speichern"}
          </button>
        </form>
        {gespeicherterWert !== null && (
          <DeleteButton
            action={loescheKontenabgleichVerifikation.bind(null, jahr)}
            confirmText="Bestätigten Kontostand wirklich entfernen?"
            label="Entfernen"
            size="sm"
          />
        )}
      </div>
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
      {differenz !== null && (
        <p
          className={`mt-3 text-sm font-medium ${Math.abs(differenz) < 0.01 ? "text-green-400" : "text-red-400"}`}
        >
          Differenz zum Journal-Kontostand: {formatEuro(differenz)}
          {Math.abs(differenz) < 0.01
            ? " — stimmt überein."
            : " — im Journal fehlt eine Buchung, oder eine Buchungsart ist falsch geflaggt (zahlungswirksam/eurRelevant)."}
        </p>
      )}
    </div>
  );
}
