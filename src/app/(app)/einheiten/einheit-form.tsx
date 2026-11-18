"use client";

import { useActionState } from "react";
import Link from "next/link";
import { runFormAction, type FormAktion } from "@/lib/form-utils";

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

// Einheitliche Höhe für Eingabefelder und Auswahllisten (h-10).
const FELD = "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";

export function EinheitForm({
  gebaeudeOptionen,
  initial,
  action,
  abbrechenHref,
}: {
  gebaeudeOptionen: GebaeudeOption[];
  initial?: Einheit;
  action: FormAktion;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <section className="space-y-4 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Einheit</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor="gebaeudeId">
                Gebäude
              </label>
              <select id="gebaeudeId" name="gebaeudeId" required defaultValue={initial?.gebaeudeId ?? ""} className={FELD}>
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
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor="bezeichnung">
                Bezeichnung
              </label>
              <input
                id="bezeichnung"
                name="bezeichnung"
                required
                defaultValue={initial?.bezeichnung}
                placeholder="z.B. 1. OG links"
                className={FELD}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor="typ">
                Typ
              </label>
              <select id="typ" name="typ" defaultValue={initial?.typ ?? "WOHNUNG"} className={FELD}>
                <option value="WOHNUNG">Wohnung</option>
                <option value="GARAGE">Garage</option>
              </select>
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor="etage">
                Etage
              </label>
              <input id="etage" name="etage" defaultValue={initial?.etage ?? ""} className={FELD} />
            </div>
            <div className="min-w-0">
              <label className="mb-1 block text-sm font-medium" htmlFor="wohnflaecheQm">
                Fläche (m²)
              </label>
              <input
                id="wohnflaecheQm"
                name="wohnflaecheQm"
                type="number"
                step="0.01"
                required
                defaultValue={initial?.wohnflaecheQm?.toString()}
                className={FELD}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-6">
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
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-800 p-4">
          <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">Notizen</h2>
          <textarea
            id="notizen"
            name="notizen"
            aria-label="Notizen"
            rows={8}
            defaultValue={initial?.notizen ?? ""}
            placeholder="Zustand, Renovierungen, Besonderheiten …"
            className="w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </section>
      </div>

      {/* Speichern bleibt beim Scrollen am unteren Rand sichtbar. */}
      <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
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
