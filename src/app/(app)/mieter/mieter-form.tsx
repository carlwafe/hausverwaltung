"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";

type Mieter = {
  vorname: string;
  nachname: string;
  email: string | null;
  telefon: string | null;
};

export function MieterForm({
  initial,
  action,
}: {
  initial?: Mieter;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="vorname">
            Vorname
          </label>
          <input
            id="vorname"
            name="vorname"
            required
            defaultValue={initial?.vorname}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="nachname">
            Nachname
          </label>
          <input
            id="nachname"
            name="nachname"
            required
            defaultValue={initial?.nachname}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="email">
          E-Mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          defaultValue={initial?.email ?? ""}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="telefon">
          Telefon
        </label>
        <input
          id="telefon"
          name="telefon"
          defaultValue={initial?.telefon ?? ""}
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
