"use client";

import { useTransition } from "react";
import { toggleJahresberichtVerifiziert } from "./actions";

export function VerifikationsStern({
  mietvertragId,
  jahr,
  verifiziert,
}: {
  mietvertragId: string;
  jahr: number;
  verifiziert: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={
        verifiziert
          ? "Saldo neu stimmt mit dem vorhandenen Jahresbericht überein — klicken zum Entfernen"
          : "Markieren: Saldo neu stimmt mit dem vorhandenen Jahresbericht überein"
      }
      onClick={() => startTransition(() => toggleJahresberichtVerifiziert(mietvertragId, jahr))}
      disabled={isPending}
      className={`text-base leading-none disabled:opacity-50 ${
        verifiziert ? "text-amber-400 hover:text-amber-300" : "text-neutral-700 hover:text-neutral-400"
      }`}
    >
      {verifiziert ? "★" : "☆"}
    </button>
  );
}
