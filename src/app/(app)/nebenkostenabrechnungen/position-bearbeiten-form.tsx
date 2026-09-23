"use client";

import { DateInput } from "@/components/date-input";
import { useActionState, useState } from "react";
import { DeleteButton } from "@/components/delete-button";
import { bearbeitePosition, loeschePosition } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function parseKommaBetrag(text: string): number {
  const bereinigt = text.trim().replace(",", ".");
  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * Bearbeiten einer einzelnen, bereits bestehenden Position — egal ob ursprünglich manuell
 * erfasst oder berechnet. Gleiches Feld-Set wie beim Neuanlegen (ManuellePositionForm):
 * Kostenanteil/Vorauszahlung direkt, Saldo als Vorschau berechnet. Hinter einem eingeklappten
 * "Position bearbeiten"-Link versteckt, analog zur Kostenanteil-Aufschlüsselung direkt daneben.
 */
export function PositionBearbeitenForm({
  positionId,
  initialZeitraumVon,
  initialZeitraumBis,
  initialKostenanteil,
  initialVorauszahlung,
}: {
  positionId: string;
  initialZeitraumVon: string;
  initialZeitraumBis: string;
  initialKostenanteil: number;
  initialVorauszahlung: number;
}) {
  const [kostenanteil, setKostenanteil] = useState(initialKostenanteil.toFixed(2).replace(".", ","));
  const [vorauszahlung, setVorauszahlung] = useState(initialVorauszahlung.toFixed(2).replace(".", ","));
  const action = bearbeitePosition.bind(null, positionId);
  const [fehler, formAction, pending] = useActionState(action, null);

  const saldo = parseKommaBetrag(vorauszahlung) - parseKommaBetrag(kostenanteil);

  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer select-none text-neutral-400 hover:text-white">
        Position bearbeiten
      </summary>
      {/* DeleteButton ist selbst ein <form> — als Kind eines anderen <form> wäre das verschachtelt
          und damit ungültiges HTML (Hydration-Warnung). Das äußere <div> trägt deshalb das
          Flex-Layout, das Speichern-<form> bekommt "contents" (nimmt sich selbst optisch raus,
          seine Kinder bleiben normale Flex-Items), DeleteButton steht als echtes Geschwister
          daneben — exakt dasselbe Layout wie vorher, nur ohne verschachteltes Formular. */}
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <form action={formAction} className="contents">
          <div>
            <label className="mb-1 block text-neutral-400">Zeitraum von</label>
            <DateInput name="zeitraumVon" required size="sm" defaultValue={initialZeitraumVon} />
          </div>
          <div>
            <label className="mb-1 block text-neutral-400">Zeitraum bis</label>
            <DateInput name="zeitraumBis" required size="sm" defaultValue={initialZeitraumBis} />
          </div>
          <div>
            <label className="mb-1 block text-neutral-400">Kostenanteil</label>
            <input
              type="text"
              inputMode="decimal"
              name="kostenanteil"
              required
              value={kostenanteil}
              onChange={(e) => setKostenanteil(e.target.value)}
              className="w-24 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-neutral-400">Vorauszahlung</label>
            <input
              type="text"
              inputMode="decimal"
              name="vorauszahlung"
              required
              value={vorauszahlung}
              onChange={(e) => setVorauszahlung(e.target.value)}
              className="w-24 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <p className="mb-1 text-neutral-400">Saldo</p>
            <p className={`px-2 py-1 font-medium ${saldo >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatEuro(saldo)}
            </p>
          </div>
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-white px-3 py-1 font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Speichern"}
          </button>
          {fehler && <p className="w-full text-red-400">{fehler}</p>}
        </form>
        <DeleteButton
          action={loeschePosition.bind(null, positionId)}
          confirmText="Position wirklich löschen?"
          label="Position löschen"
          size="sm"
        />
      </div>
    </details>
  );
}
