"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { speichereJahresberichtKommentar } from "./actions";

// Mehrzeilig (Enter = Zeilenumbruch), wächst mit dem Inhalt mit. Speichert beim Verlassen des Felds,
// nur bei tatsächlicher Änderung.
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
  const ref = useRef<HTMLTextAreaElement>(null);

  // Höhe an den Inhalt anpassen (mindestens zwei Zeilen, per rows).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [wert]);

  function speichern() {
    if (wert.trim() === gespeichert.trim()) return;
    startTransition(async () => {
      await speichereJahresberichtKommentar(mietvertragId, jahr, wert);
      setGespeichert(wert);
    });
  }

  return (
    <textarea
      ref={ref}
      rows={2}
      value={wert}
      onChange={(e) => setWert(e.target.value)}
      onBlur={speichern}
      disabled={isPending}
      placeholder="Kommentar…"
      maxLength={300}
      className="block w-56 resize-none rounded-md border border-neutral-800 bg-transparent px-2 py-1 text-xs text-white outline-none placeholder:text-neutral-600 focus:border-neutral-500 disabled:opacity-50"
    />
  );
}
