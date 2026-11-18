"use client";

import Link from "next/link";
import { saldoMitToleranz } from "@/lib/nk-saldo";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}
const formatZahl = (n: number, stellen = 2) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: stellen }).format(n);

const VERTEILUNG_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
  PERSONENZAHL: "Personenzahl",
  EINHEITEN: "Einheiten",
  VERBRAUCH_MANUELL: "Verbrauch",
  VORVERTEILT: "Verbrauch (Wärmemessdienst)",
  IN_ABRECHNUNG_ENTHALTEN: "in Abrechnung enthalten",
};

export type NkErledigungZeile = { datum: Date | null; art: string; betrag: number; weg: string };

export type NkJahrDaten = {
  jahr: number;
  abrechnungId: string;
  abrechnungStatus: "ENTWURF" | "FINAL";
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  vorauszahlungGesamt: number;
  // Wie gespeichert: positiv = Guthaben des Mieters, negativ = Nachzahlung.
  saldo: number;
  details: KostenanteilDetailEintrag[];
  // Kostenart-IDs der warmen Betriebskosten (Heizung/Warmwasser, BetrKV Nr. 4–6).
  warmeKostenartIds: string[];
  // Ausgleich (Auszahlung/Zahlung), Verrechnung aufs Mieterkonto oder mit der Kaution. betrag im
  // Vorzeichen des gespeicherten Saldos (siehe nkBegleichung).
  erledigungen: NkErledigungZeile[];
  // Monatliche BK-Vorauszahlung nach der Abrechnung (erste Anpassung nach Jahresende, sonst der
  // weiterhin geltende Betrag).
  neueVorauszahlung: { ab: Date | null; betrag: number } | null;
};

function tageImZeitraum(von: Date, bis: Date) {
  return (
    Math.round(
      (Date.UTC(bis.getFullYear(), bis.getMonth(), bis.getDate()) - Date.UTC(von.getFullYear(), von.getMonth(), von.getDate())) /
        86400000,
    ) + 1
  );
}

function umlagefaktor(d: KostenanteilDetailEintrag): string {
  if (d.verteilerschluessel === "VORVERTEILT") return "n. Ablesung";
  if (d.poolMasswert === 0) return "–";
  return `${formatZahl((d.einheitMasswert / d.poolMasswert) * 100, 4)} %`;
}

function bemerkung(d: KostenanteilDetailEintrag, unterjaehrig: boolean): string {
  const teile: string[] = [];
  if (d.verteilerschluessel === "VORVERTEILT") teile.push("Wert vom Wärmemessdienst");
  else if (d.verteilerschluessel === "EINHEITEN") teile.push(`1 von ${formatZahl(d.poolMasswert)} Einheiten`);
  else teile.push(`${formatZahl(d.einheitMasswert)} von ${formatZahl(d.poolMasswert)} ${d.masseinheit}`.trim());
  if (d.scopeLabel) teile.push(d.scopeLabel);
  if (unterjaehrig && Math.abs(d.anteilJahr - d.anteilZeitraum) > 0.005) teile.push(`ganzes Jahr ${formatEuro(d.anteilJahr)}`);
  return teile.join(" · ");
}

function Abschnittstitel({ children }: { children: React.ReactNode }) {
  return (
    <tr className="bg-neutral-900">
      <td colSpan={6} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-neutral-300">
        {children}
      </td>
    </tr>
  );
}

function KostenBlock({
  titel,
  details,
  unterjaehrig,
  summeText,
}: {
  titel: string;
  details: KostenanteilDetailEintrag[];
  unterjaehrig: boolean;
  summeText: string;
}) {
  const summeGesamt = details.reduce((s, d) => s + (d.verteilerschluessel === "VORVERTEILT" ? 0 : d.gesamtbetragPool), 0);
  const summeAnteil = details.reduce((s, d) => s + d.anteilZeitraum, 0);
  return (
    <>
      <Abschnittstitel>{titel}</Abschnittstitel>
      {details.map((d, i) => (
        <tr key={i} className="border-t border-neutral-800">
          <td className="px-4 py-2 text-white">
            {d.kostenartName}
            {/* Handy: die Nebenspalten stehen unter der Kostenart (siehe docs/tickets-logo-design.md). */}
            <span className="mt-0.5 block text-xs text-neutral-500 md:hidden">
              {[
                d.verteilerschluessel === "VORVERTEILT" ? null : `gesamt ${formatEuro(d.gesamtbetragPool)}`,
                VERTEILUNG_LABEL[d.verteilerschluessel] ?? d.verteilerschluessel,
                bemerkung(d, unterjaehrig),
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </td>
          <td className="hidden px-4 py-2 text-right text-neutral-200 md:table-cell">
            {d.verteilerschluessel === "VORVERTEILT" ? "" : formatEuro(d.gesamtbetragPool)}
          </td>
          <td className="hidden whitespace-nowrap px-4 py-2 text-neutral-400 md:table-cell">{VERTEILUNG_LABEL[d.verteilerschluessel] ?? d.verteilerschluessel}</td>
          <td className="hidden px-4 py-2 text-right text-neutral-300 md:table-cell">{umlagefaktor(d)}</td>
          <td className="whitespace-nowrap px-4 py-2 text-right font-medium text-white">{formatEuro(d.anteilZeitraum)}</td>
          <td className="hidden max-w-[340px] truncate px-4 py-2 text-xs text-neutral-500 md:table-cell" title={bemerkung(d, unterjaehrig)}>
            {bemerkung(d, unterjaehrig)}
          </td>
        </tr>
      ))}
      <tr className="border-t border-neutral-700 font-medium">
        <td className="px-4 py-2 text-white">{summeText}</td>
        <td className="hidden px-4 py-2 text-right text-white md:table-cell">{formatEuro(summeGesamt)}</td>
        <td colSpan={2} className="hidden md:table-cell" />
        <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(summeAnteil)}</td>
        <td className="hidden md:table-cell" />
      </tr>
    </>
  );
}

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
      {children ? <p className="mt-0.5 text-xs text-neutral-500">{children}</p> : null}
    </div>
  );
}

/**
 * Betriebskostenabrechnung eines Mietvertrags für ein Jahr im Aufbau des Musters: kalte und warme
 * Betriebskosten mit Gesamtkosten, Verteilerschlüssel, Umlagefaktor und Anteil, darunter Abrechnung
 * & Saldo (Nachzahlung + / Guthaben −), Erledigung des Saldos und die neue Vorauszahlung.
 */
export function NebenkostenAnsicht({
  daten,
  jahr,
  kopf,
  mietvertragId,
}: {
  daten: NkJahrDaten | null;
  jahr: number | null;
  kopf: { mieter: string; einheit: string; wohnflaeche: number };
  // Nur bei der neuesten Abrechnung gesetzt: Link zur Seite für Vorschlag + Schreiben zur Anpassung der Vorauszahlung.
  mietvertragId: string | null;
}) {
  if (!daten) {
    return (
      <div className="rounded-lg border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
        {jahr === null
          ? "Für diesen Mietvertrag gibt es noch keine Betriebskostenabrechnung."
          : `Für ${jahr} gibt es keine Betriebskostenabrechnung für diesen Mietvertrag.`}
      </div>
    );
  }

  const sortiert = [...daten.details].sort(
    (a, b) => a.kostenartName.localeCompare(b.kostenartName, "de") || a.scopeLabel.localeCompare(b.scopeLabel, "de"),
  );
  const warmIds = new Set(daten.warmeKostenartIds);
  const kalt = sortiert.filter((d) => !warmIds.has(d.kostenartId));
  const warm = sortiert.filter((d) => warmIds.has(d.kostenartId));
  const summeDetails = sortiert.reduce((s, d) => s + d.anteilZeitraum, 0);

  const jahrTage = tageImZeitraum(new Date(daten.jahr, 0, 1), new Date(daten.jahr, 11, 31));
  const nutzungTage = tageImZeitraum(daten.zeitraumVon, daten.zeitraumBis);
  const unterjaehrig = nutzungTage < jahrTage;

  // Muster-Vorzeichen: Saldo = Kosten − Vorauszahlungen (Nachzahlung +, Guthaben −).
  const saldoMuster = Math.round((daten.kostenanteilGesamt - daten.vorauszahlungGesamt) * 100) / 100;
  const nachzahlung = saldoMuster > 0.005;
  const erledigt = daten.erledigungen.reduce((s, e) => s + e.betrag, 0);
  // Im Vorzeichen des gespeicherten Saldos: positiv = noch auszuzahlen, negativ = noch zu fordern.
  const offen = saldoMitToleranz(daten.saldo - erledigt);

  const summeKalt = kalt.reduce((s, d) => s + d.anteilZeitraum, 0);
  const summeWarm = warm.reduce((s, d) => s + d.anteilZeitraum, 0);
  const ausgeglichen = Math.abs(saldoMuster) < 0.005;
  // Manuell angelegte Position ohne jede Zahl (Platzhalter für ein Altjahr): kein Ergebnis und kein „offen“ ableiten.
  const ohneWerte =
    sortiert.length === 0 &&
    Math.abs(daten.kostenanteilGesamt) < 0.005 &&
    Math.abs(daten.vorauszahlungGesamt) < 0.005 &&
    Math.abs(daten.saldo) < 0.005;
  const ergebnisFarbe = ausgeglichen ? "text-white" : nachzahlung ? "text-red-400" : "text-green-400";
  const letzteErledigung = daten.erledigungen.reduce<Date | null>((m, e) => (e.datum && (!m || e.datum > m) ? e.datum : m), null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <div>
          <h3 className="text-base font-medium text-white">Betriebskostenabrechnung {daten.jahr}</h3>
          <p className="mt-0.5 text-sm text-neutral-400">
            Wohnfläche {formatZahl(kopf.wohnflaeche)} m² · Nutzung {formatDate(daten.zeitraumVon)} –{" "}
            {formatDate(daten.zeitraumBis)}
            {unterjaehrig && ` (${nutzungTage} von ${jahrTage} Tagen)`}
          </p>
        </div>
        <Link
          href={`/nebenkostenabrechnungen/${daten.abrechnungId}`}
          className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-900"
        >
          Gesamtabrechnung {daten.jahr} ({daten.abrechnungStatus === "FINAL" ? "final" : "Entwurf"}) →
        </Link>
      </div>

      {/* Ergebnis auf einen Blick; die Aufschlüsselung folgt in der Tabelle. */}
      <div className="mb-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kennzahl titel="Kosten (Anteil Mieter)" wert={formatEuro(daten.kostenanteilGesamt)}>
          {warm.length > 0 && `kalt ${formatEuro(summeKalt)} · warm ${formatEuro(summeWarm)}`}
        </Kennzahl>
        <Kennzahl titel="Geleistete Vorauszahlungen" wert={formatEuro(daten.vorauszahlungGesamt)}>
          tatsächlich gezahlt
        </Kennzahl>
        {ohneWerte ? (
          <>
            <Kennzahl titel="Ergebnis" wert="keine Werte">
              manuell erfasst, ohne Beträge
            </Kennzahl>
            <Kennzahl titel="Erledigung" wert={erledigt === 0 ? "–" : `${formatEuro(Math.abs(erledigt))} gebucht`}>
              {erledigt === 0 ? "" : "zum Abrechnungsjahr gebucht"}
            </Kennzahl>
          </>
        ) : (
          <>
            <Kennzahl
              titel="Ergebnis"
              wert={ausgeglichen ? "ausgeglichen" : formatEuro(Math.abs(saldoMuster))}
              wertKlasse={ergebnisFarbe}
            >
              {ausgeglichen ? "" : nachzahlung ? "Nachzahlung durch Mieter" : "Guthaben an Mieter"}
            </Kennzahl>
            <Kennzahl
              titel="Erledigung"
              wert={offen === 0 ? "erledigt" : `${formatEuro(Math.abs(offen))} offen`}
              wertKlasse={offen === 0 ? "text-green-400" : "text-amber-400"}
            >
              {offen === 0
                ? letzteErledigung
                  ? `zuletzt am ${formatDate(letzteErledigung)}`
                  : ""
                : offen > 0
                  ? "noch auszuzahlen oder mit der Miete zu verrechnen"
                  : "noch vom Mieter zu zahlen"}
            </Kennzahl>
          </>
        )}
      </div>

      <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm md:min-w-[1000px]">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5 md:min-w-[18rem]">Kostenart</th>
              <th className="hidden px-4 py-2.5 text-right md:table-cell">Gesamtkosten Objekt</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Verteilerschlüssel</th>
              <th className="hidden px-4 py-2.5 text-right md:table-cell">Umlagefaktor</th>
              <th className="px-4 py-2.5 text-right">Anteil Mieter (€)</th>
              <th className="hidden px-4 py-2.5 md:table-cell">Bemerkung</th>
            </tr>
          </thead>
          <tbody>
            {sortiert.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-neutral-500">
                  Keine Aufschlüsselung nach Kostenarten gespeichert (manuell erfasste Position).
                </td>
              </tr>
            ) : (
              <>
                <KostenBlock titel="Kalte Betriebskosten" details={kalt} unterjaehrig={unterjaehrig} summeText="Summe kalte Betriebskosten" />
                {warm.length > 0 && (
                  <KostenBlock
                    titel="Warme Betriebskosten (Heizung / Warmwasser)"
                    details={warm}
                    unterjaehrig={unterjaehrig}
                    summeText="Summe warme Betriebskosten"
                  />
                )}
              </>
            )}
            <Abschnittstitel>Abrechnung &amp; Saldo</Abschnittstitel>
            <tr className="border-t border-neutral-800">
              <td className="px-4 py-2 text-neutral-300">Gesamtkosten (Anteil Mieter)</td>
              <td colSpan={3} className="hidden md:table-cell" />
              <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(daten.kostenanteilGesamt)}</td>
              <td className="hidden md:table-cell" />
            </tr>
            <tr className="border-t border-neutral-800">
              <td className="px-4 py-2 text-neutral-300">
                abzgl. geleistete BK-Vorauszahlungen
                <span className="mt-0.5 block text-xs text-neutral-500 md:hidden">
                  tatsächlich gezahlt; Teilzahlungen bis 2024 zuerst auf die BK, ab 2025 anteilig BK : Kaltmiete
                </span>
              </td>
              <td colSpan={3} className="hidden md:table-cell" />
              <td className="whitespace-nowrap px-4 py-2 text-right text-neutral-200">{formatEuro(daten.vorauszahlungGesamt)}</td>
              <td className="hidden px-4 py-2 text-xs text-neutral-500 md:table-cell">
                tatsächlich gezahlt; Teilzahlungen bis 2024 zuerst auf die BK, ab 2025 anteilig BK : Kaltmiete (§ 366 Abs. 2 BGB)
              </td>
            </tr>
            <tr className="border-t border-neutral-700 font-medium">
              <td className="px-4 py-2 text-white">Saldo (Nachzahlung + / Guthaben −)</td>
              <td colSpan={3} className="hidden md:table-cell" />
              <td className={`whitespace-nowrap px-4 py-2 text-right ${nachzahlung ? "text-red-400" : "text-green-400"}`}>{formatEuro(saldoMuster)}</td>
              <td className="hidden md:table-cell" />
            </tr>
            <tr className="border-t border-neutral-700 bg-neutral-900 font-semibold">
              <td className="px-4 py-2.5 text-white">Ergebnis</td>
              <td colSpan={3} className="hidden md:table-cell" />
              <td colSpan={2} className={`px-4 py-2.5 ${nachzahlung ? "text-red-400" : "text-green-400"}`}>
                {Math.abs(saldoMuster) < 0.005 ? "ausgeglichen" : nachzahlung ? "Nachzahlung durch Mieter" : "Guthaben an Mieter"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {sortiert.length > 0 && Math.abs(summeDetails - daten.kostenanteilGesamt) > 0.02 && (
        <p className="mt-2 text-xs text-amber-400">
          Summe der Kostenarten ({formatEuro(summeDetails)}) weicht vom gespeicherten Kostenanteil ab — Abrechnung ggf. neu
          berechnen.
        </p>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        Angezeigt werden die gespeicherten Werte der Gesamtabrechnung — nach Änderungen an Zahlungen, Kosten oder
        Rechenregeln erst aktuell, wenn die Abrechnung {daten.jahr} dort neu berechnet wurde.
      </p>

      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-3">
        <div className="min-w-0 xl:col-span-2">
          <h3 className="mb-2 text-sm font-medium text-white">Erledigung des Saldos</h3>
        <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm md:min-w-[640px]">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2.5 text-right">Betrag</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Datum</th>
                <th className="px-4 py-2.5">Art der Erledigung</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Verrechnet mit / Auszahlungsweg</th>
                <th className="hidden px-4 py-2.5 md:table-cell">Status</th>
              </tr>
            </thead>
            <tbody>
              {daten.erledigungen.map((e, i) => (
                <tr key={i} className="border-t border-neutral-800">
                  <td className="whitespace-nowrap px-4 py-2 text-right align-top text-white">{formatEuro(Math.abs(e.betrag))}</td>
                  <td className="hidden px-4 py-2 text-neutral-200 md:table-cell">{e.datum ? formatDate(e.datum) : "–"}</td>
                  <td className="px-4 py-2 text-neutral-200">
                    {e.art}
                    <span className="mt-0.5 block text-xs text-neutral-500 md:hidden">
                      {[e.datum ? formatDate(e.datum) : null, e.weg, "gebucht"].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="hidden px-4 py-2 text-neutral-400 md:table-cell">{e.weg}</td>
                  <td className="hidden px-4 py-2 text-green-400 md:table-cell">gebucht</td>
                </tr>
              ))}
              <tr className="border-t border-neutral-700 font-medium">
                <td className={`whitespace-nowrap px-4 py-2 text-right align-top ${offen === 0 ? "text-green-400" : "text-amber-400"}`}>
                  {formatEuro(Math.abs(offen))}
                </td>
                <td colSpan={3} className="px-4 py-2 text-neutral-300">
                  {offen === 0
                    ? "Saldo vollständig erledigt"
                    : offen > 0
                      ? "noch an den Mieter auszuzahlen oder mit der Miete zu verrechnen"
                      : "noch vom Mieter zu zahlen"}
                </td>
                <td className={`hidden px-4 py-2 md:table-cell ${offen === 0 ? "text-green-400" : "text-amber-400"}`}>
                  {offen === 0 ? "erledigt" : "offen"}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        </div>

        {daten.neueVorauszahlung && (
          <div className="min-w-0">
            <h3 className="mb-2 text-sm font-medium text-white">
              {daten.neueVorauszahlung.ab
                ? `Neue Vorauszahlung ab ${formatDate(daten.neueVorauszahlung.ab)}`
                : `Vorauszahlung ab ${daten.jahr + 1} (unverändert)`}
            </h3>
            <div className="rounded-lg border border-neutral-800 p-4">
              <dl className="text-sm">
                <div className="flex justify-between gap-3 py-0.5">
                  <dt className="text-neutral-400">BK-Vorauszahlung (mtl.)</dt>
                  <dd className="tabular-nums text-white">{formatEuro(daten.neueVorauszahlung.betrag)}</dd>
                </div>
                <div className="flex justify-between gap-3 py-0.5">
                  <dt className="text-neutral-500">rechnerisch (Kosten ÷ 12)</dt>
                  <dd className="tabular-nums text-neutral-400">
                    {formatEuro(Math.ceil((daten.kostenanteilGesamt / (nutzungTage / jahrTage) / 12) * 100) / 100)}
                  </dd>
                </div>
              </dl>
              {mietvertragId && (
                <Link
                  prefetch={false}
                  href={`/mietvertraege/${mietvertragId}/nk-anpassung`}
                  className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-md border border-neutral-600 px-3 text-sm font-medium text-white hover:bg-neutral-800"
                >
                  Vorauszahlung anpassen &amp; Schreiben →
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs italic text-neutral-500">
        Ein Guthaben wird entweder ausgezahlt oder mit der Miete verrechnet (§ 387 BGB, dem Mieter schriftlich mitzuteilen
        und als eigene Buchung im Mieterkonto zu erfassen); eine Nachzahlung wird überwiesen, mit dem Mieterkonto oder nach
        Mietende mit der Kaution verrechnet.
      </p>
    </div>
  );
}
