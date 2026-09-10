"use client";

import { useActionState, useEffect, useRef, useTransition } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { berechneEffektivEinbehalten, berechneEinbehalten } from "@/lib/kaution";
import {
  aktualisiereKaution,
  entferneKostenpositionVonKaution,
  verknuepfeKostenpositionMitKaution,
} from "./actions";

export type KostenpositionKandidat = {
  id: string;
  label: string;
  betrag: number;
  kautionId: string | null;
};

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function toDateInputValue(iso: string | null) {
  return iso ? iso.slice(0, 10) : "";
}

export function KautionBearbeitenDialog({
  id,
  betrag,
  status,
  aufloesungsdatum,
  aufloesungsbetrag,
  rueckzahlungsdatum,
  rueckzahlungsbetrag,
  notizen,
  verrechneteKostenpositionen,
  kandidatenKostenpositionen,
}: {
  id: string;
  betrag: number;
  status: "AKTIV" | "AUFGELOEST" | "ZURUECKGEZAHLT";
  aufloesungsdatum: string | null;
  aufloesungsbetrag: number | null;
  rueckzahlungsdatum: string | null;
  rueckzahlungsbetrag: number | null;
  notizen: string | null;
  verrechneteKostenpositionen: KostenpositionKandidat[];
  kandidatenKostenpositionen: KostenpositionKandidat[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [message, action, pending] = useActionState(aktualisiereKaution, null);
  const [verrechnenPending, startVerrechnenTransition] = useTransition();

  useEffect(() => {
    if (message) dialogRef.current?.close();
  }, [message]);

  const einbehalten = berechneEinbehalten({ betrag, aufloesungsbetrag, rueckzahlungsbetrag });
  const verrechnetSumme = verrechneteKostenpositionen.reduce((s, p) => s + p.betrag, 0);
  const effektivEinbehalten = berechneEffektivEinbehalten(einbehalten, verrechnetSumme);

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
        className="m-auto w-full max-w-lg rounded-md border border-neutral-700 bg-neutral-950 p-0 text-white backdrop:bg-black/60"
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
                <option value="AUFGELOEST" className="bg-neutral-900">
                  Aufgelöst (noch nicht ausgezahlt)
                </option>
                <option value="ZURUECKGEZAHLT" className="bg-neutral-900">
                  Zurückgezahlt
                </option>
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">
                  Auflösungsdatum (Kautionskonto)
                </span>
                <input
                  type="date"
                  name="aufloesungsdatum"
                  defaultValue={toDateInputValue(aufloesungsdatum)}
                  className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Auflösungsbetrag</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="aufloesungsbetrag"
                  defaultValue={aufloesungsbetrag !== null ? aufloesungsbetrag.toString() : ""}
                  placeholder={betrag.toString()}
                  className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">
                  Auszahlungsdatum (an den Mieter)
                </span>
                <input
                  type="date"
                  name="rueckzahlungsdatum"
                  defaultValue={toDateInputValue(rueckzahlungsdatum)}
                  className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-400">Auszahlungsbetrag</span>
                <input
                  type="text"
                  inputMode="decimal"
                  name="rueckzahlungsbetrag"
                  defaultValue={rueckzahlungsbetrag !== null ? rueckzahlungsbetrag.toString() : ""}
                  className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
                />
              </label>
            </div>

            {einbehalten !== null && (
              <div className="rounded-md border border-neutral-800 bg-neutral-900/50 px-3 py-2 text-xs text-neutral-300">
                <div>
                  Einbehalten: {formatEuro(einbehalten)}{" "}
                  <span className="text-neutral-500">
                    ({formatEuro(aufloesungsbetrag ?? betrag)} − {formatEuro(rueckzahlungsbetrag ?? 0)})
                  </span>
                </div>
                {verrechneteKostenpositionen.length > 0 && (
                  <div className="mt-1">
                    davon verrechnet: {formatEuro(verrechnetSumme)} — verbleibend einbehalten:{" "}
                    <span className="font-medium text-white">{formatEuro(effektivEinbehalten!)}</span>
                  </div>
                )}
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-xs text-neutral-400">
                Notizen (z.B. Grund für einen einbehaltenen Restbetrag)
              </span>
              <textarea
                name="notizen"
                defaultValue={notizen ?? ""}
                rows={2}
                placeholder="z.B. Restbetrag als Reserve für mögliche Nachforderungen einbehalten"
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-white outline-none focus:border-neutral-400"
              />
            </label>

            <div>
              <span className="mb-1 block text-xs text-neutral-400">
                Mit dem einbehaltenen Betrag verrechnete Kosten (z.B. Reparaturen)
              </span>
              {verrechneteKostenpositionen.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {verrechneteKostenpositionen.map((p) => (
                    <li
                      key={p.id}
                      className="flex items-center justify-between rounded border border-neutral-800 px-2 py-1 text-xs text-neutral-300"
                    >
                      <span className="truncate">{p.label}</span>
                      <button
                        type="button"
                        disabled={verrechnenPending}
                        onClick={() =>
                          startVerrechnenTransition(() => entferneKostenpositionVonKaution(p.id))
                        }
                        className="ml-2 shrink-0 text-neutral-500 hover:text-red-400 disabled:opacity-50"
                      >
                        entfernen
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <MietvertragAuswahl
                kandidaten={kandidatenKostenpositionen}
                value=""
                leerLabel="– Kostenposition zum Verrechnen suchen –"
                size="md"
                onChange={(kostenpositionId) => {
                  if (!kostenpositionId) return;
                  startVerrechnenTransition(() =>
                    verknuepfeKostenpositionMitKaution(id, kostenpositionId),
                  );
                }}
              />
            </div>
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
