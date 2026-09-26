"use client";

import Link from "next/link";
import type { Kautionskonto } from "@/lib/kautionskonto";

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

function Block({ titel, children }: { titel: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-300">{titel}</h4>
      {children}
    </section>
  );
}

/**
 * Kautionskonto (alle Bewegungen mit laufendem Stand des Kautionsguthabens) und — sobald das
 * Mietverhältnis endet — die Kautionsabrechnung (Guthaben ./. Einbehalte ./. Auszahlung).
 */
export function KautionAnsicht({
  konto,
  anlageform,
  zinssatz,
  mietende,
  kopf,
}: {
  konto: Kautionskonto;
  kopf: { mieter: string; einheit: string; mietbeginn: Date | null };
  anlageform: string | null;
  zinssatz: number | null;
  // Vertragsende (falls bekannt); die Kautionsabrechnung erscheint ab Mietende oder sobald
  // Auszahlungen/Einbehalte gebucht sind.
  mietende: Date | null;
}) {
  const a = konto.abrechnung;
  const status = STATUS[konto.status];
  const zeigeAbrechnung =
    mietende !== null || a.ausgezahltSumme > 0 || a.einbehaltePositionen.length > 0 || konto.status === "AUFGELOEST";

  return (
    <div>
      <div className="mb-4 grid grid-cols-2 gap-x-8 gap-y-3 rounded-lg border border-neutral-800 p-4 text-sm md:grid-cols-5">
        <div>
          <p className="text-xs text-neutral-400">Vereinbarte Kaution</p>
          <p className="text-white">{konto.sollBetrag !== null ? formatEuro(konto.sollBetrag) : "–"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Anlageform</p>
          <p className="text-white">
            {anlageform ?? "–"}
            {zinssatz !== null && <span className="text-neutral-400"> ({zinssatz} %)</span>}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Kautionsguthaben aktuell</p>
          <p className={`font-semibold ${konto.stand < -0.005 ? "text-red-400" : "text-white"}`}>{formatEuro(konto.stand)}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Liegt auf</p>
          <p className="text-white">
            {konto.stand <= 0.005 ? "–" : konto.aufKautionskonto ? "Kautionskonto" : "Geschäftskonto"}
          </p>
        </div>
        <div>
          <p className="text-xs text-neutral-400">Status</p>
          <span className={`mt-0.5 inline-block rounded border px-2 py-0.5 text-xs font-medium ${status.klasse}`}>{status.text}</span>
        </div>
      </div>
      {konto.sollBetrag !== null && a.eingezahlt > 0 && Math.abs(a.eingezahlt - konto.sollBetrag) > 0.01 && (
        <p className="mb-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
          Eingezahlt wurden {formatEuro(a.eingezahlt)}, vereinbart sind {formatEuro(konto.sollBetrag)}.
        </p>
      )}

      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-medium text-white">Kautionskonto</h3>
        <Link href="/kautionen" className="text-xs text-neutral-400 hover:text-white hover:underline">
          Kautionsbuchungen verwalten →
        </Link>
      </div>
      <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
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

      <h3 className="mb-2 mt-8 text-base font-medium text-white">Kautionsabrechnung zum Mietende</h3>
      {!zeigeAbrechnung ? (
        <p className="rounded-lg border border-neutral-800 px-4 py-6 text-center text-sm text-neutral-500">
          Das Mietverhältnis läuft noch — die Kautionsabrechnung erscheint hier bei Mietende.
        </p>
      ) : (
        <div className="space-y-6">
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-400">Mieter:</td>
                <td className="py-0.5 text-white">{kopf.mieter}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-400">Einheit:</td>
                <td className="py-0.5 text-white">{kopf.einheit}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-400">Mietbeginn:</td>
                <td className="py-0.5 text-white">{kopf.mietbeginn ? formatDate(kopf.mietbeginn) : "unbekannt"}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-400">Mietende:</td>
                <td className="py-0.5 text-white">{mietende ? formatDate(mietende) : "–"}</td>
              </tr>
            </tbody>
          </table>

          <Block titel="Kaution">
            <table className="w-full max-w-2xl text-sm">
              <tbody>
                <tr>
                  <td className="py-1 pr-6 text-neutral-300">
                    Kaution erhalten{a.erhaltenAm ? ` am ${formatDate(a.erhaltenAm)}` : ""}
                  </td>
                  <td className="py-1 text-right text-neutral-200">{formatEuro(a.eingezahlt)}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-6 text-neutral-300">+ Zinsen / Sonstiges (Anlage gem. § 551 Abs. 3 BGB)</td>
                  <td className="py-1 text-right text-neutral-200">{formatEuro(a.sonstiges)}</td>
                </tr>
                <tr className="border-t border-neutral-700 font-medium">
                  <td className="py-1.5 pr-6 text-white">Kaution gesamt (inkl. Zinsen)</td>
                  <td className="py-1.5 text-right text-white">{formatEuro(a.guthaben)}</td>
                </tr>
              </tbody>
            </table>
          </Block>

          <Block titel="Einbehalte / Verrechnung mit der Kaution">
            <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full min-w-[900px] text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5">Position</th>
                    <th className="px-4 py-2.5">Bezug / Beleg</th>
                    <th className="px-4 py-2.5 text-right">Betrag</th>
                    <th className="px-4 py-2.5">unstrittig?</th>
                    <th className="px-4 py-2.5 text-right">sofort verrechenbar (unstrittig)</th>
                    <th className="px-4 py-2.5 text-right">zurückbehalten bis Klärung (strittig)</th>
                  </tr>
                </thead>
                <tbody>
                  {a.einbehaltePositionen.map((e, i) => (
                    <tr key={i} className={`border-t border-neutral-800 ${e.unstrittig ? "" : "bg-amber-500/10"}`}>
                      <td className="px-4 py-2 text-white">{e.text}</td>
                      <td className="px-4 py-2 text-xs text-neutral-400">{e.bezug}</td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(e.betrag)}</td>
                      <td className={`px-4 py-2 ${e.unstrittig ? "text-neutral-200" : "text-amber-300"}`}>
                        {e.unstrittig ? "ja" : "nein"} <span className="text-xs text-neutral-500">({e.statusText})</span>
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-200">{e.unstrittig ? formatEuro(e.betrag) : ""}</td>
                      <td className="px-4 py-2 text-right text-amber-300">{e.unstrittig ? "" : formatEuro(e.betrag)}</td>
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
                    <td colSpan={2} className="px-4 py-2 text-white">
                      Summe Einbehalte
                    </td>
                    <td className="px-4 py-2 text-right text-white">{formatEuro(a.einbehalteSumme + a.strittigOffenSumme)}</td>
                    <td />
                    <td className="px-4 py-2 text-right text-white">{formatEuro(a.einbehalteSumme)}</td>
                    <td className="px-4 py-2 text-right text-white">{formatEuro(a.strittigOffenSumme)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Block>

          <Block titel="Abrechnung – sofortige Auszahlung">
            <table className="w-full max-w-2xl text-sm">
              <tbody>
                <tr>
                  <td className="py-1 pr-6 text-neutral-300">Kaution gesamt (inkl. Zinsen)</td>
                  <td className="py-1 text-right text-neutral-200">{formatEuro(a.guthaben)}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-6 text-neutral-300">abzgl. sofort verrechenbare Einbehalte (unstrittig)</td>
                  <td className="py-1 text-right text-neutral-200">{formatEuro(-a.einbehalteSumme)}</td>
                </tr>
                <tr>
                  <td className="py-1 pr-6 text-neutral-300">
                    abzgl. zurückbehalten bis Klärung (strittig, noch nicht endgültig verrechnet)
                  </td>
                  <td className="py-1 text-right text-neutral-200">{formatEuro(-a.strittigOffenSumme)}</td>
                </tr>
                <tr className="border-t-2 border-neutral-600 font-semibold">
                  <td className="py-2 pr-6 text-white">Restbetrag, jetzt auszuzahlen an Mieter</td>
                  <td className="py-2 text-right text-white">{formatEuro(a.restbetrag)}</td>
                </tr>
              </tbody>
            </table>
          </Block>

          <Block titel="Erledigung">
            <div className="w-full max-w-3xl overflow-x-auto rounded-lg border border-neutral-800">
              <table className="w-full text-sm">
                <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                  <tr>
                    <th className="px-4 py-2.5">Vorgang</th>
                    <th className="px-4 py-2.5 text-right">Betrag</th>
                    <th className="px-4 py-2.5">Datum</th>
                    <th className="px-4 py-2.5">Ergebnis / Status</th>
                  </tr>
                </thead>
                <tbody>
                  {a.ausgezahlt.map((p, i) => (
                    <tr key={i} className="border-t border-neutral-800">
                      <td className="px-4 py-2 text-white">
                        {p.text}
                        {p.hinweis && <span className="ml-2 text-xs text-neutral-500">{p.hinweis}</span>}
                      </td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(p.betrag)}</td>
                      <td className="px-4 py-2 text-neutral-200">{p.datum ? formatDate(p.datum) : "–"}</td>
                      <td className="px-4 py-2 text-green-400">gebucht</td>
                    </tr>
                  ))}
                  <tr className="border-t border-neutral-700 font-medium">
                    <td className="px-4 py-2 text-white">Restbetrag an Mieter</td>
                    <td className="px-4 py-2 text-right text-white">{formatEuro(a.restbetrag)}</td>
                    <td className="px-4 py-2 text-neutral-400">
                      {a.ausgezahlt.length > 0 ? `ausgezahlt ${formatEuro(a.ausgezahltSumme)}` : "–"}
                    </td>
                    <td
                      className={`px-4 py-2 ${
                        Math.abs(a.nochOffen) < 0.005 ? "text-green-400" : a.nochOffen > 0 ? "text-amber-400" : "text-red-400"
                      }`}
                    >
                      {Math.abs(a.nochOffen) < 0.005
                        ? "erledigt"
                        : a.nochOffen > 0
                          ? `offen: noch ${formatEuro(a.nochOffen)} auszuzahlen`
                          : `${formatEuro(-a.nochOffen)} mehr ausgezahlt als Restbetrag`}
                    </td>
                  </tr>
                  {a.einbehaltePositionen
                    .filter((e) => !e.unstrittig)
                    .map((e, i) => (
                      <tr key={`s${i}`} className="border-t border-neutral-800 bg-amber-500/10">
                        <td className="px-4 py-2 text-white">Strittiger Teil ({e.text})</td>
                        <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(e.betrag)}</td>
                        <td className="px-4 py-2 text-neutral-400">offen</td>
                        <td className="px-4 py-2 text-amber-300">noch nicht endgültig verrechnet oder ausgezahlt</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs italic text-neutral-500">
              Sobald ein strittiger Teil geklärt ist, auf der Kautionsseite den Status des Einbehalts setzen: bestätigt
              (endgültig mit der Kaution verrechnet) oder verworfen (nachträglich an den Mieter auszuzahlen).
            </p>
          </Block>
        </div>
      )}
    </div>
  );
}
