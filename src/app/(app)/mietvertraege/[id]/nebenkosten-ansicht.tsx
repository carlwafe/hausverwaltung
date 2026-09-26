"use client";

import Link from "next/link";
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
  // Monatliche NK-Vorauszahlung nach der Abrechnung (erste Anpassung nach Jahresende, sonst der
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
          <td className="px-4 py-2 text-white">{d.kostenartName}</td>
          <td className="px-4 py-2 text-right text-neutral-200">
            {d.verteilerschluessel === "VORVERTEILT" ? "" : formatEuro(d.gesamtbetragPool)}
          </td>
          <td className="px-4 py-2 text-neutral-400">{VERTEILUNG_LABEL[d.verteilerschluessel] ?? d.verteilerschluessel}</td>
          <td className="px-4 py-2 text-right text-neutral-300">{umlagefaktor(d)}</td>
          <td className="px-4 py-2 text-right font-medium text-white">{formatEuro(d.anteilZeitraum)}</td>
          <td className="max-w-[340px] truncate px-4 py-2 text-xs text-neutral-500" title={bemerkung(d, unterjaehrig)}>
            {bemerkung(d, unterjaehrig)}
          </td>
        </tr>
      ))}
      <tr className="border-t border-neutral-700 font-medium">
        <td className="px-4 py-2 text-white">{summeText}</td>
        <td className="px-4 py-2 text-right text-white">{formatEuro(summeGesamt)}</td>
        <td colSpan={2} />
        <td className="px-4 py-2 text-right text-white">{formatEuro(summeAnteil)}</td>
        <td />
      </tr>
    </>
  );
}

/**
 * Nebenkostenabrechnung eines Mietvertrags für ein Jahr im Aufbau des Musters: kalte und warme
 * Betriebskosten mit Gesamtkosten, Verteilerschlüssel, Umlagefaktor und Anteil, darunter Abrechnung
 * & Saldo (Nachzahlung + / Guthaben −), Erledigung des Saldos und die neue Vorauszahlung.
 */
export function NebenkostenAnsicht({
  daten,
  jahr,
  kopf,
}: {
  daten: NkJahrDaten | null;
  jahr: number | null;
  kopf: { mieter: string; einheit: string; wohnflaeche: number };
}) {
  if (!daten) {
    return (
      <div className="rounded-lg border border-neutral-800 px-4 py-8 text-center text-sm text-neutral-500">
        {jahr === null
          ? "Für diesen Mietvertrag gibt es noch keine Nebenkostenabrechnung."
          : `Für ${jahr} gibt es keine Nebenkostenabrechnung für diesen Mietvertrag.`}
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
  const offen = Math.round((daten.saldo - erledigt) * 100) / 100;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-medium text-white">
          Nebenkostenabrechnung für den Zeitraum 01.01.{daten.jahr} – 31.12.{daten.jahr}
        </h3>
        <Link href={`/nebenkostenabrechnungen/${daten.abrechnungId}`} className="text-xs text-neutral-400 hover:text-white hover:underline">
          Gesamtabrechnung {daten.jahr} ({daten.abrechnungStatus === "FINAL" ? "final" : "Entwurf"}) →
        </Link>
      </div>

      <table className="mb-4 text-sm">
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
            <td className="py-0.5 pr-8 text-neutral-400">Wohnfläche Mieter (m²):</td>
            <td className="py-0.5 text-white">{formatZahl(kopf.wohnflaeche)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-8 text-neutral-400">Nutzungszeitraum:</td>
            <td className="py-0.5 text-white">
              {formatDate(daten.zeitraumVon)} – {formatDate(daten.zeitraumBis)}
              {unterjaehrig && (
                <span className="text-neutral-400">
                  {" "}
                  ({nutzungTage} von {jahrTage} Tagen)
                </span>
              )}
            </td>
          </tr>
        </tbody>
      </table>

      <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[1000px] text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5">Kostenart</th>
              <th className="px-4 py-2.5 text-right">Gesamtkosten Objekt</th>
              <th className="px-4 py-2.5">Verteilerschlüssel</th>
              <th className="px-4 py-2.5 text-right">Umlagefaktor</th>
              <th className="px-4 py-2.5 text-right">Anteil Mieter (€)</th>
              <th className="px-4 py-2.5">Bemerkung</th>
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
              <td colSpan={4} className="px-4 py-2 text-neutral-300">
                Gesamtkosten (Anteil Mieter)
              </td>
              <td className="px-4 py-2 text-right text-white">{formatEuro(daten.kostenanteilGesamt)}</td>
              <td />
            </tr>
            <tr className="border-t border-neutral-800">
              <td colSpan={4} className="px-4 py-2 text-neutral-300">
                abzgl. geleistete NK-Vorauszahlungen
              </td>
              <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(daten.vorauszahlungGesamt)}</td>
              <td className="px-4 py-2 text-xs text-neutral-500">aus den tatsächlichen Mietzahlungen</td>
            </tr>
            <tr className="border-t border-neutral-700 font-medium">
              <td colSpan={4} className="px-4 py-2 text-white">
                Saldo (Nachzahlung + / Guthaben −)
              </td>
              <td className={`px-4 py-2 text-right ${nachzahlung ? "text-red-400" : "text-green-400"}`}>{formatEuro(saldoMuster)}</td>
              <td />
            </tr>
            <tr className="border-t border-neutral-700 bg-neutral-900 font-semibold">
              <td colSpan={4} className="px-4 py-2.5 text-white">
                Ergebnis
              </td>
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

      <h3 className="mb-2 mt-6 text-sm font-medium text-white">Erledigung des Saldos</h3>
      <div className="w-full overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full min-w-[800px] text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2.5 text-right">Betrag</th>
              <th className="px-4 py-2.5">Datum</th>
              <th className="px-4 py-2.5">Art der Erledigung</th>
              <th className="px-4 py-2.5">Verrechnet mit / Auszahlungsweg</th>
              <th className="px-4 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {daten.erledigungen.map((e, i) => (
              <tr key={i} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-right text-white">{formatEuro(Math.abs(e.betrag))}</td>
                <td className="px-4 py-2 text-neutral-200">{e.datum ? formatDate(e.datum) : "–"}</td>
                <td className="px-4 py-2 text-neutral-200">{e.art}</td>
                <td className="px-4 py-2 text-neutral-400">{e.weg}</td>
                <td className="px-4 py-2 text-green-400">gebucht</td>
              </tr>
            ))}
            <tr className="border-t border-neutral-700 font-medium">
              <td className={`px-4 py-2 text-right ${Math.abs(offen) < 0.005 ? "text-green-400" : "text-amber-400"}`}>
                {formatEuro(Math.abs(offen))}
              </td>
              <td colSpan={3} className="px-4 py-2 text-neutral-300">
                {Math.abs(offen) < 0.005
                  ? "Saldo vollständig erledigt"
                  : offen > 0
                    ? "noch an den Mieter auszuzahlen oder mit der Miete zu verrechnen"
                    : "noch vom Mieter zu zahlen"}
              </td>
              <td className={`px-4 py-2 ${Math.abs(offen) < 0.005 ? "text-green-400" : "text-amber-400"}`}>
                {Math.abs(offen) < 0.005 ? "erledigt" : "offen"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {daten.neueVorauszahlung && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-medium text-white">
            {daten.neueVorauszahlung.ab
              ? `Neue monatliche Vorauszahlung ab ${formatDate(daten.neueVorauszahlung.ab)}`
              : `Monatliche Vorauszahlung ab ${daten.jahr + 1} (unverändert)`}
          </h3>
          <table className="text-sm">
            <tbody>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-400">NK-Vorauszahlung (mtl.)</td>
                <td className="py-0.5 text-right text-white">{formatEuro(daten.neueVorauszahlung.betrag)}</td>
              </tr>
              <tr>
                <td className="py-0.5 pr-8 text-neutral-500">rechnerisch nach Abrechnung (Kosten ÷ 12)</td>
                <td className="py-0.5 text-right text-neutral-400">
                  {formatEuro(Math.ceil((daten.kostenanteilGesamt / (nutzungTage / jahrTage) / 12) * 100) / 100)}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      )}
      <p className="mt-3 text-xs italic text-neutral-500">
        Ein Guthaben wird entweder ausgezahlt oder mit der Miete verrechnet (§ 387 BGB, dem Mieter schriftlich mitzuteilen
        und als eigene Buchung im Mieterkonto zu erfassen); eine Nachzahlung wird überwiesen, mit dem Mieterkonto oder nach
        Mietende mit der Kaution verrechnet.
      </p>
    </div>
  );
}
