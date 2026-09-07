"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";

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

type Zahlung = {
  mietvertragId: string;
  datum: string;
  betrag: string;
  periodeMonat: number;
  periodeJahr: number;
  verwendungszweck: string | null;
};

export function ZahlungForm({
  mietvertraege,
  defaultMietvertragId,
  initial,
  action,
}: {
  mietvertraege: Option[];
  defaultMietvertragId?: string;
  initial?: Zahlung;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [mietvertragId, setMietvertragId] = useState(initial?.mietvertragId ?? defaultMietvertragId ?? "");

  const heute = new Date();

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="mietvertragId">
          Mietvertrag
        </label>
        <input type="hidden" id="mietvertragId" name="mietvertragId" value={mietvertragId} required />
        <MietvertragAuswahl
          kandidaten={mietvertraege}
          value={mietvertragId}
          onChange={setMietvertragId}
          leerLabel="Bitte wählen…"
          size="md"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DateInput
          id="datum"
          name="datum"
          label="Zahlungsdatum"
          defaultValue={initial?.datum ?? heute.toISOString().slice(0, 10)}
        />
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
            defaultValue={initial?.betrag}
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
            defaultValue={initial?.periodeMonat ?? heute.getMonth() + 1}
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
            defaultValue={initial?.periodeJahr ?? heute.getFullYear()}
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
          defaultValue={initial?.verwendungszweck ?? ""}
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
        {pending ? "Speichern…" : initial ? "Speichern" : "Zahlung erfassen"}
      </button>
    </form>
  );
}
