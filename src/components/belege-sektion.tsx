"use client";

import { useActionState, useState } from "react";
import { DeleteButton } from "./delete-button";
import { deleteDokument } from "@/app/(app)/dokumente/actions";
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
  createdAt: Date;
};

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
      <ul className="mb-4 divide-y divide-neutral-800">
        {dokumente.map((d) => (
          <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
            <a
              href={`/api/dokumente/${d.id}/download`}
              className="min-w-0 truncate text-white hover:underline"
              title={d.dateiname}
            >
              {d.dateiname}
            </a>
            <span className="shrink-0 text-xs text-neutral-500">
              {formatBytes(d.groesseBytes)} · {formatDate(d.createdAt)}
            </span>
            <DeleteButton
              action={deleteDokument.bind(null, d.id, revalidatePath)}
              confirmText="Beleg wirklich löschen?"
              label="Löschen"
            />
          </li>
        ))}
        {dokumente.length === 0 && (
          <li className="py-2 text-sm text-neutral-500">Noch keine Belege hochgeladen.</li>
        )}
      </ul>
      <form action={formAction} className="flex items-center gap-3">
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
      <p className="mt-1 text-xs text-neutral-500">Maximal 1 MB pro Datei.</p>
      {groessenFehler && <p className="mt-2 text-sm text-red-400">{groessenFehler}</p>}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
