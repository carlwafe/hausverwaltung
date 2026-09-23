"use client";

import { useActionState, useRef, useState } from "react";
import { DateInput } from "@/components/date-input";
import { speichereKontostandKontrolle } from "./actions";

/** Formular: Kontostand laut Kontoauszug an einem Tag eintragen (Kontrollpunkt). */
export function KontostandKontrolleForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [datumKey, setDatumKey] = useState(0);
  const [fehler, formAction, pending] = useActionState(async (prev: string | null, formData: FormData) => {
    const ergebnis = await speichereKontostandKontrolle(prev, formData);
    if (ergebnis === null) {
      formRef.current?.reset();
      setDatumKey((k) => k + 1);
    }
    return ergebnis;
  }, null);
  const feld =
    "rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400";

  return (
    <form ref={formRef} action={formAction} className="flex flex-wrap items-end gap-3">
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Datum des Kontoauszugs</label>
        <DateInput key={datumKey} name="datum" required size="sm" />
      </div>
      <div>
        <label className="mb-1 block text-xs text-neutral-400">Kontostand laut Kontoauszug (€)</label>
        <input type="text" inputMode="decimal" name="betrag" required placeholder="z.B. 42000,00" className={`w-44 ${feld}`} />
      </div>
      <div className="min-w-[180px] flex-1">
        <label className="mb-1 block text-xs text-neutral-400">Notiz (optional)</label>
        <input type="text" name="notiz" placeholder="z.B. Auszug 06/2026" className={`w-full ${feld}`} />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichere…" : "Kontostand speichern"}
      </button>
      {fehler && <p className="w-full text-sm text-red-400">{fehler}</p>}
    </form>
  );
}
