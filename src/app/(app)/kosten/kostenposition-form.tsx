"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Kostenposition = {
  kostenartId: string;
  gebaeudeId: string;
  jahr: number;
  betrag: string;
  beschreibung: string | null;
  empfaenger: string | null;
};

export function KostenpositionForm({
  kostenarten,
  gebaeude,
  initial,
  action,
}: {
  kostenarten: { id: string; label: string }[];
  gebaeude: { id: string; label: string }[];
  initial?: Kostenposition;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="kostenartId">
          Kostenart
        </label>
        <select
          id="kostenartId"
          name="kostenartId"
          required
          defaultValue={initial?.kostenartId ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="" disabled>
            Bitte wählen…
          </option>
          {kostenarten.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="gebaeudeId">
          Gebäude
        </label>
        <select
          id="gebaeudeId"
          name="gebaeudeId"
          required
          defaultValue={initial?.gebaeudeId ?? ""}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="" disabled>
            Bitte wählen…
          </option>
          {gebaeude.map((g) => (
            <option key={g.id} value={g.id}>
              {g.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="jahr">
            Jahr
          </label>
          <input
            id="jahr"
            name="jahr"
            type="number"
            required
            defaultValue={initial?.jahr ?? new Date().getFullYear()}
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
            defaultValue={initial?.betrag}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="empfaenger">
          Empfänger (optional)
        </label>
        <input
          id="empfaenger"
          name="empfaenger"
          defaultValue={initial?.empfaenger ?? ""}
          placeholder="z.B. Handwerksfirma, Versorger"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="beschreibung">
          Beschreibung (optional)
        </label>
        <textarea
          id="beschreibung"
          name="beschreibung"
          rows={3}
          defaultValue={initial?.beschreibung ?? ""}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
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
