"use client";

import { useActionState, useState } from "react";
import { teileKautionsbuchungAuf, type KautionAufteilungArt } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ART_LABEL: Record<KautionAufteilungArt, string> = {
  BK_AUSGLEICH: "Betriebskostenausgleich",
  MAHNGEBUEHR_KOSTEN: "Mahngebühr (Kostenposition)",
  MAHNGEBUEHR_FORDERUNG: "Mahngebühr auf Forderung",
};

/**
 * Teilt eine Kautionsbuchung in Kautionsanteil + zweiten Teil, der sich als Rest ergibt: Betriebskostenausgleich
 * (z.B. eine Überweisung "Guthaben BK-Abr 2023 + Kaution") oder eine mit der Kaution überwiesene Mahngebühr.
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
  const [art, setArt] = useState<KautionAufteilungArt>(betragGesamt > 0 ? "MAHNGEBUEHR_KOSTEN" : "BK_AUSGLEICH");
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
        className="mt-4 rounded-md border border-neutral-700 px-3 h-10 text-sm font-medium text-white hover:bg-neutral-900"
      >
        Aufteilen…
      </button>
    );
  }

  return (
    <form action={formAction} className="mt-4 rounded-lg border border-neutral-800 p-4 text-sm">
      <p className="mb-1 font-medium text-white">Kautionsbuchung ({formatEuro(betragGesamt)}) aufteilen</p>
      {art === "BK_AUSGLEICH" ? (
        <>
          <p className="mb-3 text-xs text-neutral-500">
            Nur für Sammelüberweisungen: Kaution und ein zugleich ausgezahltes BK-Guthaben (Bankvorzeichen, ausgehend
            negativ). Beispiel: −694,90 € = Kautionsanteil −273,10 € + Betriebskostenausgleich −421,80 €.
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Eine mit der Kaution verrechnete Nachzahlung wird <strong>nicht</strong> aufgeteilt: Die Auszahlung bleibt
            der Bankbetrag, die Verrechnung wird als Einbehalt &quot;Verrechnung mit Betriebskostenabrechnung&quot;
            erfasst (z.B. Kaution 100 €, Nachzahlung 67,34 € → Auszahlung −32,66 € + Einbehalt 67,34 €).
          </p>
        </>
      ) : art === "MAHNGEBUEHR_KOSTEN" ? (
        <p className="mb-3 text-xs text-neutral-500">
          Mit der Kaution überwiesene Mahngebühr, z.B. 2.105 € = Kaution 2.100 € + 5 €. Die Gebühr wird als negative
          Kostenposition „Mahngebühren“ gebucht (Einnahme, ohne Forderung).
        </p>
      ) : (
        <p className="mb-3 text-xs text-neutral-500">
          Mit der Kaution überwiesene Mahngebühr, die als Forderung auf dem Mieterkonto offen ist: Sie wird als
          Gebühren-Zahlung gebucht und gleicht die Forderung aus.
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-xs text-neutral-400">
          Zweiter Teil
          <select
            name="art"
            value={art}
            onChange={(e) => setArt(e.target.value as KautionAufteilungArt)}
            className="mt-1 block w-56 rounded-md border border-neutral-700 bg-neutral-950 px-2 h-10 text-sm text-white outline-none focus:border-neutral-400"
          >
            {(Object.keys(ART_LABEL) as KautionAufteilungArt[]).map((a) => (
              <option key={a} value={a}>
                {ART_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-neutral-400">
          Kautionsanteil
          <input
            name="kautionBetrag"
            inputMode="decimal"
            value={kautionText}
            onChange={(e) => setKautionText(e.target.value)}
            placeholder={betragGesamt < 0 ? "z.B. -400,00" : "z.B. 400,00"}
            required
            className="mt-1 block w-32 rounded-md border border-neutral-700 bg-transparent px-2 h-10 text-sm text-white outline-none focus:border-neutral-400"
          />
        </label>
        {art === "BK_AUSGLEICH" && (
          <label className="text-xs text-neutral-400">
            Abrechnungsjahr
            <input
              name="nkJahr"
              type="number"
              value={nkJahr}
              onChange={(e) => setNkJahr(e.target.value)}
              required
              className="mt-1 block w-24 rounded-md border border-neutral-700 bg-transparent px-2 h-10 text-sm text-white outline-none focus:border-neutral-400"
            />
          </label>
        )}
        <span className="pb-2 text-neutral-300">
          = {art === "BK_AUSGLEICH" ? "Betriebskostenausgleich" : "Mahngebühr"} {rest !== null ? formatEuro(rest) : "–"}
        </span>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-white px-3 h-10 font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
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
