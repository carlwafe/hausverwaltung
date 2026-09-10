"use client";

import { useActionState, useEffect, useRef } from "react";
import { aktualisiereKaution } from "./actions";

function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function KautionBearbeitenDialog({
  id,
  status,
  rueckzahlungsdatum,
  rueckzahlungsbetrag,
  notizen,
}: {
  id: string;
  status: "AKTIV" | "ZURUECKGEZAHLT";
  rueckzahlungsdatum: string | null;
  rueckzahlungsbetrag: number | null;
  notizen: string | null;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, action, pending] = useActionState(aktualisiereKaution, null);

  useEffect(() => {
    if (message) dialogRef.current?.close();
  }, [message]);

  return (
    <>
      <button
        type="button"
        onClick={() => dialogRef.current?.showModal()}
        className="text-xs text-neutral-400 underline hover:text-white"
      >
        Bearbeiten
      </button>
      <dialog
        ref={dialogRef}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current?.close();
        }}
        className="m-auto w-full max-w-md rounded-md border border-neutral-700 bg-neutral-950 p-0 text-white backdrop:bg-black/60"
      >
        <form action={action} className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Kaution bearbeiten</h3>
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="text-neutral-400 hover:text-white"
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>

          <input type="hidden" name="id" value={id} />

          <div className="space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Status</span>
              <select
                name="status"
                defaultValue={status}
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
              >
                <option value="AKTIV" className="bg-neutral-900">
                  Aktiv
                </option>
                <option value="ZURUECKGEZAHLT" className="bg-neutral-900">
                  Zurückgezahlt
                </option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">Rückzahlungsdatum</span>
              <input
                type="date"
                name="rueckzahlungsdatum"
                defaultValue={toDateInputValue(rueckzahlungsdatum)}
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">
                Rückzahlungsbetrag (tatsächlich ausgezahlt, ohne einbehaltene Beträge)
              </span>
              <input
                type="text"
                inputMode="decimal"
                name="rueckzahlungsbetrag"
                defaultValue={rueckzahlungsbetrag !== null ? rueckzahlungsbetrag.toString() : ""}
                placeholder="z.B. 222.31"
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">
                Notizen (z.B. einbehaltene Beträge, die in keiner Kontobewegung sichtbar sind)
              </span>
              <textarea
                name="notizen"
                defaultValue={notizen ?? ""}
                rows={3}
                placeholder="z.B. 400 € Reserve einbehalten, 119 € davon für Reparatur X verwendet (lt. Kautionskonto-Auszug)"
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
              />
            </label>
          </div>

          {message && <p className="mt-3 text-sm text-green-400">{message}</p>}

          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
            >
              Abbrechen
            </button>
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {pending ? "Speichere…" : "Speichern"}
            </button>
          </div>
        </form>
      </dialog>
    </>
  );
}
