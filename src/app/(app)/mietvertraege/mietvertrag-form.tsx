"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Option = { id: string; label: string };

type Initial = {
  einheitId: string;
  mieterId: string;
  beginn: string;
  ende: string;
  kaltmiete: string;
  nebenkostenVorauszahlung: string;
  status: string;
  kautionBetrag?: string;
  kautionAnlageform?: string;
  kautionZinssatz?: string;
};

export function MietvertragForm({
  einheiten,
  mieter,
  initial,
  action,
}: {
  einheiten: Option[];
  mieter: Option[];
  initial?: Initial;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="einheitId">
            Einheit
          </label>
          <select
            id="einheitId"
            name="einheitId"
            required
            defaultValue={initial?.einheitId ?? ""}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {einheiten.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mieterId">
            Mieter
          </label>
          <select
            id="mieterId"
            name="mieterId"
            required
            defaultValue={initial?.mieterId ?? ""}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="" disabled>
              Bitte wählen…
            </option>
            {mieter.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="beginn">
            Mietbeginn
          </label>
          <input
            id="beginn"
            name="beginn"
            type="date"
            required
            defaultValue={initial?.beginn}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="ende">
            Mietende (optional)
          </label>
          <input
            id="ende"
            name="ende"
            type="date"
            defaultValue={initial?.ende}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="kaltmiete">
            Kaltmiete (€)
          </label>
          <input
            id="kaltmiete"
            name="kaltmiete"
            type="number"
            step="0.01"
            required
            defaultValue={initial?.kaltmiete}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="nebenkostenVorauszahlung">
            NK-Vorauszahlung (€)
          </label>
          <input
            id="nebenkostenVorauszahlung"
            name="nebenkostenVorauszahlung"
            type="number"
            step="0.01"
            required
            defaultValue={initial?.nebenkostenVorauszahlung}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={initial?.status ?? "AKTIV"}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="AKTIV">Aktiv</option>
          <option value="GEPLANT">Geplant</option>
          <option value="BEENDET">Beendet</option>
        </select>
      </div>

      <fieldset className="rounded-md border border-neutral-800 p-4">
        <legend className="px-1 text-sm font-medium">Kaution (optional)</legend>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionBetrag">
              Betrag (€)
            </label>
            <input
              id="kautionBetrag"
              name="kautionBetrag"
              type="number"
              step="0.01"
              defaultValue={initial?.kautionBetrag ?? ""}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionAnlageform">
              Anlageform
            </label>
            <select
              id="kautionAnlageform"
              name="kautionAnlageform"
              defaultValue={initial?.kautionAnlageform ?? "KAUTIONSKONTO"}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            >
              <option value="KAUTIONSKONTO">Kautionskonto</option>
              <option value="SPARBUCH">Sparbuch</option>
              <option value="BUERGSCHAFT">Bürgschaft</option>
              <option value="BAR">Bar</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="kautionZinssatz">
              Zinssatz (%)
            </label>
            <input
              id="kautionZinssatz"
              name="kautionZinssatz"
              type="number"
              step="0.01"
              defaultValue={initial?.kautionZinssatz ?? ""}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      </fieldset>

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
