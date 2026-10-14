"use client";

import { useState, useTransition } from "react";
import { ordneDarlehensrateZu } from "./actions";

// Dropdown „Darlehen“ einer gebuchten Rate: speichert sofort (Zuordnung ändern oder entfernen).
export function RateDarlehenSelect({
  ankerId,
  darlehenId,
  darlehen,
  gesperrt,
}: {
  ankerId: string;
  darlehenId: string;
  darlehen: { id: string; label: string }[];
  gesperrt: boolean;
}) {
  const [wert, setWert] = useState(darlehenId);
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const kurz = darlehen.find((d) => d.id === wert)?.label ?? "";

  if (gesperrt) return <span className={wert ? "text-neutral-300" : "text-amber-400"}>{kurz || "nicht zugeordnet"}</span>;
  return (
    <div>
      <select
        value={wert}
        disabled={pending}
        onChange={(e) => {
          const neu = e.target.value;
          setFehler(null);
          start(async () => {
            const meldung = await ordneDarlehensrateZu(ankerId, neu);
            if (typeof meldung === "string") setFehler(meldung);
            else setWert(neu);
          });
        }}
        className={`max-w-[16rem] rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-50 ${
          wert ? "border-neutral-700" : "border-amber-500"
        }`}
      >
        <option value="">– Darlehen wählen –</option>
        {darlehen.map((d) => (
          <option key={d.id} value={d.id}>
            {d.label}
          </option>
        ))}
      </select>
      {fehler && <p className="mt-1 text-xs text-red-400">{fehler}</p>}
    </div>
  );
}
