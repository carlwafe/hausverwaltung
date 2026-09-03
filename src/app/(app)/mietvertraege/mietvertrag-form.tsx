"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";

type Option = { id: string; label: string };
type EinheitOption = Option & { typ: "WOHNUNG" | "GARAGE" };

type Initial = {
  einheitId: string;
  mieterId1: string;
  mieterId2?: string;
  beginn: string;
  ende: string;
  kaltmiete: string;
  nebenkostenVorauszahlung: string;
  mehrwertsteuer?: string;
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
  einheiten: EinheitOption[];
  mieter: Option[];
  initial?: Initial;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [einheitId, setEinheitId] = useState(initial?.einheitId ?? "");
  const istGarage = einheiten.find((e) => e.id === einheitId)?.typ === "GARAGE";

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="einheitId">
          Einheit
        </label>
        <select
          id="einheitId"
          name="einheitId"
          required
          value={einheitId}
          onChange={(e) => setEinheitId(e.target.value)}
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mieterId1">
            Mieter
          </label>
          <select
            id="mieterId1"
            name="mieterId1"
            required
            defaultValue={initial?.mieterId1 ?? ""}
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

        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mieterId2">
            2. Mieter (optional)
          </label>
          <select
            id="mieterId2"
            name="mieterId2"
            defaultValue={initial?.mieterId2 ?? ""}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="">– keiner –</option>
            {mieter.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DateInput
          id="beginn"
          name="beginn"
          label="Mietbeginn"
          defaultValue={initial?.beginn}
          labelClassName="min-h-10"
        />
        <DateInput
          id="ende"
          name="ende"
          label="Mietende (erforderlich bei Status „Beendet“)"
          defaultValue={initial?.ende}
          labelClassName="min-h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 flex min-h-10 items-end text-sm font-medium" htmlFor="kaltmiete">
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
          <label
            className="mb-1 flex min-h-10 items-end text-sm font-medium"
            htmlFor="nebenkostenVorauszahlung"
          >
            NK-Vorauszahlung (€){istGarage && " (optional bei Garagen)"}
          </label>
          <input
            id="nebenkostenVorauszahlung"
            name="nebenkostenVorauszahlung"
            type="number"
            step="0.01"
            required={!istGarage}
            defaultValue={initial?.nebenkostenVorauszahlung}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {istGarage && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="mehrwertsteuer">
            Mehrwertsteuer (€)
          </label>
          <input
            id="mehrwertsteuer"
            name="mehrwertsteuer"
            type="number"
            step="0.01"
            required
            defaultValue={initial?.mehrwertsteuer}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      )}

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
