"use client";

import { useState, useTransition } from "react";
import { speichereJahresberichtKommentar } from "./actions";

// Speichert beim Verlassen des Felds (bzw. Enter), nur bei tatsächlicher Änderung.
export function KommentarFeld({
  mietvertragId,
  jahr,
  kommentar,
}: {
  mietvertragId: string;
  jahr: number;
  kommentar: string;
}) {
  const [wert, setWert] = useState(kommentar);
  const [gespeichert, setGespeichert] = useState(kommentar);
  const [isPending, startTransition] = useTransition();

  function speichern() {
    if (wert.trim() === gespeichert.trim()) return;
    startTransition(async () => {
      await speichereJahresberichtKommentar(mietvertragId, jahr, wert);
      setGespeichert(wert);
    });
  }

  return (
    <input
      type="text"
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onBlur={speichern}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      disabled={isPending}
      placeholder="Kommentar…"
      maxLength={300}
      className="w-56 rounded-md border border-neutral-800 bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
    />
  );
}
