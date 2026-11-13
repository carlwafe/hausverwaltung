"use client";

import Link from "next/link";
import type { MieterkontoJahr } from "@/lib/mieterkonto";
import { KarteKopf, KarteMeta, KarteWerte } from "@/components/karte";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}
const farbeSaldo = (v: number) => (v < -0.005 ? "text-red-400" : v > 0.005 ? "text-green-400" : "text-white");

/**
 * Mieterkonto eines Mietvertrags für ein Jahr. Alle Jahre kommen fertig berechnet vom Server, die
 * Jahresauswahl sitzt in der Reiterleiste (MietvertragReiter) — der Wechsel passiert nur im Browser.
 */
export function MieterkontoAnsicht({
  mietvertragId,
  jahr,
  konto,
  stichtagAb,
}: {
  mietvertragId: string;
  jahr: number;
  konto: MieterkontoJahr;
  // Jahr des (vertragseigenen oder globalen) Buchhaltungs-Stichtags: davor ist der Übertrag reine Darstellung (beginnt bei 0).
  stichtagAb: { jahr: number; datum: string } | null;
}) {
  const vorStichtag = stichtagAb !== null && jahr < stichtagAb.jahr;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        {/* Mieter/Einheit/aktuelle Sollwerte stehen bereits in den Vertrags-Eckdaten oben auf der
            Seite und pro Monat in jeder Tabellenzeile — hier bleibt nur, was sonst nirgends steht:
            der Startwert der kumulierten Saldo-Spalte. */}
        <span className="text-sm text-neutral-400">
          Saldo-Übertrag {jahr - 1}:{" "}
          <span className={farbeSaldo(konto.uebertragVorjahr)}>{formatEuro(konto.uebertragVorjahr)}</span>
        </span>
        <Link
          href={`/zahlungen/neu?mietvertragId=${mietvertragId}`}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          + Zahlung / Gebühr erfassen
        </Link>
      </div>

      {vorStichtag && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Vor dem Buchhaltungs-Stichtag dieses Vertrags ({stichtagAb.datum}): reine Darstellung der Soll- und Zahlungsbewegungen. Der
          Übertrag beginnt hier bei 0 und ist nicht der Saldovortrag des Mietvertrags.
        </p>
      )}

      {/* Handy: je Zeile eine Karte statt der zehnspaltigen Tabelle (siehe docs/tickets-logo-design.md). */}
      <ul className="flex flex-col gap-2 md:hidden">
        {konto.zeilen.map((z, i) => (
          <li
            key={i}
            className={`rounded-lg border border-neutral-800 px-4 py-3 ${z.sonderbuchung ? "bg-amber-500/10" : ""}`}
          >
            <KarteKopf
              titel={
                <span className={z.sonderbuchung ? "text-amber-300" : ""}>
                  {z.monat || (z.sonderbuchung ? "Sonderbuchung" : z.buchungsart || "–")}
                </span>
              }
              wert={formatEuro(z.saldo)}
              wertKlasse={farbeSaldo(z.saldo)}
              wertLabel="Saldo"
            />
            {(z.buchungsart || z.datum) && (
              <KarteMeta>
                <span>
                  {z.href ? (
                    <Link href={z.href} className="underline">
                      {z.buchungsart}
                    </Link>
                  ) : (
                    z.buchungsart
                  )}
                  {z.datum && `${z.buchungsart ? " · " : ""}${formatDate(z.datum)}`}
                </span>
              </KarteMeta>
            )}
            <KarteWerte
              werte={[
                z.sollGesamt !== null && { label: "Soll", wert: formatEuro(z.sollGesamt) },
                z.betrag !== null && { label: "Gezahlt", wert: formatEuro(z.betrag) },
                {
                  label: "Differenz",
                  wert: formatEuro(z.differenz),
                  klasse: z.differenz < -0.005 ? "text-red-400" : z.differenz > 0.005 ? "text-green-400" : "text-neutral-400",
                },
              ]}
            />
            {z.sollKaltmiete !== null && z.sollNebenkosten !== null && (
              <div className="mt-1.5 text-xs text-neutral-500">
                Soll: Kaltmiete {formatEuro(z.sollKaltmiete)} + NK-Vorauszahlung {formatEuro(z.sollNebenkosten)}
              </div>
            )}
            {z.bemerkung && <div className="mt-1 text-xs italic text-neutral-500">{z.bemerkung}</div>}
          </li>
        ))}
        {konto.zeilen.length === 0 && (
          <li className="rounded-lg border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
            Für {konto.jahr} gibt es keine Buchungen.
          </li>
        )}
        <li className="rounded-lg border border-neutral-700 bg-neutral-900 px-4 py-3">
          <KarteKopf
            titel={`Summe ${konto.jahr}`}
            wert={formatEuro(konto.summe.saldo)}
            wertKlasse={farbeSaldo(konto.summe.saldo)}
            wertLabel="Saldo"
          />
          <KarteWerte
            werte={[
              { label: "Soll", wert: formatEuro(konto.summe.sollGesamt) },
              { label: "Gezahlt", wert: formatEuro(konto.summe.betrag) },
              { label: "Differenz", wert: formatEuro(konto.summe.differenz) },
            ]}
          />
          <div className="mt-1.5 text-xs text-neutral-500">
            Soll: Kaltmiete {formatEuro(konto.summe.sollKaltmiete)} + NK-Vorauszahlung {formatEuro(konto.summe.sollNebenkosten)}
          </div>
        </li>
      </ul>

      <div className="hidden w-full overflow-x-auto rounded-lg border border-neutral-800 md:block">
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
                <td className="whitespace-nowrap px-4 py-2 text-xs italic text-neutral-500">
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
      {konto.nebenkostenabrechnungOffen !== null && (
        <table className="mt-3 w-full text-sm md:ml-auto md:w-auto">
          <tbody>
            {/* Die Gegenrechnung der unbezahlten NK-Vorauszahlung steht als Zeile in der Tabelle (Teil des
                Saldos); hier bleibt die Abrechnung selbst (Kosten ./. gezahlte Vorauszahlung, abzüglich
                Auszahlung/Verrechnung). */}
            <tr>
              <td className="py-0.5 pr-4 text-neutral-300 md:pr-8">
                Nebenkostenabrechnung {konto.jahr - 1} offen{" "}
                <span className="text-xs text-neutral-500">
                  ({konto.nebenkostenabrechnungOffen >= 0 ? "Guthaben des Mieters" : "Nachzahlung des Mieters"})
                </span>
              </td>
              <td className={`whitespace-nowrap py-0.5 text-right ${farbeSaldo(konto.nebenkostenabrechnungOffen)}`}>
                {formatEuro(konto.nebenkostenabrechnungOffen)}
              </td>
            </tr>
            <tr className="border-t border-neutral-700 font-medium">
              <td className="py-1 pr-4 text-white md:pr-8">Saldo inkl. offener Nebenkostenabrechnung</td>
              <td className={`whitespace-nowrap py-1 text-right ${farbeSaldo(konto.saldoInklNebenkostenabrechnung)}`}>
                {formatEuro(konto.saldoInklNebenkostenabrechnung)}
              </td>
            </tr>
          </tbody>
        </table>
      )}
      <div className="mt-2 space-y-0.5 text-xs italic text-neutral-500">
        <p>Positiver Saldo = Guthaben des Mieters, negativer Saldo = Mietrückstand. Der Endsaldo ist der Übertrag ins Folgejahr.</p>
        <p>
          „Gutschrift/Belastung NK-Vorauszahlung“ steht am Versanddatum der Abrechnung (unter „Als versendet markieren“
          gepflegt); die Abrechnung selbst fließt nur in „Saldo inkl. offener Nebenkostenabrechnung“ ein.
        </p>
        <p>
          Bei Teilzahlungen ab 2025 zeigt die Bemerkung die Aufteilung auf Nebenkosten und Kaltmiete; der Saldo rechnet mit
          dem Gesamtbetrag. Orange Zeilen = Sonderbuchungen (Monat des Buchungsdatums), Mietzahlungen stehen in ihrer
          Mietperiode.
        </p>
      </div>
    </div>
  );
}
