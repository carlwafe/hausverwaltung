"use client";

import { useState, useTransition } from "react";
import { speichereArbeitskosten } from "@/app/(app)/kosten/actions";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const zahlText = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(n);

/**
 * Arbeitskostenanteil einer umlagefähigen Kostenposition (Detailseite): Lohn inkl. Umsatzsteuer, ohne Material und Fahrt.
 * Daraus entsteht im Schreiben „Betriebskostenabrechnung“ der Ausweis nach § 35a EStG (Anlage). Hält den Zustand selbst
 * (die Aktion lädt die Seite nicht neu).
 */
export function ArbeitskostenBox({
  buchungId,
  rechnungsbetrag,
  startwert,
  bearbeitbar,
}: {
  buchungId: string;
  rechnungsbetrag: number;
  startwert: number | null;
  bearbeitbar: boolean;
}) {
  const [gespeichert, setGespeichert] = useState<number | null>(startwert);
  const [eingabe, setEingabe] = useState(startwert === null ? "" : zahlText(startwert));
  const [fehler, setFehler] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!bearbeitbar && gespeichert === null) return null;

  const zahl = Number((eingabe.includes(",") ? eingabe.replace(/\./g, "").replace(",", ".") : eingabe) || NaN);
  const prozent = Number.isFinite(zahl) && rechnungsbetrag !== 0 ? (zahl / rechnungsbetrag) * 100 : null;

  function speichern(wert: string) {
    setFehler(null);
    startTransition(async () => {
      try {
        const meldung = await speichereArbeitskosten(buchungId, wert);
        if (meldung) {
          setFehler(meldung);
          return;
        }
        const t = wert.trim();
        setGespeichert(t ? Number((t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t)) : null);
        if (!t) setEingabe("");
      } catch {
        setFehler("Speichern fehlgeschlagen. Bitte erneut versuchen.");
      }
    });
  }

  return (
    <div className="mt-6 max-w-xl rounded-lg border border-neutral-800 p-4">
      <p className="mb-1 text-sm font-medium text-white">Arbeitskosten (§ 35a EStG)</p>
      <p className="text-xs text-neutral-500">
        Lohnanteil der Rechnung einschließlich Umsatzsteuer, ohne Material und Fahrtkosten. Der Mieter bekommt daraus in der
        Betriebskostenabrechnung einen Ausweis seines Anteils (Anlage). Leer lassen, wenn die Rechnung nicht begünstigt ist —
        eine Kostenart erscheint in der Anlage erst, wenn <em>alle</em> ihre Positionen des Jahres eine Angabe haben.
      </p>
      {bearbeitbar ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={eingabe}
            onChange={(e) => setEingabe(e.target.value)}
            inputMode="decimal"
            placeholder="z.B. 2.423,67"
            aria-label="Arbeitskosten in Euro"
            className="w-36 rounded-md border border-neutral-700 bg-transparent px-3 py-1.5 text-sm outline-none focus:border-neutral-400"
          />
          <span className="text-xs text-neutral-500">
            von {euro(rechnungsbetrag)}
            {prozent !== null && ` = ${prozent.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`}
          </span>
          <button
            type="button"
            disabled={isPending}
            onClick={() => speichern(eingabe)}
            className="rounded-md border border-neutral-700 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
          >
            Speichern
          </button>
          {gespeichert !== null && (
            <button
              type="button"
              disabled={isPending}
              onClick={() => speichern("")}
              className="rounded-md border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
            >
              Entfernen
            </button>
          )}
        </div>
      ) : (
        <p className="mt-2 text-sm text-neutral-200">
          {euro(gespeichert!)} von {euro(rechnungsbetrag)}
        </p>
      )}
      {gespeichert !== null && bearbeitbar && <p className="mt-1 text-xs text-green-400">Gespeichert: {euro(gespeichert)}</p>}
      {fehler && <p className="mt-1 text-xs text-red-400">{fehler}</p>}
    </div>
  );
}
