"use client";

import { useActionState, useState } from "react";
import { teileKautionsbuchungAuf } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

/**
 * Teilt eine Kautionsbuchung in Kautionsanteil + Nebenkostenausgleich (z.B. eine Überweisung
 * "Guthaben BK-Abr 2023 + Kaution") — der Nebenkostenanteil ergibt sich als Rest.
 */
export function KautionAufteilenForm({
  id,
  betragGesamt,
  standardJahr,
}: {
  id: string;
  betragGesamt: number;
  standardJahr: number;
}) {
  const [offen, setOffen] = useState(false);
  const [kautionText, setKautionText] = useState("");
  const [nkJahr, setNkJahr] = useState(String(standardJahr));
  const [fehler, formAction, pending] = useActionState(teileKautionsbuchungAuf.bind(null, id), null);
  const kaution = Number(kautionText.replace(",", "."));
  const rest =
    kautionText.trim() && Number.isFinite(kaution) ? Math.round((betragGesamt - kaution) * 100) / 100 : null;

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
    <form action={formAction} className="mt-4 rounded-lg border border-neutral-800 p-4 text-sm">
      <p className="mb-1 font-medium text-white">Kautionsbuchung ({formatEuro(betragGesamt)}) aufteilen</p>
      <p className="mb-3 text-xs text-neutral-500">
        Ersetzt diese Buchung durch Kautionsanteil + Nebenkostenausgleich (Bankvorzeichen: ausgehend negativ; eine
        verrechnete Nachzahlung ergibt einen positiven Nebenkostenanteil).
      </p>
      <p className="mb-3 text-xs text-neutral-500">
        Beispiel: Kaution −100 €, verrechnete Nachzahlung +67,34 €, überwiesen −32,66 € → Kautionsanteil −100,00,
        Nebenkostenausgleich +67,34 €. Der Kautionsteil zählt dann nur mit dem überwiesenen Anteil als ausgezahlt, der
        Rest als mit der Nebenkostenabrechnung verrechnet.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-400">
          Kautionsanteil
          <input
            name="kautionBetrag"
            inputMode="decimal"
            value={kautionText}
            onChange={(e) => setKautionText(e.target.value)}
            placeholder={betragGesamt < 0 ? "z.B. -400,00" : "z.B. 400,00"}
            required
            className="mt-1 block w-32 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
        </label>
        <label className="text-xs text-neutral-400">
          Abrechnungsjahr
          <input
            name="nkJahr"
            type="number"
            value={nkJahr}
            onChange={(e) => setNkJahr(e.target.value)}
            required
            className="mt-1 block w-24 rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          />
        </label>
        <span className="pb-2 text-neutral-300">= Nebenkostenausgleich {rest !== null ? formatEuro(rest) : "–"}</span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-3 py-1.5 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Teile auf…" : "Aufteilen"}
        </button>
        <button type="button" onClick={() => setOffen(false)} className="pb-1.5 text-neutral-400 hover:text-white">
          Abbrechen
        </button>
      </div>
      {fehler && <p className="mt-2 text-red-400">{fehler}</p>}
    </form>
  );
}
