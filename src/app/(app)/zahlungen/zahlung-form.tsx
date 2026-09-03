"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Option = { id: string; label: string };

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

export function ZahlungForm({
  mietvertraege,
  defaultMietvertragId,
  action,
}: {
  mietvertraege: Option[];
  defaultMietvertragId?: string;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  const heute = new Date();

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="mietvertragId">
          Mietvertrag
        </label>
        <select
          id="mietvertragId"
          name="mietvertragId"
          required
          defaultValue={defaultMietvertragId ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="" disabled>
            Bitte wählen…
          </option>
          {mietvertraege.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="datum">
            Zahlungsdatum
          </label>
          <input
            id="datum"
            name="datum"
            type="date"
            required
            defaultValue={heute.toISOString().slice(0, 10)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="betrag">
            Betrag (€)
          </label>
          <input
            id="betrag"
            name="betrag"
            type="number"
            step="0.01"
            required
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="periodeMonat">
            Für Monat
          </label>
          <select
            id="periodeMonat"
            name="periodeMonat"
            defaultValue={heute.getMonth() + 1}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            {MONATE.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="periodeJahr">
            Jahr
          </label>
          <input
            id="periodeJahr"
            name="periodeJahr"
            type="number"
            required
            defaultValue={heute.getFullYear()}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="verwendungszweck">
          Verwendungszweck (optional)
        </label>
        <input
          id="verwendungszweck"
          name="verwendungszweck"
          placeholder="z.B. Miete März 2026"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Zahlung erfassen"}
      </button>
    </form>
  );
}
