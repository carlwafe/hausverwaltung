"use client";

import Link from "next/link";
import type { Kautionskonto } from "@/lib/kautionskonto";
import { KarteKopf, KarteMeta, KarteWerte } from "@/components/karte";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const STATUS: Record<Kautionskonto["status"], { text: string; klasse: string }> = {
  KEINE: { text: "keine Kaution", klasse: "border-neutral-700 text-neutral-400" },
  OFFEN: { text: "noch nicht eingezahlt", klasse: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  HINTERLEGT: { text: "hinterlegt", klasse: "border-green-500/40 bg-green-500/10 text-green-300" },
  AUFGELOEST: { text: "aufgelöst, Abrechnung offen", klasse: "border-amber-500/40 bg-amber-500/10 text-amber-300" },
  ABGERECHNET: { text: "abgerechnet", klasse: "border-neutral-600 bg-neutral-800 text-neutral-300" },
};

const ZEILEN_FARBE: Record<Kautionskonto["zeilen"][number]["art"], string> = {
  einzahlung: "",
  umbuchung: "text-neutral-500",
  auszahlung: "",
  sonstiges: "",
  einbehalt: "bg-red-500/5",
  einbehalt_offen: "bg-amber-500/10",
  einbehalt_verworfen: "text-neutral-500 line-through",
};

const farbe = (v: number) => (v < -0.005 ? "text-red-400" : v > 0.005 ? "text-green-400" : "text-neutral-400");

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

function Kasten({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-lg border border-neutral-800 p-4">
      <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h4>
      {children}
    </section>
  );
}

// Eine Zeile „Beschriftung … Betrag“; `betont` = Summenzeile mit Trennlinie.
function Zeile({
  label,
  value,
  betont = false,
  klasse = "",
  title,
}: {
  label: React.ReactNode;
  value: string;
  betont?: boolean;
  klasse?: string;
  title?: string;
}) {
  return (
    <div
      className={`flex items-baseline justify-between gap-3 py-1 text-sm ${betont ? "mt-1 border-t border-neutral-700 pt-1.5 font-semibold" : ""} ${klasse}`}
      title={title}
    >
      <dt className={`min-w-0 ${betont ? "text-white" : "text-neutral-300"}`}>{label}</dt>
      <dd className={`shrink-0 text-right tabular-nums ${betont ? "text-white" : "text-neutral-200"}`}>{value}</dd>
    </div>
  );
}

// -0 vermeiden („-0,00 €“), wenn ein Abzug 0 ist.
const minus = (v: number) => (Math.abs(v) < 0.005 ? 0 : -v);

/**
 * Kautionskonto (alle Bewegungen mit laufendem Stand des Kautionsguthabens) und — sobald das
 * Mietverhältnis endet — die Kautionsabrechnung (Guthaben ./. Einbehalte ./. Auszahlung).
 */
export function KautionAnsicht({
  konto,
  anlageform,
  mietende,
  kopf,
}: {
  konto: Kautionskonto;
  kopf: { mieter: string; einheit: string; mietbeginn: Date | null };
  anlageform: string | null;
  // Vertragsende (falls bekannt); die Kautionsabrechnung erscheint ab Mietende oder sobald
  // Auszahlungen/Einbehalte gebucht sind.
  mietende: Date | null;
}) {
  const a = konto.abrechnung;
  const status = STATUS[konto.status];
  const zeigeAbrechnung =
    mietende !== null || a.ausgezahltSumme > 0 || a.einbehaltePositionen.length > 0 || konto.status === "AUFGELOEST";

  // Stand der Abrechnung: erledigt, noch auszuzahlen, nachzufordern oder zu viel ausgezahlt.
  const rest =
    Math.abs(a.nochOffen) < 0.005
      ? {
          wert: "erledigt",
          text: a.ausgezahltSumme > 0.005 ? "Restbetrag vollständig ausgezahlt" : "Kaution vollständig verrechnet",
          klasse: "text-green-400",
        }
      : a.nochOffen > 0
        ? { wert: `${formatEuro(a.nochOffen)} offen`, text: "noch an den Mieter auszuzahlen", klasse: "text-amber-400" }
        : a.ausgezahltSumme > 0
          ? { wert: `${formatEuro(-a.nochOffen)} zu viel`, text: "mehr ausgezahlt als der Restbetrag", klasse: "text-red-400" }
          : {
              wert: `${formatEuro(-a.nochOffen)} nachfordern`,
              text: "Einbehalte übersteigen die Kaution — vom Mieter nachzufordern",
              klasse: "text-red-400",
            };
  const strittig = a.einbehaltePositionen.filter((e) => !e.unstrittig);

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kennzahl titel="Vereinbarte Kaution" wert={konto.sollBetrag !== null ? formatEuro(konto.sollBetrag) : "–"}>
          {anlageform}
        </Kennzahl>
        <Kennzahl titel="Eingezahlt" wert={a.eingezahlt > 0 ? formatEuro(a.eingezahlt) : "–"}>
          {a.erhaltenAm ? `am ${formatDate(a.erhaltenAm)}` : konto.status === "OFFEN" ? "noch nicht eingezahlt" : null}
        </Kennzahl>
        <Kennzahl
          titel="Guthaben aktuell"
          wert={formatEuro(konto.stand)}
          wertKlasse={konto.stand < -0.005 ? "text-red-400" : "text-white"}
        >
          {konto.stand > 0.005 && `liegt auf ${konto.aufKautionskonto ? "Kautionskonto" : "Geschäftskonto"}`}
        </Kennzahl>
        {zeigeAbrechnung ? (
          <Kennzahl titel="Kautionsabrechnung" wert={rest.wert} wertKlasse={rest.klasse}>
            {rest.text}
            {a.strittigOffenSumme > 0.005 && (
              <span className="block text-amber-300">{formatEuro(a.strittigOffenSumme)} strittig zurückbehalten</span>
            )}
          </Kennzahl>
        ) : (
          <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">Status</p>
            <span className={`mt-1.5 inline-block rounded border px-2 py-0.5 text-sm font-medium ${status.klasse}`}>{status.text}</span>
          </div>
        )}
      </div>
      {konto.sollBetrag !== null && a.eingezahlt > 0 && Math.abs(a.eingezahlt - konto.sollBetrag) > 0.01 && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Eingezahlt wurden {formatEuro(a.eingezahlt)}, vereinbart sind {formatEuro(konto.sollBetrag)}.
        </p>
      )}

      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-white">Kautionskonto</h3>
        <Link
          href="/kautionen"
          className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-900"
        >
          Kautionsbuchungen verwalten →
        </Link>
      </div>
      {/* Handy: je Bewegung eine Karte statt der Tabelle. */}
      <ul className="flex flex-col gap-2 md:hidden">
        {konto.zeilen.map((z) => (
          <li key={z.id} className={`rounded-lg border border-neutral-800 px-4 py-3 ${ZEILEN_FARBE[z.art]}`}>
            <KarteKopf titel={z.vorgang} wert={formatEuro(z.stand)} wertLabel="Guthaben" />
            <KarteMeta>
              <span>{z.datum ? formatDate(z.datum) : "ohne Datum"}</span>
            </KarteMeta>
            <KarteWerte
              werte={[
                z.buchungsbetrag !== null && { label: "Buchungsbetrag", wert: formatEuro(z.buchungsbetrag) },
                z.wirkung !== 0 && { label: "Veränderung", wert: formatEuro(z.wirkung), klasse: farbe(z.wirkung) },
              ]}
            />
            {z.bemerkung && <div className="mt-1 text-xs italic text-neutral-500">{z.bemerkung}</div>}
          </li>
        ))}
        {konto.zeilen.length === 0 && (
          <li className="rounded-lg border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
            Keine Kautionsbewegungen gebucht.
          </li>
        )}
      </ul>
      <div className="hidden w-full overflow-x-auto rounded-lg border border-neutral-800 md:block">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5">Datum</th>
              <th className="px-4 py-2.5">Vorgang</th>
              <th className="px-4 py-2.5 text-right">Buchungsbetrag</th>
              <th className="px-4 py-2.5 text-right">Veränderung Guthaben</th>
              <th className="px-4 py-2.5 text-right">Stand Kautionsguthaben</th>
              <th className="px-4 py-2.5">Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            {konto.zeilen.map((z) => (
              <tr key={z.id} className={`border-t border-neutral-800 ${ZEILEN_FARBE[z.art]}`}>
                <td className="whitespace-nowrap px-4 py-2 text-neutral-200">{z.datum ? formatDate(z.datum) : "–"}</td>
                <td className="whitespace-nowrap px-4 py-2 text-white">{z.vorgang}</td>
                <td className="px-4 py-2 text-right text-neutral-300">{z.buchungsbetrag !== null ? formatEuro(z.buchungsbetrag) : ""}</td>
                <td className={`px-4 py-2 text-right ${farbe(z.wirkung)}`}>{z.wirkung !== 0 ? formatEuro(z.wirkung) : "–"}</td>
                <td className="px-4 py-2 text-right font-medium text-white">{formatEuro(z.stand)}</td>
                <td className="max-w-[320px] truncate px-4 py-2 text-xs italic text-neutral-500" title={z.bemerkung}>
                  {z.bemerkung}
                </td>
              </tr>
            ))}
            {konto.zeilen.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Keine Kautionsbewegungen gebucht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs italic text-neutral-500">
        Anlage auf bzw. Auflösung des Kautionskontos sind reine Umbuchungen und verändern das Guthaben des Mieters nicht.
        Strittige Einbehalte sind vorläufig zurückbehalten und werden erst nach Klärung gebucht.
      </p>

      <h3 className="mb-1 mt-8 text-base font-medium text-white">Kautionsabrechnung zum Mietende</h3>
      {!zeigeAbrechnung ? (
        <p className="rounded-lg border border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
          Das Mietverhältnis läuft noch — die Kautionsabrechnung erscheint hier bei Mietende.
        </p>
      ) : (
        <div className="space-y-6">
          <p className="text-sm text-neutral-400">
            Mietzeit {kopf.mietbeginn ? formatDate(kopf.mietbeginn) : "unbekannt"} – {mietende ? formatDate(mietende) : "–"}
          </p>

          <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Kasten titel="Kaution">
              <dl>
                <Zeile label={`Kaution erhalten${a.erhaltenAm ? ` am ${formatDate(a.erhaltenAm)}` : ""}`} value={formatEuro(a.eingezahlt)} />
                <Zeile
                  label="+ Zinsen / Sonstiges"
                  value={formatEuro(a.sonstiges)}
                  title="Anlage gem. § 551 Abs. 3 BGB"
                />
                <Zeile label="Kaution gesamt (inkl. Zinsen)" value={formatEuro(a.guthaben)} betont />
              </dl>
            </Kasten>

            <Kasten titel="Abrechnung – sofortige Auszahlung">
              <dl>
                <Zeile label="Kaution gesamt (inkl. Zinsen)" value={formatEuro(a.guthaben)} />
                <Zeile label="abzgl. Einbehalte (unstrittig)" value={formatEuro(minus(a.einbehalteSumme))} />
                {a.strittigOffenSumme > 0.005 && (
                  <Zeile
                    label="abzgl. strittig, zurückbehalten"
                    value={formatEuro(minus(a.strittigOffenSumme))}
                    klasse="text-amber-300"
                    title="Bis zur Klärung zurückbehalten, noch nicht endgültig verrechnet"
                  />
                )}
                <Zeile
                  label={a.restbetrag < -0.005 ? "Fehlbetrag, vom Mieter nachzufordern" : "Restbetrag an Mieter"}
                  value={formatEuro(a.restbetrag)}
                  betont
                />
              </dl>
            </Kasten>

            <Kasten titel="Erledigung">
              <dl>
                {a.ausgezahlt.map((p, i) => (
                  <Zeile
                    key={i}
                    label={
                      <>
                        {p.text}
                        <span className="block text-xs text-neutral-500">
                          {[p.datum ? formatDate(p.datum) : null, p.hinweis, "gebucht"].filter(Boolean).join(" · ")}
                        </span>
                      </>
                    }
                    value={formatEuro(p.betrag)}
                  />
                ))}
                {a.ausgezahlt.length === 0 && (
                  <p className="py-1 text-sm text-neutral-500">
                    {Math.abs(a.restbetrag) < 0.005 ? "Keine Auszahlung nötig." : "Noch nichts ausgezahlt."}
                  </p>
                )}
                <Zeile label="Ausgezahlt gesamt" value={formatEuro(a.ausgezahltSumme)} betont />
              </dl>
              <p className={`mt-2 text-sm font-medium ${rest.klasse}`}>{rest.wert === "erledigt" ? `Erledigt — ${rest.text}` : `${rest.wert}: ${rest.text}`}</p>
              {strittig.map((e, i) => (
                <p key={i} className="mt-1 rounded-md bg-amber-500/10 px-2 py-1 text-xs text-amber-300">
                  Strittig offen: {e.text} ({formatEuro(e.betrag)}) — noch nicht endgültig verrechnet oder ausgezahlt.
                </p>
              ))}
            </Kasten>
          </div>

          <section>
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-400">
              Einbehalte / Verrechnung mit der Kaution
            </h4>
            <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm md:min-w-[900px]">
                <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5 md:min-w-[18rem]">Position</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">Bezug / Beleg</th>
                    <th className="px-4 py-2.5 text-right">Betrag</th>
                    <th className="hidden px-4 py-2.5 md:table-cell">unstrittig?</th>
                    <th className="hidden px-4 py-2.5 text-right md:table-cell">sofort verrechenbar (unstrittig)</th>
                    <th className="hidden px-4 py-2.5 text-right md:table-cell">zurückbehalten bis Klärung (strittig)</th>
                  </tr>
                </thead>
                <tbody>
                  {a.einbehaltePositionen.map((e, i) => (
                    <tr key={i} className={`border-t border-neutral-800 ${e.unstrittig ? "" : "bg-amber-500/10"}`}>
                      <td className="px-4 py-2 text-white">
                        {e.text}
                        {/* Handy: die Nebenspalten stehen unter der Position. */}
                        {e.bezug && <span className="mt-0.5 block text-xs text-neutral-400 md:hidden">{e.bezug}</span>}
                        <span className={`mt-0.5 block text-xs md:hidden ${e.unstrittig ? "text-neutral-500" : "text-amber-300"}`}>
                          {e.unstrittig ? "unstrittig — sofort verrechenbar" : "strittig — zurückbehalten bis Klärung"} ({e.statusText})
                        </span>
                      </td>
                      <td className="hidden px-4 py-2 text-xs text-neutral-400 md:table-cell">{e.bezug}</td>
                      <td className="whitespace-nowrap px-4 py-2 text-right align-top text-neutral-200">{formatEuro(e.betrag)}</td>
                      <td className={`hidden px-4 py-2 md:table-cell ${e.unstrittig ? "text-neutral-200" : "text-amber-300"}`}>
                        {e.unstrittig ? "ja" : "nein"} <span className="text-xs text-neutral-500">({e.statusText})</span>
                      </td>
                      <td className="hidden px-4 py-2 text-right text-neutral-200 md:table-cell">{e.unstrittig ? formatEuro(e.betrag) : ""}</td>
                      <td className="hidden px-4 py-2 text-right text-amber-300 md:table-cell">{e.unstrittig ? "" : formatEuro(e.betrag)}</td>
                    </tr>
                  ))}
                  {a.einbehaltePositionen.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-4 text-center text-neutral-500">
                        Keine Einbehalte erfasst.
                      </td>
                    </tr>
                  )}
                  <tr className="border-t-2 border-neutral-700 bg-neutral-900 font-medium">
                    <td className="px-4 py-2 text-white">Summe Einbehalte</td>
                    <td className="hidden md:table-cell" />
                    <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(a.einbehalteSumme + a.strittigOffenSumme)}</td>
                    <td className="hidden md:table-cell" />
                    <td className="hidden px-4 py-2 text-right text-white md:table-cell">{formatEuro(a.einbehalteSumme)}</td>
                    <td className="hidden px-4 py-2 text-right text-white md:table-cell">{formatEuro(a.strittigOffenSumme)}</td>
                  </tr>
                  <tr className="bg-neutral-900 text-xs md:hidden">
                    <td className="px-4 pb-1 text-neutral-400">davon sofort verrechenbar (unstrittig)</td>
                    <td className="whitespace-nowrap px-4 pb-1 text-right text-neutral-300">{formatEuro(a.einbehalteSumme)}</td>
                  </tr>
                  <tr className="bg-neutral-900 text-xs md:hidden">
                    <td className="px-4 pb-2 text-neutral-400">davon zurückbehalten bis Klärung (strittig)</td>
                    <td className="whitespace-nowrap px-4 pb-2 text-right text-amber-300">{formatEuro(a.strittigOffenSumme)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs italic text-neutral-500">
              Strittige Einbehalte nach Klärung auf der Kautionsseite bestätigen (endgültig verrechnet) oder verwerfen
              (nachträglich an den Mieter auszuzahlen).
            </p>
          </section>
        </div>
      )}
    </div>
  );
}
