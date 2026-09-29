"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Typ = "HANDWERKER" | "SONSTIGE";

type Dienstleister = {
  typ: Typ;
  name: string;
  beschreibung: string | null;
  ansprechpartner: string | null;
  telefon: string | null;
  email: string | null;
  adresse: string | null;
  suchbegriffe: string;
  kostenartIds: string[];
  iban: string | null;
  notiz: string | null;
  aktiv: boolean;
};

const inputClass =
  "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";
const labelClass = "mb-1 block text-sm font-medium";

export function DienstleisterForm({
  initial,
  standardTyp = "SONSTIGE",
  kostenarten,
  action,
}: {
  initial?: Dienstleister;
  standardTyp?: Typ;
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
        <label className={labelClass} htmlFor="typ">
          Typ
        </label>
        <select id="typ" name="typ" defaultValue={initial?.typ ?? standardTyp} className={inputClass}>
          <option value="HANDWERKER" className="bg-neutral-900">
            Handwerker (Elektriker, Sanitär, Tischler …)
          </option>
          <option value="SONSTIGE" className="bg-neutral-900">
            Sonstiger Dienstleister (Verwaltung, Versorger, Versicherung …)
          </option>
        </select>
      </div>

      <div>
        <label className={labelClass} htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="z.B. Elektro-Service Knoop GbR"
          className={inputClass}
        />
      </div>

      <div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="aktiv" defaultChecked={initial?.aktiv ?? true} />
          Aktiv (wird aktuell genutzt)
        </label>
        <p className="mt-1 text-xs text-neutral-500">
          Inaktive erscheinen in der Liste weiter unten, z.B. nach einem Wechsel. Die automatische
          Zuordnung beim Import gilt weiterhin, damit ältere Kontoauszüge zugeordnet werden.
        </p>
      </div>

      <div>
        <label className={labelClass} htmlFor="beschreibung">
          Beschreibung
        </label>
        <input
          id="beschreibung"
          name="beschreibung"
          defaultValue={initial?.beschreibung ?? ""}
          placeholder="z.B. Elektriker, Notdienst"
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass} htmlFor="ansprechpartner">
          Ansprechpartner
        </label>
        <input
          id="ansprechpartner"
          name="ansprechpartner"
          defaultValue={initial?.ansprechpartner ?? ""}
          className={inputClass}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass} htmlFor="telefon">
            Telefon
          </label>
          <input id="telefon" name="telefon" type="tel" defaultValue={initial?.telefon ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass} htmlFor="email">
            E-Mail
          </label>
          <input id="email" name="email" type="email" defaultValue={initial?.email ?? ""} className={inputClass} />
        </div>
      </div>

      <div>
        <label className={labelClass} htmlFor="adresse">
          Adresse
        </label>
        <textarea id="adresse" name="adresse" rows={2} defaultValue={initial?.adresse ?? ""} className={inputClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="notiz">
          Notiz
        </label>
        <textarea id="notiz" name="notiz" rows={2} defaultValue={initial?.notiz ?? ""} className={inputClass} />
      </div>

      <div>
        <label className={labelClass} htmlFor="iban">
          IBAN
        </label>
        <input id="iban" name="iban" defaultValue={initial?.iban ?? ""} className={inputClass} />
      </div>

      <div className="space-y-4 rounded-md border border-neutral-800 p-4">
        <div>
          <h2 className="text-sm font-semibold text-white">Zuordnung beim Kosten-Import (optional)</h2>
          <p className="text-xs text-neutral-500">
            Ohne Suchbegriffe wird beim Import nichts automatisch zugeordnet.
          </p>
        </div>

        <div>
          <label className={labelClass} htmlFor="suchbegriffe">
            Suchbegriffe
          </label>
          <p className="mb-1 text-xs text-neutral-500">
            Ein Begriff pro Zeile (mind. 3 Zeichen). Kommt einer davon im Empfänger oder Verwendungszweck
            einer Kontoauszugszeile vor, wird sie diesem Eintrag zugeordnet — ohne Beachtung von
            Groß-/Kleinschreibung und Umlauten.
          </p>
          <textarea
            id="suchbegriffe"
            name="suchbegriffe"
            rows={3}
            defaultValue={initial?.suchbegriffe}
            placeholder={"stadtwerke eutin\nSWE Eutin"}
            className={inputClass}
          />
        </div>

        <fieldset>
          <legend className="mb-1 block text-sm font-medium">Kostenarten (mehrere möglich)</legend>
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
