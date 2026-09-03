"use client";

import { useActionState } from "react";
import { updateObjekt } from "./actions";
import { DateInput } from "@/components/date-input";
import { toDateInputValue } from "@/lib/date-utils";

type Objekt = {
  name: string;
  strasse: string;
  hausnummer: string;
  plz: string;
  ort: string;
  beschreibung: string | null;
  buchhaltungAb: Date | string | null;
};

export function ObjektForm({ initial }: { initial: Objekt }) {
  const [error, formAction, pending] = useActionState(updateObjekt, null);

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
          defaultValue={initial.name}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="strasse">
            Straße
          </label>
          <input
            id="strasse"
            name="strasse"
            required
            defaultValue={initial.strasse}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="hausnummer">
            Nr.
          </label>
          <input
            id="hausnummer"
            name="hausnummer"
            required
            defaultValue={initial.hausnummer}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="plz">
            PLZ
          </label>
          <input
            id="plz"
            name="plz"
            required
            defaultValue={initial.plz}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div className="col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="ort">
            Ort
          </label>
          <input
            id="ort"
            name="ort"
            required
            defaultValue={initial.ort}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="beschreibung">
          Beschreibung
        </label>
        <textarea
          id="beschreibung"
          name="beschreibung"
          rows={3}
          defaultValue={initial.beschreibung ?? ""}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <div className="rounded-md border border-neutral-800 p-4">
        <DateInput
          id="buchhaltungAb"
          name="buchhaltungAb"
          label="Buchhaltung erfasst ab (optional)"
          defaultValue={toDateInputValue(initial.buchhaltungAb)}
        />
        <p className="mt-2 text-xs text-neutral-400">
          Soll/Ist-Vergleiche (Offene Posten, Dashboard) rechnen erst ab diesem Datum bzw. ab dem
          Mietbeginn, falls dieser später liegt — sinnvoll, wenn ältere Kontoauszüge nicht mehr
          vorliegen und ein jahrzehntealter Mietbeginn sonst einen riesigen, nicht vergleichbaren
          Sollbetrag ergäbe.
        </p>
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
