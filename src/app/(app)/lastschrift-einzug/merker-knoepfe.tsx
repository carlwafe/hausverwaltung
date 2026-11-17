"use client";

import { useActionState } from "react";
import { entferneEinreichung, markiereEingereicht } from "./actions";

// Aktionen geben `string | null` zurück (Meldung bei Fehler), siehe mitMeldung in src/lib/aktion.ts.
export function MarkierenForm({ monat, datum, ohne, anzahl, summe }: { monat: string; datum: string; ohne: string[]; anzahl: number; summe: string }) {
  const [meldung, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => markiereEingereicht(formData), null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="monat" value={monat} />
      <input type="hidden" name="datum" value={datum} />
      {ohne.map((id) => (
        <input key={id} type="hidden" name="ohne" value={id} />
      ))}
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm(`${anzahl} Einzüge über ${summe} als bei der Bank eingereicht markieren?`)) e.preventDefault();
        }}
        className="h-10 rounded-md border border-neutral-600 px-4 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-60"
      >
        {pending ? "Speichere …" : "Als eingereicht markieren"}
      </button>
      {meldung && <span className="text-sm text-red-400">{meldung}</span>}
    </form>
  );
}

export function MerkerEntfernen({ id }: { id: string }) {
  const [meldung, formAction, pending] = useActionState(async () => entferneEinreichung(id), null);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        onClick={(e) => {
          if (!window.confirm("Merker entfernen? Die Verträge dieser Datei werden dann wieder für eine neue Datei vorgeschlagen.")) e.preventDefault();
        }}
        className="text-xs text-neutral-400 underline hover:text-white disabled:opacity-60"
      >
        {pending ? "Entferne …" : "Merker entfernen"}
      </button>
      {meldung && <span className="text-xs text-red-400">{meldung}</span>}
    </form>
  );
}
