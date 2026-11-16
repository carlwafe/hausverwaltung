"use client";

import { useActionState, useRef } from "react";
import { leseKontosaldenAusXml, type SaldenErgebnis } from "./actions";

/** Salden aus CAMT-XML-Dateien nachträglich einlesen (ohne zu buchen). */
export function SaldenEinlesenForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [ergebnis, formAction, pending] = useActionState(async (prev: SaldenErgebnis, formData: FormData) => {
    const neu = await leseKontosaldenAusXml(prev, formData);
    if (neu?.ok) formRef.current?.reset();
    return neu;
  }, null as SaldenErgebnis);

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1">
          <label className="mb-1 block text-xs text-neutral-400">CAMT-Dateien (.xml), mehrere möglich</label>
          <input
            type="file"
            name="file"
            accept=".xml,application/xml,text/xml"
            multiple
            required
            className="block h-10 w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-neutral-300 file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-xs file:text-white"
          />
        </div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Lese ein…" : "Salden einlesen"}
        </button>
      </div>
      {ergebnis && <p className={`text-sm ${ergebnis.ok ? "text-green-400" : "text-red-400"}`}>{ergebnis.meldung}</p>}
    </form>
  );
}
