"use client";

import Link from "next/link";
import { useState } from "react";
import type { MieterkontoJahr } from "@/lib/mieterkonto";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}
const farbeSaldo = (v: number) => (v < -0.005 ? "text-red-400" : v > 0.005 ? "text-green-400" : "text-white");

/**
 * Mieterkonto eines Mietvertrags mit Jahresauswahl per Dropdown. Alle Jahre kommen fertig
 * berechnet vom Server, der Wechsel passiert nur im Browser — kein Neuladen, kein Springen nach
 * oben.
 */
export function MieterkontoAnsicht({
  mietvertragId,
  mieterNamen,
  einheit,
  jahre,
  konten,
  standardJahr,
  stichtagAb,
}: {
  mietvertragId: string;
  mieterNamen: string;
  einheit: string;
  // Absteigend sortiert (neuestes Jahr zuerst).
  jahre: number[];
  konten: Record<number, MieterkontoJahr>;
  standardJahr: number;
  // Jahr des Buchhaltungs-Stichtags: davor ist der Übertrag reine Darstellung (beginnt bei 0).
  stichtagAb: { jahr: number; datum: string } | null;
}) {
  const [jahr, setJahr] = useState(jahre.includes(standardJahr) ? standardJahr : jahre[0]);
  const konto = konten[jahr];
  const vorStichtag = stichtagAb !== null && jahr < stichtagAb.jahr;

  const kopf: [string, React.ReactNode][] = [
    ["Mieter", mieterNamen],
    ["Einheit", einheit],
    ["Soll Kaltmiete (mtl.)", formatEuro(konto.sollKaltmieteMonatlich)],
    ["Soll NK-Vorauszahlung (mtl.)", formatEuro(konto.sollNebenkostenMonatlich)],
    ["Soll gesamt (mtl.)", formatEuro(konto.sollKaltmieteMonatlich + konto.sollNebenkostenMonatlich)],
    [
      "Saldo-Übertrag Vorjahr",
      <span key="u" className={farbeSaldo(konto.uebertragVorjahr)}>
        {formatEuro(konto.uebertragVorjahr)}
      </span>,
    ],
  ];

  return (
    <div className="mb-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-medium text-white">Mieterkonto</h2>
          <select
            value={jahr}
            onChange={(e) => setJahr(Number(e.target.value))}
            aria-label="Jahr wählen"
            className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-sm font-medium text-white outline-none focus:border-neutral-400"
          >
            {jahre.map((j) => (
              <option key={j} value={j}>
                {j}
              </option>
            ))}
          </select>
        </div>
        <Link
          href={`/zahlungen/neu?mietvertragId=${mietvertragId}`}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900"
        >
          + Zahlung erfassen
        </Link>
      </div>

      <table className="mb-5 text-sm">
        <tbody>
          {kopf.map(([label, wert]) => (
            <tr key={label}>
              <td className="whitespace-nowrap py-1 pr-10 font-medium text-white">{label}:</td>
              <td className="py-1 text-neutral-200">{wert}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {vorStichtag && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Vor dem Buchhaltungs-Stichtag ({stichtagAb.datum}): reine Darstellung der Soll- und Zahlungsbewegungen. Der
          Übertrag beginnt hier bei 0 und ist nicht der Saldovortrag des Mietvertrags.
        </p>
      )}

      <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1100px] text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5">Monat / Buchung</th>
              <th className="px-4 py-2.5 text-right">Soll Kaltmiete</th>
              <th className="px-4 py-2.5 text-right">Soll NK-Vorauszahlung</th>
              <th className="px-4 py-2.5 text-right">Soll gesamt</th>
              <th className="px-4 py-2.5">Buchungsart</th>
              <th className="px-4 py-2.5">Datum</th>
              <th className="px-4 py-2.5 text-right">Betrag (Ist)</th>
              <th className="px-4 py-2.5 text-right">Differenz (Ist − Soll)</th>
              <th className="px-4 py-2.5 text-right">Saldo (kumuliert)</th>
              <th className="px-4 py-2.5">Bemerkung / Bezug</th>
            </tr>
          </thead>
          <tbody>
            {konto.zeilen.map((z, i) => (
              <tr key={i} className={`border-t border-neutral-800 ${z.sonderbuchung ? "bg-amber-500/10" : ""}`}>
                <td className={`whitespace-nowrap px-4 py-2 ${z.sonderbuchung ? "font-medium text-amber-300" : "text-white"}`}>
                  {z.monat || (z.sonderbuchung ? "Sonderbuchung" : "")}
                </td>
                <td className="px-4 py-2 text-right text-neutral-200">
                  {z.sollKaltmiete !== null ? formatEuro(z.sollKaltmiete) : ""}
                </td>
                <td className="px-4 py-2 text-right text-neutral-200">
                  {z.sollNebenkosten !== null ? formatEuro(z.sollNebenkosten) : ""}
                </td>
                <td className="px-4 py-2 text-right text-neutral-200">
                  {z.sollGesamt !== null ? formatEuro(z.sollGesamt) : ""}
                </td>
                <td className={`whitespace-nowrap px-4 py-2 ${z.sonderbuchung ? "font-medium text-amber-300" : "text-neutral-200"}`}>
                  {z.href ? (
                    <Link href={z.href} className="hover:underline">
                      {z.buchungsart}
                    </Link>
                  ) : (
                    z.buchungsart
                  )}
                </td>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-200">{z.datum ? formatDate(z.datum) : ""}</td>
                <td className="px-4 py-2 text-right text-neutral-200">{z.betrag !== null ? formatEuro(z.betrag) : ""}</td>
                <td
                  className={`px-4 py-2 text-right ${
                    z.differenz < -0.005 ? "text-red-400" : z.differenz > 0.005 ? "text-green-400" : "text-neutral-400"
                  }`}
                >
                  {formatEuro(z.differenz)}
                </td>
                <td className={`px-4 py-2 text-right font-medium ${farbeSaldo(z.saldo)}`}>{formatEuro(z.saldo)}</td>
                <td className="max-w-[300px] truncate px-4 py-2 text-xs italic text-neutral-500" title={z.bemerkung}>
                  {z.bemerkung}
                </td>
              </tr>
            ))}
            {konto.zeilen.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-neutral-500">
                  Für {konto.jahr} gibt es keine Buchungen.
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-neutral-700 bg-neutral-900 font-medium">
              <td className="px-4 py-2.5 text-white">Summe Jahr</td>
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.sollKaltmiete)}</td>
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.sollNebenkosten)}</td>
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.sollGesamt)}</td>
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5" />
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.betrag)}</td>
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.differenz)}</td>
              <td className="px-4 py-2.5 text-right text-white">{formatEuro(konto.summe.saldo)}</td>
              <td className="px-4 py-2.5" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 space-y-0.5 text-xs italic text-neutral-500">
        <p>Hinweis: Der Endsaldo (Spalte &bdquo;Saldo kumuliert&ldquo;) ist der Saldo-Übertrag für das Folgejahr.</p>
        <p>Positiver Saldo = Guthaben des Mieters. Negativer Saldo = Mietrückstand.</p>
        <p>
          Orange Zeilen = Sonderbuchungen (z.B. Rücklastschriftgebühr und die Zahlung darauf). Zahlungen stehen im Monat
          ihres Buchungsdatums.
        </p>
      </div>
    </div>
  );
}
