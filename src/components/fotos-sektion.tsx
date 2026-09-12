"use client";

import { useActionState } from "react";
import { DeleteButton } from "./delete-button";
import { deleteDokument } from "@/app/(app)/dokumente/actions";

export type FotoRow = {
  id: string;
  dateiname: string;
};

export function FotosSektion({
  fotos,
  uploadAction,
  revalidatePath,
}: {
  fotos: FotoRow[];
  uploadAction: (prevState: string | null, formData: FormData) => Promise<string | null>;
  revalidatePath: string;
}) {
  const [error, formAction, pending] = useActionState(uploadAction, null);

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Fotos ({fotos.length})</h2>
      {fotos.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {fotos.map((f) => (
            <div key={f.id} className="group relative aspect-square overflow-hidden rounded-lg border border-neutral-800">
              <a href={`/api/dokumente/${f.id}/download`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/dokumente/${f.id}/download`}
                  alt={f.dateiname}
                  loading="lazy"
                  className="h-full w-full object-cover"
                />
              </a>
              <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-black/70 px-2 py-1 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="truncate text-xs text-neutral-200" title={f.dateiname}>
                  {f.dateiname}
                </span>
                <DeleteButton
                  action={deleteDokument.bind(null, f.id, revalidatePath)}
                  confirmText="Foto wirklich löschen?"
                  label="✕"
                />
              </div>
            </div>
          ))}
        </div>
      )}
      {fotos.length === 0 && <p className="mb-4 text-sm text-neutral-500">Noch keine Fotos hochgeladen.</p>}
      <form action={formAction} className="flex items-center gap-3">
        <input
          type="file"
          name="file"
          accept="image/*"
          multiple
          required
          className="text-sm text-neutral-300 file:mr-3 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-1.5 file:text-sm file:text-white"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Lädt hoch…" : "Hochladen"}
        </button>
      </form>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
