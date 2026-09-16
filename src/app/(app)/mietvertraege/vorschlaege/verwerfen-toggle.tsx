"use client";

import { useTransition } from "react";
import { toggleMieterhoehungVorschlagVerworfen } from "../actions";

export function VerwerfenToggle({
  mietvertragId,
  abJahr,
  abMonat,
  verworfen,
}: {
  mietvertragId: string;
  abJahr: number;
  abMonat: number;
  verworfen: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      onClick={() => startTransition(() => toggleMieterhoehungVorschlagVerworfen(mietvertragId, abJahr, abMonat))}
      disabled={isPending}
      className={`rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50 ${
        verworfen
          ? "border-neutral-700 text-white hover:bg-neutral-900"
          : "border-neutral-800 text-neutral-400 hover:bg-neutral-900 hover:text-white"
      }`}
    >
      {verworfen ? "Wieder anzeigen" : "Verwerfen"}
    </button>
  );
}
