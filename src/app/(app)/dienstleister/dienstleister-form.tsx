"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Dienstleister = {
  name: string;
  suchbegriffe: string;
  kostenartIds: string[];
  iban: string | null;
  notiz: string | null;
  aktiv: boolean;
};

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

export function DienstleisterForm({
  initial,
  kostenarten,
  action,
}: {
  initial?: Dienstleister;
  kostenarten: { id: string; label: string }[];
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
          placeholder="z.B. Stadtwerke Eutin"
          className={inputClass}
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="suchbegriffe">
          Suchbegriffe
        </label>
        <p className="mb-1 text-xs text-neutral-500">
          Ein Begriff pro Zeile (mind. 3 Zeichen). Kommt einer davon im Empfänger oder Verwendungszweck
          einer Kontoauszugszeile vor, wird sie diesem Dienstleister zugeordnet — ohne Beachtung von
          Groß-/Kleinschreibung und Umlauten.
        </p>
        <textarea
          id="suchbegriffe"
          name="suchbegriffe"
          required
          rows={3}
          defaultValue={initial?.suchbegriffe}
          placeholder={"stadtwerke eutin\nSWE Eutin"}
          className={inputClass}
        />
      </div>

      <fieldset>
        <legend className="mb-1 block text-sm font-medium">Kostenarten (optional, mehrere möglich)</legend>
        <p className="mb-2 text-xs text-neutral-500">
          Genau eine Kostenart wird beim Import fest vorgeschlagen. Bei mehreren oder keiner bleibt die
          Kostenart offen bzw. aus dem bisherigen Verlauf (sofern sie zu den gewählten gehört).
        </p>
        <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-neutral-700 p-2">
          {kostenarten.map((k) => (
            <label key={k.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="kostenartIds"
                value={k.id}
                defaultChecked={initial?.kostenartIds.includes(k.id)}
              />
              {k.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="iban">
          IBAN (optional)
        </label>
        <input id="iban" name="iban" defaultValue={initial?.iban ?? ""} className={inputClass} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="notiz">
          Notiz (optional)
        </label>
        <textarea id="notiz" name="notiz" rows={2} defaultValue={initial?.notiz ?? ""} className={inputClass} />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="aktiv" defaultChecked={initial?.aktiv ?? true} />
        Beim Import automatisch zuordnen
      </label>

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
