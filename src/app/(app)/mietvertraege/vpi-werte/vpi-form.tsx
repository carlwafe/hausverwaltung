"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/submit-button";
import { speichereVpi } from "./actions";

const feld = "rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm text-white";

export function VpiForm({ jahr, monat }: { jahr: number; monat: number }) {
  const [meldung, setMeldung] = useState<string | null>(null);
  return (
    <form
      action={async (fd) => setMeldung(await speichereVpi(fd))}
      className="flex flex-wrap items-end gap-3"
    >
      <label className="text-xs text-neutral-400">
        Jahr
        <input name="jahr" type="number" defaultValue={jahr} className={`${feld} mt-1 block w-24`} />
      </label>
      <label className="text-xs text-neutral-400">
        Monat
        <input name="monat" type="number" min={1} max={12} defaultValue={monat} className={`${feld} mt-1 block w-20`} />
      </label>
      <label className="text-xs text-neutral-400">
        Indexwert
        <input name="wert" inputMode="decimal" placeholder="z.B. 121,8" required className={`${feld} mt-1 block w-28`} />
      </label>
      <SubmitButton className="rounded bg-white px-3 py-1.5 text-sm font-medium text-black" pendingLabel="Speichert…">
        Speichern
      </SubmitButton>
      {meldung && <p className="text-sm text-red-400">{meldung}</p>}
    </form>
  );
}
