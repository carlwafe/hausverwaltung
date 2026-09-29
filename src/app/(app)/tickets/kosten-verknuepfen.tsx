"use client";

import { useState, useTransition } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { verknuepfeKosten } from "./actions";

export function KostenVerknuepfen({ ticketId, kandidaten }: { ticketId: string; kandidaten: { id: string; label: string }[] }) {
  const [auswahl, setAuswahl] = useState("");
  const [fehler, setFehler] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-64 flex-1">
          <MietvertragAuswahl
            kandidaten={kandidaten}
            value={auswahl}
            onChange={setAuswahl}
            leerLabel="– Kostenposition wählen –"
            size="md"
          />
        </div>
        <button
          type="button"
          disabled={pending || !auswahl}
          onClick={() =>
            startTransition(async () => {
              const f = await verknuepfeKosten(ticketId, auswahl);
              setFehler(f);
              if (!f) setAuswahl("");
            })
          }
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          {pending ? "Verknüpfen…" : "Verknüpfen"}
        </button>
      </div>
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}
