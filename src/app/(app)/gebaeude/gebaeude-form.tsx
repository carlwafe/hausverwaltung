"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

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
}: {
  haeuser: { id: string; label: string }[];
  initial?: Gebaeude;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="strasse">
            Straße
          </label>
          <input
            id="strasse"
            name="strasse"
            required
            defaultValue={initial?.strasse}
            placeholder="z.B. Breslauer Str."
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="hausnummer">
            Hausnummer
          </label>
          <input
            id="hausnummer"
            name="hausnummer"
            required
            defaultValue={initial?.hausnummer}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="hausId">
          Haus (optional)
        </label>
        <select
          id="hausId"
          name="hausId"
          defaultValue={initial?.hausId ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
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
        <input
          id="beschreibung"
          name="beschreibung"
          defaultValue={initial?.beschreibung ?? ""}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
