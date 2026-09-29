"use client";

import { useActionState, useRef } from "react";

export function KommentarForm({ action }: { action: (prev: string | null, formData: FormData) => Promise<string | null> }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [fehler, formAction, pending] = useActionState(async (prev: string | null, formData: FormData) => {
    const ergebnis = await action(prev, formData);
    if (!ergebnis) formRef.current?.reset();
    return ergebnis;
  }, null);

  return (
    <form ref={formRef} action={formAction} className="mt-4 space-y-2">
      <textarea
        name="text"
        rows={3}
        required
        placeholder="Kommentar hinzufügen…"
        className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
      />
      {fehler && <p className="text-sm text-red-400">{fehler}</p>}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Kommentieren"}
      </button>
    </form>
  );
}
