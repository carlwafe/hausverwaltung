"use client";

import { useActionState } from "react";
import { erfasseWohnflaecheKorrektur } from "./actions";

export function WohnflaecheKorrekturForm({ einheitId }: { einheitId: string }) {
  const [fehler, formAction, pending] = useActionState(erfasseWohnflaecheKorrektur.bind(null, einheitId), null);

  return (
    <form
      action={formAction}
      className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
    >
      <div>
        <label className="block text-xs text-neutral-400">Bis Jahr (einschließlich)</label>
        <input
          type="number"
          name="bisJahr"
          required
          defaultValue={new Date().getFullYear() - 1}
          className="mt-1 w-24 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </div>
      <div>
        <label className="block text-xs text-neutral-400">Wohnfläche (qm)</label>
        <input
          type="number"
          step="0.01"
          min="0.01"
          name="wohnflaecheQm"
          required
          className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </div>
      <div className="flex-1">
        <label className="block text-xs text-neutral-400">Notizen (optional)</label>
        <input
          type="text"
          name="notizen"
          placeholder="z.B. Grund der Korrektur"
          className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichere…" : "+ Korrektur erfassen"}
      </button>
      {fehler && <p className="w-full text-sm text-red-400">{fehler}</p>}
    </form>
  );
}
