"use client";

import { useActionState } from "react";
import Link from "next/link";
import { runFormAction, type FormAktion } from "@/lib/form-utils";

// Einheitliche Höhe für Eingabefelder und Auswahllisten (h-10).
const FELD = "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";

type Gebaeude = {
  strasse: string;
  hausnummer: string;
  hausId: string | null;
  beschreibung: string | null;
};

export function GebaeudeForm({
  haeuser,
  initial,
  action,
  abbrechenHref,
}: {
  haeuser: { id: string; label: string }[];
  initial?: Gebaeude;
  action: FormAktion;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="space-y-4 rounded-lg border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Adresse</h2>
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2 min-w-0">
          <label className="mb-1 block text-sm font-medium" htmlFor="strasse">
            Straße
          </label>
          <input
            id="strasse"
            name="strasse"
            required
            defaultValue={initial?.strasse}
            placeholder="z.B. Breslauer Str."
            className={FELD}
          />
        </div>
        <div className="min-w-0">
          <label className="mb-1 block text-sm font-medium" htmlFor="hausnummer">
            Hausnummer
          </label>
          <input id="hausnummer" name="hausnummer" required defaultValue={initial?.hausnummer} className={FELD} />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="hausId">
          Haus (optional)
        </label>
        <select id="hausId" name="hausId" defaultValue={initial?.hausId ?? ""} className={FELD}>
          <option value="">– Kein Haus (eigenständig) –</option>
          {haeuser.map((h) => (
            <option key={h.id} value={h.id}>
              {h.label}
            </option>
          ))}
          <option value="__neu__">+ Neues Haus anlegen (fasst mehrere Hausnummern zusammen)</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="beschreibung">
          Beschreibung (optional)
        </label>
        <input id="beschreibung" name="beschreibung" defaultValue={initial?.beschreibung ?? ""} className={FELD} />
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 pt-4">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-white px-5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {abbrechenHref && (
          <Link
            href={abbrechenHref}
            className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm text-white hover:bg-neutral-900"
          >
            Abbrechen
          </Link>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}
