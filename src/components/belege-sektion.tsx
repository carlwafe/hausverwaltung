"use client";

import { useActionState, useState, useTransition } from "react";
import { DeleteButton } from "./delete-button";
import { aendereBelegDatum, deleteDokument } from "@/app/(app)/dokumente/actions";
import { ermittleZuGrosseDateien } from "@/lib/upload-limits";

function formatBytes(n: number | null) {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export type BelegRow = {
  id: string;
  dateiname: string;
  groesseBytes: number | null;
  belegDatum: Date | null;
  // Upload-Datum.
  createdAt: Date;
};

const zuInputWert = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");

// Belegdatum direkt in der Zeile änderbar; gespeichert wird beim Verlassen/Ändern des Feldes.
function BelegDatumFeld({ id, wert, revalidatePath }: { id: string; wert: Date | null; revalidatePath: string }) {
  const [aktuell, setAktuell] = useState(zuInputWert(wert));
  const [pending, startTransition] = useTransition();
  return (
    <input
      type="date"
      value={aktuell}
      disabled={pending}
      onChange={(e) => {
        setAktuell(e.target.value);
        startTransition(() => aendereBelegDatum(id, e.target.value, revalidatePath));
      }}
      className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs text-white outline-none focus:border-neutral-400 disabled:opacity-50"
    />
  );
}

export function BelegeSektion({
  dokumente,
  uploadAction,
  revalidatePath,
}: {
  dokumente: BelegRow[];
  uploadAction: (prevState: string | null, formData: FormData) => Promise<string | null>;
  revalidatePath: string;
}) {
  const [error, formAction, pending] = useActionState(uploadAction, null);
  const [groessenFehler, setGroessenFehler] = useState<string | null>(null);
  // Nach Belegdatum sortiert (fehlt es: nach dem Upload-Datum), neueste zuerst.
  const sortiert = [...dokumente].sort(
    (a, b) => (b.belegDatum ?? b.createdAt).getTime() - (a.belegDatum ?? a.createdAt).getTime(),
  );

  function pruefeDateigroessen(e: React.ChangeEvent<HTMLInputElement>) {
    const zuGross = ermittleZuGrosseDateien(e.target.files);
    if (zuGross.length > 0) {
      setGroessenFehler(
        `Dateien dürfen maximal 1 MB groß sein: ${zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.`,
      );
      e.target.value = "";
    } else {
      setGroessenFehler(null);
    }
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Belege ({dokumente.length})</h2>
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
                <td className="max-w-[280px] py-2 pr-3">
                  <a
                    href={`/api/dokumente/${d.id}/download`}
                    className="block truncate text-white hover:underline"
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
                  <DeleteButton
                    action={deleteDokument.bind(null, d.id, revalidatePath)}
                    confirmText="Beleg wirklich löschen?"
                    label="Löschen"
                  />
                </td>
              </tr>
            ))}
            {dokumente.length === 0 && (
              <tr>
                <td colSpan={5} className="py-2 text-sm text-neutral-500">
                  Noch keine Belege hochgeladen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <form action={formAction} className="flex flex-wrap items-end gap-3">
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Belegdatum (optional)</label>
          <input
            type="date"
            name="belegDatum"
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
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
        Maximal 1 MB pro Datei. Das Belegdatum ist das Datum des Belegs selbst (z.B. Rechnungsdatum) und gilt für
        alle Dateien dieses Uploads; es lässt sich in der Tabelle später ändern.
      </p>
      {groessenFehler && <p className="mt-2 text-sm text-red-400">{groessenFehler}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
