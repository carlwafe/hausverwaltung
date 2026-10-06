"use client";

import { useState, useTransition } from "react";
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
  // Zustand lokal halten und sofort umschalten; die Server-Aktion speichert nur und meldet den
  // tatsächlichen Zustand zurück (kein Neuberechnen des Berichts, siehe actions.ts).
  const [an, setAn] = useState(verifiziert);

  function umschalten() {
    setAn((vorher) => !vorher);
    startTransition(async () => {
      try {
        setAn(await toggleJahresberichtVerifiziert(mietvertragId, jahr, quartal));
      } catch {
        setAn(verifiziert);
      }
    });
  }

  return (
    <button
      type="button"
      title={
        an
          ? "Saldo neu stimmt mit dem vorhandenen Bericht des früheren Verwalters überein — klicken zum Entfernen"
          : "Markieren: Saldo neu stimmt mit dem vorhandenen Bericht des früheren Verwalters überein"
      }
      onClick={umschalten}
      disabled={isPending}
      className={`text-base leading-none disabled:opacity-50 ${
        an ? "text-amber-400 hover:text-amber-300" : "text-neutral-700 hover:text-neutral-400"
      }`}
    >
      {an ? "★" : "☆"}
    </button>
  );
}
