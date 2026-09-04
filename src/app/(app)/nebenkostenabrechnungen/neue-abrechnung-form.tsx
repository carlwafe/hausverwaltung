"use client";

import { useActionState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { createAbrechnung } from "./actions";

export function NeueAbrechnungForm() {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(createAbrechnung, formData),
    null,
  );

  return (
    <form action={formAction}>
      <div className="flex items-end gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="jahr">
            Jahr
          </label>
          <input
            id="jahr"
            name="jahr"
            type="number"
            required
            defaultValue={new Date().getFullYear() - 1}
            className="w-28 rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Berechne…" : "Abrechnung erstellen"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
