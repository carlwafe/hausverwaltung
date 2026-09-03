"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

const VERTEILERSCHLUESSEL_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
  PERSONENZAHL: "Personenzahl",
  EINHEITEN: "Anzahl Einheiten",
  VERBRAUCH_MANUELL: "Verbrauch (manuell)",
};

type Kostenart = {
  name: string;
  umlagefaehig: boolean;
  standardVerteilerschluessel: string | null;
};

export function KostenartForm({
  initial,
  action,
}: {
  initial?: Kostenart;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="z.B. Heizung, Wasser, Hausmeister"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="umlagefaehig"
          defaultChecked={initial?.umlagefaehig ?? true}
          className="h-4 w-4 rounded border-neutral-700 bg-transparent"
        />
        Umlagefähig auf Mieter (Betriebskosten)
      </label>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="standardVerteilerschluessel">
          Standard-Verteilerschlüssel (optional)
        </label>
        <select
          id="standardVerteilerschluessel"
          name="standardVerteilerschluessel"
          defaultValue={initial?.standardVerteilerschluessel ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="">– keiner –</option>
          {Object.entries(VERTEILERSCHLUESSEL_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
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
