"use client";

import { useState, useTransition } from "react";
import { speichereArbeitskosten } from "@/app/(app)/kosten/actions";

const euro = (n: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);
const zahlText = (n: number) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false }).format(n);

/** „1.234,56“ oder „1234.56“ → Zahl; leer/ungültig → null. */
function leseZahl(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}

type RechnerZeile = { netto: string; prozent: string };

/**
 * Rechenhilfe: je Rechnungsposition Nettobetrag und Lohnanteil in % (steht meist unter der Position, z.B. „enthält 90 % Lohnkosten“).
 * Lohn netto je Position in Cent gerundet, Summe plus Umsatzsteuer auf Cent gerundet (Ganzzahlrechnung, kein Gleitkomma-Rest).
 */
function Rechner({ rechnungsbetrag, onUebernehmen }: { rechnungsbetrag: number; onUebernehmen: (wert: string) => void }) {
  const [zeilen, setZeilen] = useState<RechnerZeile[]>([{ netto: "", prozent: "" }]);
  const [ustText, setUstText] = useState("19");

  const ust = leseZahl(ustText) ?? 0;
  const lohnCent = zeilen.map((z) => {
    const netto = leseZahl(z.netto);
    const prozent = leseZahl(z.prozent);
    return netto === null || prozent === null ? 0 : Math.round((Math.round(netto * 100) * prozent) / 100);
  });
  const nettoCent = lohnCent.reduce((a, b) => a + b, 0);
  const bruttoCent = Math.round((nettoCent * Math.round((100 + ust) * 100)) / 10000);
  const bruttoEuro = bruttoCent / 100;
  const zuHoch = bruttoEuro > rechnungsbetrag + 0.005;

  function aendere(i: number, feld: keyof RechnerZeile, wert: string) {
    setZeilen((alt) => alt.map((z, j) => (j === i ? { ...z, [feld]: wert } : z)));
  }

  const eingabeKlasse =
    "rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400";

  return (
    <div className="mt-3 rounded-md border border-neutral-800 p-3">
      <p className="text-xs text-neutral-500">
        Je Rechnungsposition den Nettobetrag und den Lohnanteil eintragen (Material und Fahrtkosten gehören nicht dazu, bei reinem
        Material 0 %). Die Umsatzsteuer wird auf die Summe der Lohnkosten aufgeschlagen.
      </p>
      <div className="mt-2 space-y-1.5">
        {zeilen.map((z, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              value={z.netto}
              onChange={(e) => aendere(i, "netto", e.target.value)}
              inputMode="decimal"
              placeholder="Netto €"
              aria-label={`Position ${i + 1}: Nettobetrag in Euro`}
              className={`w-28 ${eingabeKlasse}`}
            />
            <input
              value={z.prozent}
              onChange={(e) => aendere(i, "prozent", e.target.value)}
              inputMode="decimal"
              placeholder="Lohn %"
              aria-label={`Position ${i + 1}: Lohnanteil in Prozent`}
              className={`w-20 ${eingabeKlasse}`}
            />
            <span className="w-28 text-xs text-neutral-400">Lohn netto {euro(lohnCent[i] / 100)}</span>
            {zeilen.length > 1 && (
              <button
                type="button"
                onClick={() => setZeilen((alt) => alt.filter((_, j) => j !== i))}
                className="text-xs text-neutral-500 hover:text-white"
                aria-label={`Position ${i + 1} entfernen`}
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setZeilen((alt) => [...alt, { netto: "", prozent: "" }])}
        className="mt-2 text-xs text-neutral-400 hover:text-white"
      >
        + Position hinzufügen
      </button>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-neutral-300">
        <span>Lohn netto {euro(nettoCent / 100)}</span>
        <label className="flex items-center gap-1">
          USt
          <input
            value={ustText}
            onChange={(e) => setUstText(e.target.value)}
            inputMode="decimal"
            aria-label="Umsatzsteuersatz in Prozent"
            className={`w-14 ${eingabeKlasse}`}
          />
          %
        </label>
        <span className="font-medium text-white">Lohn brutto {euro(bruttoEuro)}</span>
        <button
          type="button"
          disabled={bruttoCent <= 0}
          onClick={() => onUebernehmen(zahlText(bruttoEuro))}
          className="rounded-md border border-neutral-700 px-3 py-1 text-xs font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          In Feld übernehmen
        </button>
      </div>
      {zuHoch && (
        <p className="mt-1 text-xs text-amber-400">
          Mehr als der Betrag der Kostenposition ({euro(rechnungsbetrag)}) — stimmen Nettobeträge und Umsatzsteuersatz?
        </p>
      )}
    </div>
  );
}

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
  const [rechnerOffen, setRechnerOffen] = useState(false);
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
      {bearbeitbar && (
        <>
          <button
            type="button"
            onClick={() => setRechnerOffen((o) => !o)}
            className="mt-2 text-xs text-neutral-400 hover:text-white"
          >
            {rechnerOffen ? "▾ Rechner ausblenden" : "▸ Aus der Rechnung berechnen"}
          </button>
          {rechnerOffen && (
            <Rechner
              rechnungsbetrag={rechnungsbetrag}
              onUebernehmen={(wert) => {
                setEingabe(wert);
                setFehler(null);
              }}
            />
          )}
        </>
      )}
      {gespeichert !== null && bearbeitbar && <p className="mt-1 text-xs text-green-400">Gespeichert: {euro(gespeichert)}</p>}
      {fehler && <p className="mt-1 text-xs text-red-400">{fehler}</p>}
    </div>
  );
}
