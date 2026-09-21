"use client";

import { useState, useTransition } from "react";
import { speichereJahresberichtBemerkung } from "./actions";

// Speichert beim Verlassen des Feldes (bzw. Enter), nur wenn sich der Text geändert hat.
export function BemerkungFeld({
  mietvertragId,
  jahr,
  initial,
}: {
  mietvertragId: string;
  jahr: number;
  initial: string;
}) {
  const [text, setText] = useState(initial);
  const [gespeichert, setGespeichert] = useState(initial);
  const [isPending, startTransition] = useTransition();

  function speichern() {
    if (text.trim() === gespeichert.trim()) return;
    const neu = text.trim();
    startTransition(async () => {
      await speichereJahresberichtBemerkung(mietvertragId, jahr, neu);
      setGespeichert(neu);
      setText(neu);
    });
  }

  return (
    <input
      type="text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={speichern}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
      placeholder="–"
      disabled={isPending}
      className="w-48 rounded border border-transparent bg-transparent px-2 py-1 text-xs text-neutral-300 placeholder:text-neutral-700 hover:border-neutral-700 focus:border-neutral-500 focus:outline-none disabled:opacity-50"
    />
  );
}
