"use client";

import { useActionState, useState } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { toDateInputValue } from "@/lib/date-utils";
import { fuegePositionManuellHinzu } from "./actions";

/**
 * Für Jahre mit unvollständigen/unzuverlässigen Kostendaten (z.B. 2024), wo die eigentliche
 * Berechnung (berechneNebenkostenabrechnung) keine sinnvollen Kostenanteile liefern kann — trägt
 * direkt den Saldo (Guthaben/Nachzahlung) ein, ohne dass Kostenanteil/Vorauszahlung einzeln
 * korrekt sein müssen. Absichtlich hinter einem eingeklappten Link versteckt, analog zum
 * Aufteilen einer Kostenposition — ein seltener Sonderfall, der die normale Ansicht nicht
 * zumüllen soll.
 */
export function ManuellePositionForm({
  abrechnungId,
  jahr,
  mietvertragKandidaten,
}: {
  abrechnungId: string;
  jahr: number;
  mietvertragKandidaten: { id: string; label: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const [mietvertragId, setMietvertragId] = useState("");
  const action = fuegePositionManuellHinzu.bind(null, abrechnungId);
  const [fehler, formAction, pending] = useActionState(action, null);

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mt-4 text-sm text-neutral-500 hover:text-neutral-300 hover:underline"
      >
        Position manuell hinzufügen…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-3 text-sm font-medium text-white">Position manuell hinzufügen</p>
      <p className="mb-3 text-xs text-neutral-500">
        Nur der Saldo (Guthaben/Nachzahlung) ist hier verlässlich — Kostenanteil und
        Vorauszahlung werden nicht einzeln berechnet.
      </p>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="mietvertragId" value={mietvertragId} />
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Mietvertrag</label>
          <MietvertragAuswahl
            kandidaten={mietvertragKandidaten}
            value={mietvertragId}
            onChange={setMietvertragId}
            leerLabel="– wählen –"
            size="md"
          />
        </div>
        <div className="flex gap-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Zeitraum von</label>
            <input
              type="date"
              name="zeitraumVon"
              required
              defaultValue={toDateInputValue(new Date(Date.UTC(jahr, 0, 1)))}
              className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Zeitraum bis</label>
            <input
              type="date"
              name="zeitraumBis"
              required
              defaultValue={toDateInputValue(new Date(Date.UTC(jahr, 11, 31)))}
              className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">
              Saldo (€, positiv = Guthaben)
            </label>
            <input
              type="text"
              inputMode="decimal"
              name="saldo"
              required
              placeholder="-150,00"
              className="w-32 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>

        {fehler && <p className="text-sm text-red-400">{fehler}</p>}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !mietvertragId}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Position speichern"}
          </button>
          <button
            type="button"
            onClick={() => setOffen(false)}
            className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-neutral-300 hover:bg-neutral-900"
          >
            Abbrechen
          </button>
        </div>
      </form>
    </div>
  );
}
