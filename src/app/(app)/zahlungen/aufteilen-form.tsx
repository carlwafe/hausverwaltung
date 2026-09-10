"use client";

import { useActionState, useState } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { teileZahlungAuf } from "./actions";

const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

type Zeile = { mietvertragId: string; betrag: string; periodeMonat: number; periodeJahr: number };

function parseKommaBetrag(text: string): number {
  const bereinigt = text.trim().replace(",", ".");
  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * Absichtlich hinter einem eingeklappten "Aufteilen"-Link versteckt, siehe Kosten-Vorbild
 * (kosten/aufteilen-form.tsx) — das Aufteilen einer einzelnen Zahlung auf mehrere Mietverträge
 * ist ein seltener Sonderfall (z.B. eine Überweisung, die Miete für Wohnung und Garage in einer
 * Summe zahlt), der in der normalen Bearbeitung nicht im Weg stehen soll.
 */
export function AufteilenForm({
  zahlungId,
  betragGesamt,
  aktuelleMietvertragId,
  periodeMonat,
  periodeJahr,
  mietvertraege,
}: {
  zahlungId: string;
  betragGesamt: number;
  aktuelleMietvertragId: string;
  periodeMonat: number;
  periodeJahr: number;
  mietvertraege: { id: string; label: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const neueZeile = (): Zeile => ({ mietvertragId: "", betrag: "", periodeMonat, periodeJahr });
  const [zeilen, setZeilen] = useState<Zeile[]>([
    {
      mietvertragId: aktuelleMietvertragId,
      betrag: betragGesamt.toFixed(2).replace(".", ","),
      periodeMonat,
      periodeJahr,
    },
    neueZeile(),
  ]);

  const action = teileZahlungAuf.bind(null, zahlungId);
  const [fehler, formAction, pending] = useActionState(action, null);

  const summe = zeilen.reduce((s, z) => s + parseKommaBetrag(z.betrag), 0);
  const differenz = Math.round((betragGesamt - summe) * 100) / 100;

  function aktualisiereZeile(index: number, patch: Partial<Zeile>) {
    setZeilen((z) => z.map((zeile, i) => (i === index ? { ...zeile, ...patch } : zeile)));
  }

  function zeileEntfernen(index: number) {
    setZeilen((z) => z.filter((_, i) => i !== index));
  }

  function submit(formData: FormData) {
    formData.set(
      "teile",
      JSON.stringify(
        zeilen.map((z) => ({
          mietvertragId: z.mietvertragId,
          betrag: parseKommaBetrag(z.betrag),
          periodeMonat: z.periodeMonat,
          periodeJahr: z.periodeJahr,
        })),
      ),
    );
    formAction(formData);
  }

  if (!offen) {
    return (
      <button
        type="button"
        onClick={() => setOffen(true)}
        className="mt-4 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
      >
        Auf mehrere Mietverträge aufteilen…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-3 text-sm font-medium text-white">
        Zahlung ({betragGesamt.toFixed(2)} €) auf mehrere Mietverträge aufteilen
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Ersetzt diese Zahlung durch die unten angegebenen — z.B. eine Überweisung, die Miete für
        Wohnung und Garage in einer Summe zahlt.
      </p>
      <form action={submit} className="space-y-2">
        {zeilen.map((zeile, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Mietvertrag</label>}
              <MietvertragAuswahl
                kandidaten={mietvertraege}
                value={zeile.mietvertragId}
                leerLabel="– wählen –"
                onChange={(id) => aktualisiereZeile(i, { mietvertragId: id })}
              />
            </div>
            <div className="w-24">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Betrag</label>}
              <input
                type="text"
                inputMode="decimal"
                value={zeile.betrag}
                onChange={(e) => aktualisiereZeile(i, { betrag: e.target.value })}
                placeholder="0,00"
                required
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <div className="w-20">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Monat</label>}
              <select
                value={zeile.periodeMonat}
                onChange={(e) => aktualisiereZeile(i, { periodeMonat: Number(e.target.value) })}
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              >
                {MONATE_KURZ.map((name, idx) => (
                  <option key={name} value={idx + 1} className="bg-neutral-900">
                    {name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-16">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Jahr</label>}
              <input
                type="number"
                value={zeile.periodeJahr}
                onChange={(e) => aktualisiereZeile(i, { periodeJahr: Number(e.target.value) })}
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              />
            </div>
            <button
              type="button"
              onClick={() => zeileEntfernen(i)}
              disabled={zeilen.length <= 2}
              className="rounded-md border border-neutral-700 px-2 py-1.5 text-sm text-neutral-400 hover:bg-neutral-900 disabled:opacity-30"
            >
              −
            </button>
          </div>
        ))}

        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={() => setZeilen((z) => [...z, neueZeile()])}
            className="text-sm text-neutral-400 hover:text-white hover:underline"
          >
            + weitere Zeile
          </button>
          <span className={`text-sm ${differenz === 0 ? "text-green-400" : "text-amber-400"}`}>
            {differenz === 0
              ? "Summe stimmt überein"
              : `Differenz: ${differenz.toFixed(2)} € ${differenz > 0 ? "fehlen" : "zu viel"}`}
          </span>
        </div>

        {fehler && <p className="text-sm text-red-400">{fehler}</p>}

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={pending || differenz !== 0}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            {pending ? "Speichere…" : "Aufteilung speichern"}
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
