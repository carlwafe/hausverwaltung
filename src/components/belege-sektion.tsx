"use client";

import { DateInput } from "@/components/date-input";
import { useActionState, useState, useTransition } from "react";
import { DeleteButton } from "./delete-button";
import { aendereBelegDatum, blendeDokumentAus, deleteDokument, stelleDokumentWiederHer } from "@/app/(app)/dokumente/actions";
import { ermittleZuGrosseDateien, MAX_DATEIGROESSE_BYTES } from "@/lib/upload-limits";
import { formatBytes, formatDate } from "@/lib/dokumente-anzeige";
import { GroessenFehler } from "@/components/groessen-fehler";

export type BelegRow = {
  id: string;
  dateiname: string;
  groesseBytes: number | null;
  belegDatum: Date | null;
  // Upload-Datum.
  createdAt: Date;
  // Nur Kostenbelege (Löschsperre): wann/von wem ausgeblendet.
  ausgeblendetAm?: Date | null;
  ausgeblendetVon?: string | null;
};

const zuInputWert = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// Belegdatum direkt in der Zeile änderbar; gespeichert wird beim Verlassen/Ändern des Feldes.
export function BelegDatumFeld({ id, wert, revalidatePath }: { id: string; wert: Date | null; revalidatePath: string }) {
  const [aktuell, setAktuell] = useState(zuInputWert(wert));
  const [pending, startTransition] = useTransition();
  return (
    <DateInput
      value={aktuell}
      disabled={pending}
      size="sm"
      onChange={(iso) => {
        if (iso === aktuell) return;
        setAktuell(iso);
        startTransition(() => aendereBelegDatum(id, iso, revalidatePath));
      }}
    />
  );
}

// Knopf mit Bestätigung für Aktionen ohne Löschen (Ausblenden/Wiederherstellen).
function AktionsKnopf({ action, confirmText, label }: { action: () => Promise<void>; confirmText?: string; label: string }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (confirmText && !confirm(confirmText)) e.preventDefault();
      }}
    >
      <button
        type="submit"
        className="rounded-md border border-neutral-700 px-2 py-1 text-xs font-medium text-neutral-300 hover:bg-neutral-900 hover:text-white"
      >
        {label}
      </button>
    </form>
  );
}

export function BelegeSektion({
  dokumente: alleDokumente,
  uploadAction,
  revalidatePath,
  titel = "Belege",
  leerText = "Noch keine Belege hochgeladen.",
  maxBytes = MAX_DATEIGROESSE_BYTES,
  kostenbeleg = false,
}: {
  /** Kostenbelege (Nachweis für Finanzamt/Nebenkostenabrechnung) lassen sich nicht löschen, nur ausblenden. */
  kostenbeleg?: boolean;
  maxBytes?: number;
  titel?: string;
  leerText?: string;
  dokumente: BelegRow[];
  uploadAction: (prevState: string | null, formData: FormData) => Promise<string | null>;
  revalidatePath: string;
}) {
  const [error, formAction, pending] = useActionState(uploadAction, null);
  const [groessenFehler, setGroessenFehler] = useState<string | null>(null);
  const dokumente = alleDokumente.filter((d) => !d.ausgeblendetAm);
  const ausgeblendet = alleDokumente.filter((d) => d.ausgeblendetAm);
  // Nach Belegdatum sortiert (fehlt es: nach dem Upload-Datum), neueste zuerst.
  const sortiert = [...dokumente].sort(
    (a, b) => (b.belegDatum ?? b.createdAt).getTime() - (a.belegDatum ?? a.createdAt).getTime(),
  );

  const maxMb = maxBytes / (1024 * 1024);

  function pruefeDateigroessen(e: React.ChangeEvent<HTMLInputElement>) {
    const zuGross = ermittleZuGrosseDateien(e.target.files, maxBytes);
    if (zuGross.length > 0) {
      setGroessenFehler(
        `Dateien dürfen maximal ${maxMb} MB groß sein: ${zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.`,
      );
      e.target.value = "";
    } else {
      setGroessenFehler(null);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">{titel} ({dokumente.length})</h2>
      <div className="mb-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="py-2 pr-3">Datei</th>
              <th className="px-3 py-2">Belegdatum</th>
              <th className="px-3 py-2">Upload-Datum</th>
              <th className="px-3 py-2 text-right">Größe</th>
              <th className="py-2 pl-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-800">
            {sortiert.map((d) => (
              <tr key={d.id}>
                <td className="max-w-[340px] py-2 pr-3">
                  <a
                    href={`/api/dokumente/${d.id}/download`}
                    className="block text-white [overflow-wrap:anywhere] hover:underline"
                    title={d.dateiname}
                  >
                    {d.dateiname}
                  </a>
                </td>
                <td className="px-3 py-2">
                  <BelegDatumFeld id={d.id} wert={d.belegDatum} revalidatePath={revalidatePath} />
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-neutral-500">{formatDate(d.createdAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-neutral-500">
                  {formatBytes(d.groesseBytes)}
                </td>
                <td className="py-2 pl-3 text-right">
                  {kostenbeleg ? (
                    <AktionsKnopf
                      action={blendeDokumentAus.bind(null, d.id, revalidatePath)}
                      confirmText="Beleg ausblenden? Er wird nicht gelöscht und lässt sich hier wiederherstellen."
                      label="Ausblenden"
                    />
                  ) : (
                    <DeleteButton
                      action={deleteDokument.bind(null, d.id, revalidatePath)}
                      confirmText="Beleg wirklich löschen?"
                      label="Löschen"
                    />
                  )}
                </td>
              </tr>
            ))}
            {dokumente.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-sm text-neutral-500">
                  {leerText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {ausgeblendet.length > 0 && (
        <details className="mb-4 text-sm">
          <summary className="cursor-pointer text-neutral-400 hover:text-white">
            Ausgeblendete Belege ({ausgeblendet.length})
          </summary>
          <ul className="mt-2 divide-y divide-neutral-800">
            {ausgeblendet.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <div className="min-w-0 text-neutral-400">
                  <a href={`/api/dokumente/${d.id}/download`} className="[overflow-wrap:anywhere] hover:underline">
                    {d.dateiname}
                  </a>
                  <span className="ml-2 text-xs text-neutral-500">
                    ausgeblendet am {formatDate(d.ausgeblendetAm!)}
                    {d.ausgeblendetVon && ` von ${d.ausgeblendetVon}`}
                  </span>
                </div>
                <AktionsKnopf action={stelleDokumentWiederHer.bind(null, d.id, revalidatePath)} label="Wiederherstellen" />
              </li>
            ))}
          </ul>
        </details>
      )}
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Belegdatum (optional)</label>
          <DateInput name="belegDatum" size="sm" />
        </div>
        <input
          type="file"
          name="file"
          required
          onChange={pruefeDateigroessen}
          className="text-sm text-neutral-300 file:mr-3 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
        <button
          type="submit"
          disabled={pending || groessenFehler !== null}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Lädt hoch…" : "Hochladen"}
        </button>
      </form>
      <p className="mt-1 text-xs text-neutral-500">
        Maximal {maxMb} MB pro Datei. Das Belegdatum ist das Datum des Belegs selbst (z.B. Rechnungsdatum) und gilt für
        alle Dateien dieses Uploads; es lässt sich in der Tabelle später ändern.
      </p>
      <GroessenFehler text={groessenFehler} />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
