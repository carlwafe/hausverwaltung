"use client";

import { useTransition } from "react";
import { toggleJahresberichtVerifiziert } from "./actions";

export function VerifikationsStern({
  mietvertragId,
  jahr,
  quartal = 0,
  verifiziert,
}: {
  mietvertragId: string;
  jahr: number;
  quartal?: number;
  verifiziert: boolean;
}) {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      title={
        verifiziert
          ? "Saldo neu stimmt mit dem vorhandenen Bericht des früheren Verwalters überein — klicken zum Entfernen"
          : "Markieren: Saldo neu stimmt mit dem vorhandenen Bericht des früheren Verwalters überein"
      }
      onClick={() => startTransition(() => toggleJahresberichtVerifiziert(mietvertragId, jahr, quartal))}
      disabled={isPending}
      className={`text-base leading-none disabled:opacity-50 ${
        verifiziert ? "text-amber-400 hover:text-amber-300" : "text-neutral-700 hover:text-neutral-400"
      }`}
    >
      {verifiziert ? "★" : "☆"}
    </button>
  );
}
