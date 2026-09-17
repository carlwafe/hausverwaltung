"use client";

import { useActionState, useState } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { toDateInputValue } from "@/lib/date-utils";
import { fuegePositionManuellHinzu } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function parseKommaBetrag(text: string): number {
  const bereinigt = text.trim().replace(",", ".");
  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * Für Jahre mit unvollständigen/unzuverlässigen Kostendaten (z.B. 2024), wo die eigentliche
 * Berechnung (berechneNebenkostenabrechnung) keine sinnvollen Kostenanteile liefern kann — trägt
 * Kostenanteil und Vorauszahlung direkt ein, der Saldo wird daraus berechnet (wie überall sonst:
 * Vorauszahlung - Kostenanteil). Absichtlich hinter einem eingeklappten Link versteckt, analog
 * zum Aufteilen einer Kostenposition — ein seltener Sonderfall, der die normale Ansicht nicht
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
  const [kostenanteil, setKostenanteil] = useState("");
  const [vorauszahlung, setVorauszahlung] = useState("");
  const action = fuegePositionManuellHinzu.bind(null, abrechnungId);
  const [fehler, formAction, pending] = useActionState(action, null);

  const saldo = parseKommaBetrag(vorauszahlung) - parseKommaBetrag(kostenanteil);

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mt-4 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
      >
        Position manuell hinzufügen…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-3 text-sm font-medium text-white">Position manuell hinzufügen</p>
      <p className="mb-3 text-xs text-neutral-500">
        Kostenanteil und Vorauszahlung werden direkt eingetragen — der Saldo ergibt sich daraus
        (Vorauszahlung − Kostenanteil), genau wie bei einer automatisch berechneten Position.
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
        <div className="flex flex-wrap items-end gap-3">
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
            <label className="mb-1 block text-xs text-neutral-400">Kostenanteil</label>
            <input
              type="text"
              inputMode="decimal"
              name="kostenanteil"
              required
              value={kostenanteil}
              onChange={(e) => setKostenanteil(e.target.value)}
              placeholder="0,00"
              className="w-28 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400">Vorauszahlung</label>
            <input
              type="text"
              inputMode="decimal"
              name="vorauszahlung"
              required
              value={vorauszahlung}
              onChange={(e) => setVorauszahlung(e.target.value)}
              placeholder="0,00"
              className="w-28 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <p className="mb-1 text-xs text-neutral-400">Saldo</p>
            <p className={`px-2 py-1.5 text-sm font-medium ${saldo >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatEuro(saldo)}
            </p>
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
