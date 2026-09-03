"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Einheit = {
  gebaeudeId: string;
  bezeichnung: string;
  typ: string;
  etage: string | null;
  wohnflaecheQm: number | string;
  einbaukueche: boolean;
  fotosVorhanden: boolean;
  notizen: string | null;
};

type GebaeudeOption = { id: string; label: string };

export function EinheitForm({
  gebaeudeOptionen,
  initial,
  action,
}: {
  gebaeudeOptionen: GebaeudeOption[];
  initial?: Einheit;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="gebaeudeId">
          Gebäude
        </label>
        <select
          id="gebaeudeId"
          name="gebaeudeId"
          required
          defaultValue={initial?.gebaeudeId ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="" disabled>
            Bitte wählen…
          </option>
          {gebaeudeOptionen.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="bezeichnung">
          Bezeichnung
        </label>
        <input
          id="bezeichnung"
          name="bezeichnung"
          required
          defaultValue={initial?.bezeichnung}
          placeholder="z.B. 1. OG links"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="typ">
          Typ
        </label>
        <select
          id="typ"
          name="typ"
          defaultValue={initial?.typ ?? "WOHNUNG"}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="WOHNUNG">Wohnung</option>
          <option value="GARAGE">Garage</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="etage">
          Etage
        </label>
        <input
          id="etage"
          name="etage"
          defaultValue={initial?.etage ?? ""}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="wohnflaecheQm">
          Wohnfläche (m²)
        </label>
        <input
          id="wohnflaecheQm"
          name="wohnflaecheQm"
          type="number"
          step="0.01"
          required
          defaultValue={initial?.wohnflaecheQm?.toString()}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div className="flex gap-6">
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="einbaukueche">
          <input
            id="einbaukueche"
            name="einbaukueche"
            type="checkbox"
            defaultChecked={initial?.einbaukueche ?? false}
            className="h-4 w-4 rounded border-neutral-700 bg-transparent"
          />
          Einbauküche
        </label>
        <label className="flex items-center gap-2 text-sm font-medium" htmlFor="fotosVorhanden">
          <input
            id="fotosVorhanden"
            name="fotosVorhanden"
            type="checkbox"
            defaultChecked={initial?.fotosVorhanden ?? false}
            className="h-4 w-4 rounded border-neutral-700 bg-transparent"
          />
          Fotos vorhanden
        </label>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="notizen">
          Notizen
        </label>
        <textarea
          id="notizen"
          name="notizen"
          rows={4}
          defaultValue={initial?.notizen ?? ""}
          placeholder="Zustand, Renovierungen, Besonderheiten …"
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
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
