"use client";

import { Fragment, useState, useTransition } from "react";
import { DeleteButton } from "@/components/delete-button";
import { pruefeImportVollstaendigkeit, raeumeVerwaisteImporteAuf } from "./actions";
import type { VollstaendigkeitsErgebnis } from "@/lib/import/vollstaendigkeit";

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type GruppierterImportRow = {
  dateiname: string;
  erstelltAm: string;
  anzahlZeilen: number | null;
  anzahlZahlungen: number;
  anzahlKosten: number;
  anzahlMietweiterleitungen: number;
  anzahlKautionsbuchungen: number;
  /** Bewusst nicht weiter verfolgte Buchungen (siehe SonstigeBuchung), z.B. eine
   * Nebenkostenabrechnungs-Rückzahlung für ein Jahr ohne Abrechnung in dieser App. */
  anzahlSonstige: number;
  /** Wie oft dieselbe Datei hochgeladen und dabei etwas übernommen wurde. */
  anzahlImporte: number;
  /** Batch, dessen gespeicherte Datei für den Vollständigkeits-Check gelesen wird (der neueste). */
  pruefBatchId: string;
};

function VollstaendigkeitsZelle({ batchId }: { batchId: string }) {
  const [ergebnis, setErgebnis] = useState<VollstaendigkeitsErgebnis | { error: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (!ergebnis) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => setErgebnis(await pruefeImportVollstaendigkeit(batchId)))}
        className="text-xs text-neutral-400 underline hover:text-white disabled:opacity-50"
      >
        {pending ? "Prüfe…" : "Vollständigkeit prüfen"}
      </button>
    );
  }

  if ("error" in ergebnis) {
    return <span className="text-xs text-red-400">{ergebnis.error}</span>;
  }

  if (ergebnis.ungeklaert.length === 0 && ergebnis.doppelteBuchungen.length === 0) {
    return <span className="text-xs text-green-400">Vollständig ({ergebnis.gesamt} Zeilen zugeordnet)</span>;
  }

  return (
    <div className="text-xs">
      {ergebnis.ungeklaert.length > 0 && (
        <>
          <p className="text-amber-400">
            {ergebnis.ungeklaert.length} von {ergebnis.gesamt} Zeilen ungeklärt
          </p>
          <ul className="mt-1 space-y-0.5 text-neutral-400">
            {ergebnis.ungeklaert.map((z) => (
              <li key={z.rowNumber}>
                {z.datum ?? "–"} · {z.betrag !== null ? formatEuro(z.betrag) : "–"} · {z.name || "–"} —{" "}
                {z.verwendungszweck || "–"}
              </li>
            ))}
          </ul>
        </>
      )}
      {ergebnis.doppelteBuchungen.length > 0 && (
        <>
          <p className={ergebnis.ungeklaert.length > 0 ? "mt-2 text-red-400" : "text-red-400"}>
            {ergebnis.doppelteBuchungen.length} Zeile{ergebnis.doppelteBuchungen.length === 1 ? "" : "n"} mehrfach
            erfasst
          </p>
          <ul className="mt-1 space-y-0.5 text-neutral-400">
            {ergebnis.doppelteBuchungen.map((z) => (
              <li key={z.rowNumber}>
                {z.datum ?? "–"} · {z.betrag !== null ? formatEuro(z.betrag) : "–"} · {z.name || "–"} —{" "}
                {z.verwendungszweck || "–"} · in: {z.kategorien.join(" + ")}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function ImporteTabelle({
  rows,
  verwaisteAnzahl,
}: {
  rows: GruppierterImportRow[];
  verwaisteAnzahl: number;
}) {
  return (
    <div>
      {verwaisteAnzahl > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-sm text-neutral-300">
            {verwaisteAnzahl} gespeicherte Datei{verwaisteAnzahl === 1 ? "" : "en"} von reinen
            Vorschauen ohne übernommene Buchungen — kann gefahrlos gelöscht werden.
          </p>
          <DeleteButton
            action={raeumeVerwaisteImporteAuf}
            confirmText={`${verwaisteAnzahl} verwaiste Import(e) wirklich löschen? Die Originaldateien werden entfernt.`}
            label="Aufräumen"
          />
        </div>
      )}

      <div className="rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Datei</th>
              <th className="px-4 py-2">Importiert am</th>
              <th className="px-4 py-2">Zeilen</th>
              <th className="px-4 py-2">Zahlungen</th>
              <th className="px-4 py-2">Kosten</th>
              <th className="px-4 py-2">Mietweiterleitungen</th>
              <th className="px-4 py-2">Kaution</th>
              <th className="px-4 py-2">Sonstige</th>
              <th className="px-4 py-2">Vollständigkeit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Fragment key={r.dateiname}>
                <tr className="border-t border-neutral-800 align-top">
                  <td className="px-4 py-2 text-white">
                    {r.dateiname}
                    {r.anzahlImporte > 1 && (
                      <span className="ml-1 text-xs text-neutral-500">({r.anzahlImporte}x importiert)</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-white">{formatDatum(r.erstelltAm)}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlZeilen ?? "–"}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlZahlungen}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlKosten}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlMietweiterleitungen}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlKautionsbuchungen}</td>
                  <td className="px-4 py-2 text-neutral-300">{r.anzahlSonstige}</td>
                  <td className="px-4 py-2">
                    <VollstaendigkeitsZelle batchId={r.pruefBatchId} />
                  </td>
                </tr>
              </Fragment>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Kontoauszug-Importe mit übernommenen Buchungen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
