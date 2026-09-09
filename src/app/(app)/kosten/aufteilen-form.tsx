"use client";

import { useActionState, useState } from "react";
import { teileKostenpositionAuf } from "./actions";

type Zeile = { kostenartId: string; betrag: string; beschreibung: string };

function neueZeile(): Zeile {
  return { kostenartId: "", betrag: "", beschreibung: "" };
}

function parseKommaBetrag(text: string): number {
  const bereinigt = text.trim().replace(",", ".");
  const wert = Number(bereinigt);
  return Number.isFinite(wert) ? wert : 0;
}

/**
 * Absichtlich hinter einem eingeklappten "Aufteilen"-Link versteckt statt als eigener Button
 * direkt neben Speichern/Löschen — das Aufteilen einer einzelnen Buchung in mehrere Kostenarten
 * ist ein seltener Sonderfall (z.B. eine Hausmeister-Rechnung mit umlagefähigem und nicht
 * umlagefähigem Anteil), der in der normalen Bearbeitung nicht in den Weg stehen soll.
 */
export function AufteilenForm({
  kostenpositionId,
  betragGesamt,
  kostenarten,
  aktuelleKostenartId,
}: {
  kostenpositionId: string;
  betragGesamt: number;
  kostenarten: { id: string; name: string }[];
  aktuelleKostenartId: string;
}) {
  const [offen, setOffen] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([
    { kostenartId: aktuelleKostenartId, betrag: betragGesamt.toFixed(2).replace(".", ","), beschreibung: "" },
    neueZeile(),
  ]);

  const action = teileKostenpositionAuf.bind(null, kostenpositionId);
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
          kostenartId: z.kostenartId,
          betrag: parseKommaBetrag(z.betrag),
          beschreibung: z.beschreibung || undefined,
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
        className="text-sm text-neutral-500 hover:text-neutral-300 hover:underline"
      >
        Auf mehrere Kostenarten aufteilen…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-3 text-sm font-medium text-white">
        Buchung ({betragGesamt.toFixed(2)} €) auf mehrere Kostenarten aufteilen
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Ersetzt diese Position durch die unten angegebenen — z.B. eine Hausmeister-Rechnung, die
        sowohl umlagefähigen Hausmeisterdienst als auch nicht umlagefähigen Winterdienst enthält.
      </p>
      <form action={submit} className="space-y-2">
        {zeilen.map((zeile, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="flex-1">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Kostenart</label>}
              <select
                value={zeile.kostenartId}
                onChange={(e) => aktualisiereZeile(i, { kostenartId: e.target.value })}
                required
                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400"
              >
                <option value="">– wählen –</option>
                {kostenarten.map((k) => (
                  <option key={k.id} value={k.id} className="bg-neutral-900">
                    {k.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-28">
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
            <div className="flex-1">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Beschreibung</label>}
              <input
                type="text"
                value={zeile.beschreibung}
                onChange={(e) => aktualisiereZeile(i, { beschreibung: e.target.value })}
                placeholder="optional"
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
