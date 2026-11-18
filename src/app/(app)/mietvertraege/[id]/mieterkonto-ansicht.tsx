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

function Kennzahl({
  titel,
  wert,
  wertKlasse = "text-white",
  children,
}: {
  titel: string;
  wert: string;
  wertKlasse?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${wertKlasse}`}>{wert}</p>
      {children ? <div className="mt-0.5 text-xs text-neutral-500">{children}</div> : null}
    </div>
  );
}

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
  // Teil des Solls, der nicht aus Kaltmiete/BK kommt (Sonderbuchungen wie Gebühren oder Verrechnungen).
  const sollSonder =
    Math.round((konto.summe.sollGesamt - konto.summe.sollKaltmiete - konto.summe.sollNebenkosten) * 100) / 100;
  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-base font-medium text-white">Mieterkonto {jahr}</h3>
        <Link
          href={`/zahlungen/neu?mietvertragId=${mietvertragId}`}
          className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900"
        >
          + Zahlung / Gebühr erfassen
        </Link>
      </div>

      {/* Jahreswerte auf einen Blick (dieselben Zahlen wie die Summenzeile der Tabelle). */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kennzahl titel={`Übertrag aus ${jahr - 1}`} wert={formatEuro(konto.uebertragVorjahr)} wertKlasse={farbeSaldo(konto.uebertragVorjahr)}>
          {vorStichtag ? "vor dem Stichtag: beginnt bei 0" : "Saldo am Ende des Vorjahres"}
        </Kennzahl>
        <Kennzahl titel={`Soll ${jahr}`} wert={formatEuro(konto.summe.sollGesamt)}>
          Kalt {formatEuro(konto.summe.sollKaltmiete)} + BK {formatEuro(konto.summe.sollNebenkosten)}
          {Math.abs(sollSonder) > 0.005 && ` ${sollSonder < 0 ? "−" : "+"} Sonderbuchungen ${formatEuro(Math.abs(sollSonder))}`}
        </Kennzahl>
        <Kennzahl titel={`Gezahlt ${jahr}`} wert={formatEuro(konto.summe.betrag)}>
          Differenz <span className={farbeSaldo(konto.summe.differenz)}>{formatEuro(konto.summe.differenz)}</span>
        </Kennzahl>
        <Kennzahl titel={`Saldo ${jahr}`} wert={formatEuro(konto.summe.saldo)} wertKlasse={farbeSaldo(konto.summe.saldo)}>
          {konto.nebenkostenabrechnungOffen === null ? (
            "Übertrag + Differenz"
          ) : (
            // Die Gegenrechnung der unbezahlten BK-Vorauszahlung steht als Zeile in der Tabelle (Teil des Saldos);
            // die Abrechnung selbst (Kosten ./. gezahlte Vorauszahlung, abzüglich Auszahlung/Verrechnung) kommt hier dazu.
            <>
              <span className="block">
                BK-Abrechnung {jahr - 1} offen:{" "}
                <span className={farbeSaldo(konto.nebenkostenabrechnungOffen)}>{formatEuro(konto.nebenkostenabrechnungOffen)}</span>
                {Math.abs(konto.nebenkostenabrechnungOffen) > 0.005 &&
                  ` (${konto.nebenkostenabrechnungOffen > 0 ? "Guthaben" : "Nachzahlung"})`}
              </span>
              <span className="block font-medium text-neutral-300">
                inkl. BK-Abrechnung:{" "}
                <span className={farbeSaldo(konto.saldoInklNebenkostenabrechnung)}>
                  {formatEuro(konto.saldoInklNebenkostenabrechnung)}
                </span>
              </span>
            </>
          )}
        </Kennzahl>
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
                Soll: Kaltmiete {formatEuro(z.sollKaltmiete)} + BK-Vorauszahlung {formatEuro(z.sollNebenkosten)}
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
            Soll: Kaltmiete {formatEuro(konto.summe.sollKaltmiete)} + BK-Vorauszahlung {formatEuro(konto.summe.sollNebenkosten)}
          </div>
        </li>
      </ul>

      {/* Desktop: nie breiter als die Seite — kurze Überschriften (voller Text im Tooltip), enge Abstände und die
          Bemerkung als Füllspalte (höchstens zwei Zeilen, voller Text im Tooltip); siehe docs/tickets-logo-design.md. */}
      <div className="hidden w-full overflow-x-auto rounded-lg border border-neutral-800 md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2.5">Monat</th>
              <th className="px-3 py-2.5 text-right" title="Soll Kaltmiete">Soll Kalt</th>
              <th className="px-3 py-2.5 text-right" title="Soll BK-Vorauszahlung">Soll BK</th>
              <th className="px-3 py-2.5 text-right">Soll gesamt</th>
              <th className="px-3 py-2.5">Buchungsart</th>
              <th className="px-3 py-2.5">Datum</th>
              <th className="px-3 py-2.5 text-right" title="Betrag (Ist)">Betrag</th>
              <th className="px-3 py-2.5 text-right" title="Differenz (Ist − Soll)">Differenz</th>
              <th className="px-3 py-2.5 text-right" title="Saldo (kumuliert)">Saldo</th>
              <th className="w-full px-3 py-2.5" title="Bemerkung / Bezug">
                Bemerkung
                <div className="h-0 w-36" aria-hidden="true" />
              </th>
            </tr>
          </thead>
          <tbody>
            {konto.zeilen.map((z, i) => (
              <tr key={i} className={`border-t border-neutral-800 ${z.sonderbuchung ? "bg-amber-500/10" : ""}`}>
                <td className={`whitespace-nowrap px-3 py-2 ${z.sonderbuchung ? "font-medium text-amber-300" : "text-white"}`}>
                  {z.monat || (z.sonderbuchung ? "Sonderbuchung" : "")}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-200">
                  {z.sollKaltmiete !== null ? formatEuro(z.sollKaltmiete) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-200">
                  {z.sollNebenkosten !== null ? formatEuro(z.sollNebenkosten) : ""}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-200">
                  {z.sollGesamt !== null ? formatEuro(z.sollGesamt) : ""}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 ${z.sonderbuchung ? "font-medium text-amber-300" : "text-neutral-200"}`}>
                  {z.href ? (
                    <Link href={z.href} className="hover:underline">
                      {z.buchungsart}
                    </Link>
                  ) : (
                    z.buchungsart
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-neutral-200">{z.datum ? formatDate(z.datum) : ""}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-200">
                  {z.betrag !== null ? formatEuro(z.betrag) : ""}
                </td>
                <td
                  className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                    z.differenz < -0.005 ? "text-red-400" : z.differenz > 0.005 ? "text-green-400" : "text-neutral-400"
                  }`}
                >
                  {formatEuro(z.differenz)}
                </td>
                <td className={`whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums ${farbeSaldo(z.saldo)}`}>
                  {formatEuro(z.saldo)}
                </td>
                <td className="w-full max-w-0 px-3 py-2 text-xs italic text-neutral-500">
                  {z.bemerkung && (
                    <div title={z.bemerkung} className="line-clamp-2">
                      {z.bemerkung}
                    </div>
                  )}
                </td>
              </tr>
            ))}
            {konto.zeilen.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
                  Für {konto.jahr} gibt es keine Buchungen.
                </td>
              </tr>
            )}
            <tr className="border-t-2 border-neutral-700 bg-neutral-900 font-medium">
              <td className="whitespace-nowrap px-3 py-2.5 text-white">Summe Jahr</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.sollKaltmiete)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.sollNebenkosten)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.sollGesamt)}</td>
              <td className="px-3 py-2.5" />
              <td className="px-3 py-2.5" />
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.betrag)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.differenz)}</td>
              <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-white">{formatEuro(konto.summe.saldo)}</td>
              <td className="px-3 py-2.5" />
            </tr>
          </tbody>
        </table>
      </div>
      <div className="mt-2 text-xs text-neutral-500">
        <p>Positiver Saldo = Guthaben des Mieters, negativer Saldo = Mietrückstand. Orange Zeilen = Sonderbuchungen.</p>
        <details className="mt-1">
          <summary className="cursor-pointer hover:text-white">Weitere Erläuterungen</summary>
          <div className="mt-1 space-y-1">
            <p>Der Endsaldo ist der Übertrag ins Folgejahr.</p>
            <p>
              „Gutschrift/Belastung BK-Vorauszahlung“ steht am Versanddatum der Abrechnung (unter „Als versendet markieren“
              gepflegt); die Abrechnung selbst fließt nur in „inkl. BK-Abrechnung“ ein.
            </p>
            <p>
              Bei Teilzahlungen ab 2025 zeigt die Bemerkung die Aufteilung auf Betriebskosten und Kaltmiete; der Saldo rechnet
              mit dem Gesamtbetrag. Sonderbuchungen stehen im Monat des Buchungsdatums, Mietzahlungen in ihrer Mietperiode.
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
