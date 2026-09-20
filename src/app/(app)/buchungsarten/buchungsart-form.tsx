"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

export const KONTOKREIS_LABEL: Record<string, string> = {
  MIETKONTO: "Mietkonto (Mieter)",
  KAUTIONSKONTO: "Kautionskonto",
  OBJEKTKONTO: "Objektkonto (Kosten/Eigentümerin)",
};

type Art = {
  code: string;
  bezeichnung: string;
  kontokreis: string;
  zahlungswirksam: boolean;
  eurRelevant: boolean;
  aktiv: boolean;
};

export function BuchungsartForm({
  initial,
  action,
  gesperrt = false,
  systemArt = false,
}: {
  initial?: Art;
  action: (formData: FormData) => Promise<void>;
  gesperrt?: boolean;
  systemArt?: boolean;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const input =
    "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <form action={formAction} className="max-w-lg space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="code">
          Code
        </label>
        <input
          id="code"
          name="code"
          required
          disabled={!!initial}
          defaultValue={initial?.code}
          placeholder="z.B. VERZUGSZINSEN"
          className={`${input} font-mono`}
        />
        {!initial && <p className="mt-1 text-xs text-neutral-500">Eindeutig, danach nicht mehr änderbar.</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="bezeichnung">
          Bezeichnung
        </label>
        <input id="bezeichnung" name="bezeichnung" required defaultValue={initial?.bezeichnung} className={input} />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="kontokreis">
          Kontokreis
        </label>
        <select id="kontokreis" name="kontokreis" disabled={gesperrt} defaultValue={initial?.kontokreis ?? "MIETKONTO"} className={input}>
          {Object.entries(KONTOKREIS_LABEL).map(([v, l]) => (
            <option key={v} value={v} className="bg-neutral-900">
              {l}
            </option>
          ))}
        </select>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="zahlungswirksam" disabled={gesperrt} defaultChecked={initial?.zahlungswirksam ?? true} className="mt-1 h-4 w-4" />
        <span>
          Zahlungswirksam
          <span className="block text-xs text-neutral-500">
            Es fließt echtes Geld über das Konto — die Buchung zählt im Kontostand und lässt sich aus einer Bankzeile importieren.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="eurRelevant" disabled={gesperrt} defaultChecked={initial?.eurRelevant ?? true} className="mt-1 h-4 w-4" />
        <span>
          Eur-relevant
          <span className="block text-xs text-neutral-500">
            Zählt für die steuerliche Einnahmen-Überschuss-Rechnung (Jahresübersicht): positive Beträge als Einnahme, negative als Ausgabe.
          </span>
        </span>
      </label>

      {gesperrt && (
        <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Kontokreis und Flags sind gesperrt, weil bereits Buchungen mit dieser Art existieren — eine Änderung würde
          Kontostand und Jahresübersicht rückwirkend verändern.
        </p>
      )}

      {initial && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="aktiv" disabled={systemArt} defaultChecked={initial.aktiv} className="h-4 w-4" />
          Aktiv{systemArt && " (Systemart, nicht deaktivierbar)"}
        </label>
      )}
      {initial && systemArt && <input type="hidden" name="aktiv" value="on" />}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button type="submit" disabled={pending} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50">
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
