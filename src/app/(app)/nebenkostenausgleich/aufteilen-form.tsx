"use client";

import { useActionState, useState } from "react";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { teileNebenkostenausgleichAuf } from "./actions";

type Zeile = {
  typ: "nebenkostenausgleich" | "sonderzahlung";
  mietvertragId: string;
  betrag: string;
  jahr: string;
  beschreibung: string;
};

function parseKommaBetrag(text: string): number {
  const wert = Number(text.trim().replace(",", "."));
  return Number.isFinite(wert) ? wert : 0;
}

const eingabe =
  "w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm outline-none focus:border-neutral-400";

/**
 * Eingeklappt hinter "Aufteilen…", da selten nötig — z.B. wenn eine Auszahlung neben der
 * BK-Rückzahlung ein Mietkonto-Guthaben enthält oder zwei Abrechnungsjahre/Mietverträge auf einmal
 * begleicht. Gegenstück zu zahlungen/aufteilen-form.tsx.
 */
export function NebenkostenausgleichAufteilenForm({
  id,
  betragGesamt,
  aktuelleMietvertragId,
  jahr,
  mietvertraege,
}: {
  id: string;
  betragGesamt: number;
  aktuelleMietvertragId: string;
  jahr: number | null;
  mietvertraege: { id: string; label: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const [zeilen, setZeilen] = useState<Zeile[]>([
    {
      typ: "nebenkostenausgleich",
      mietvertragId: aktuelleMietvertragId,
      betrag: betragGesamt.toFixed(2).replace(".", ","),
      jahr: jahr ? String(jahr) : "",
      beschreibung: "",
    },
    { typ: "sonderzahlung", mietvertragId: aktuelleMietvertragId, betrag: "", jahr: "", beschreibung: "" },
  ]);
  const [fehler, formAction, pending] = useActionState(teileNebenkostenausgleichAuf.bind(null, id), null);

  const summe = zeilen.reduce((s, z) => s + parseKommaBetrag(z.betrag), 0);
  const differenz = Math.round((betragGesamt - summe) * 100) / 100;

  function aktualisiere(index: number, patch: Partial<Zeile>) {
    setZeilen((z) => z.map((zeile, i) => (i === index ? { ...zeile, ...patch } : zeile)));
  }

  function submit(formData: FormData) {
    formData.set(
      "teile",
      JSON.stringify(
        zeilen.map((z) => ({
          typ: z.typ,
          mietvertragId: z.mietvertragId,
          betrag: parseKommaBetrag(z.betrag),
          jahr: z.typ === "nebenkostenausgleich" && z.jahr ? Number(z.jahr) : null,
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
        className="mt-4 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
      >
        Aufteilen…
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">
        Nebenkostenausgleich ({betragGesamt.toFixed(2).replace(".", ",")} €) aufteilen
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Ersetzt diese Buchung durch die unten angegebenen Teile (Bankvorzeichen, Summe = Gesamtbetrag). &quot;Gebühren-Zahlung&quot; bucht
        einen Teil als Zahlung auf dem Mietkonto — z.B. ein zusammen mit der BK-Rückzahlung überwiesenes
        Mietkonto-Guthaben (Auszahlung negativ).
      </p>
      <form action={submit} className="space-y-2">
        {zeilen.map((zeile, i) => (
          <div key={i} className="flex items-end gap-2">
            <div className="w-36">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Typ</label>}
              <select
                value={zeile.typ}
                onChange={(e) => aktualisiere(i, { typ: e.target.value as Zeile["typ"] })}
                className={eingabe}
              >
                <option value="nebenkostenausgleich" className="bg-neutral-900">
                  BK-Ausgleich
                </option>
                <option value="sonderzahlung" className="bg-neutral-900">
                  Gebühren-Zahlung
                </option>
              </select>
            </div>
            <div className="min-w-0 flex-1">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Mietvertrag</label>}
              <MietvertragAuswahl
                kandidaten={mietvertraege}
                value={zeile.mietvertragId}
                leerLabel="– wählen –"
                onChange={(mvId) => aktualisiere(i, { mietvertragId: mvId })}
              />
            </div>
            <div className="w-24">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Betrag</label>}
              <input
                type="text"
                inputMode="decimal"
                value={zeile.betrag}
                onChange={(e) => aktualisiere(i, { betrag: e.target.value })}
                placeholder="0,00"
                required
                className={eingabe}
              />
            </div>
            <div className="w-20">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Jahr</label>}
              <input
                type="number"
                value={zeile.typ === "nebenkostenausgleich" ? zeile.jahr : ""}
                disabled={zeile.typ !== "nebenkostenausgleich"}
                onChange={(e) => aktualisiere(i, { jahr: e.target.value })}
                className={`${eingabe} disabled:opacity-30`}
              />
            </div>
            <div className="flex-1">
              {i === 0 && <label className="mb-1 block text-xs text-neutral-400">Beschreibung</label>}
              <input
                type="text"
                value={zeile.beschreibung}
                onChange={(e) => aktualisiere(i, { beschreibung: e.target.value })}
                placeholder="optional"
                className={eingabe}
              />
            </div>
            <button
              type="button"
              onClick={() => setZeilen((z) => z.filter((_, k) => k !== i))}
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
            onClick={() =>
              setZeilen((z) => [
                ...z,
                { typ: "nebenkostenausgleich", mietvertragId: aktuelleMietvertragId, betrag: "", jahr: "", beschreibung: "" },
              ])
            }
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
