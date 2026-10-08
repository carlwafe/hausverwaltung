"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { mieterName } from "@/lib/mieter-name";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";
import { fruehestensGueltigNachZugang, neueIndexmiete, spaetesterZugang } from "@/lib/indexmiete";
import {
  STANDARD_ZUSCHLAG_GRUND,
  STANDARD_ZUSCHLAG_PROZENT,
  schlageVorauszahlungVor,
  vorgeschlagenesGueltigAb,
} from "@/lib/vorauszahlung-vorschlag";
import { passeNkVorauszahlungAn, uebernehmeIndexerhoehung } from "@/app/(app)/mietvertraege/actions";
import { SchreibenAblegen, type SchreibenKopie } from "@/components/schreiben-ablegen";
import { MandatKlammer, mandatTeile, type MandatDaten } from "@/components/mandat-klammer";

type Mieter = { anrede: "FRAU" | "HERR" | null; vorname: string; nachname: string };

export type AnpassungIndexDaten = {
  referenzDatum: Date;
  referenzQuelle: "letzte Mietanpassung" | "Mietbeginn";
  // Vorbelegter Basisindex-Monat: bei der letzten Erhöhung gespeichert, sonst der Referenzmonat selbst.
  basisVorbelegung: { jahr: number; monat: number; gespeichert: boolean } | null;
  vpi: { jahr: number; monat: number; wert: number }[];
};

export type AnpassungNkDaten = {
  jahr: number;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  anteileJahr: number[];
};

export type AnpassungsschreibenProps = {
  mietvertragId: string;
  mieter: Mieter[];
  strasse: string;
  plzOrt: string;
  einheit: string;
  basisKaltmiete: number;
  basisNk: number;
  erhoehungen: { gueltigAb: Date; kaltmiete: number; nebenkostenVorauszahlung: number; indexMonat?: string | null }[];
  mehrwertsteuer: number;
  jobcenter: boolean;
  zahlungsweg: "LASTSCHRIFT" | "UEBERWEISUNG" | null;
  // Mandatsreferenz/Gläubiger-ID aus der Bankzeile der letzten Lastschrift (null = keine gefunden).
  mandat: MandatDaten | null;
  kopien: SchreibenKopie[];
  // Seite, die nach dem Ablegen einer Kopie neu geladen wird.
  revalidatePfad: string;
  // null = Indexerhöhung nicht möglich (kein Mietbeginn / keine VPI-Werte), `indexHinweis` nennt den Grund.
  index: AnpassungIndexDaten | null;
  indexHinweis: string | null;
  // null = NK-Anpassung nicht möglich (keine Abrechnung, kein Kostenanteil, Vertrag endet vorher).
  nk: AnpassungNkDaten | null;
  nkHinweis: string | null;
  // Welche Abschnitte beim Öffnen angehakt sind (je nach Einstieg über „Mieterhöhung“ oder „NK-Anpassung“).
  startIndex: boolean;
  startNk: boolean;
};

const formatEuro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
const formatDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
const formatDatumLokal = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const monatJahr = (d: Date) => new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(d);
const zahl = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const prozent = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monatLabel = (jahr: number, monat: number) => `${String(monat).padStart(2, "0")}/${jahr}`;
const isoDatum = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ausIso = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// Absender steht nirgends in den Stammdaten — im Browser gemerkt (reine Bequemlichkeit).
const ABSENDER_KEY = "nk-schreiben-absender";

function briefAnrede(mieter: Mieter[]): string {
  if (mieter.length === 0) return "Sehr geehrte Damen und Herren,";
  if (mieter.every((m) => m.anrede !== null)) {
    const text = mieter.map((m) => (m.anrede === "FRAU" ? `sehr geehrte Frau ${m.nachname}` : `sehr geehrter Herr ${m.nachname}`)).join(", ") + ",";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `Guten Tag ${mieter.map((m) => mieterName(m)).join(" und ")},`;
}
const empfaengerZeile = (m: Mieter) => `${m.anrede === "FRAU" ? "Frau " : m.anrede === "HERR" ? "Herrn " : ""}${mieterName(m)}`;

const eingabeKlasse = "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

/**
 * Anpassungsschreiben an den Mieter mit zwei einzeln zuschaltbaren Abschnitten: Indexerhöhung der Kaltmiete
 * (§ 557b BGB) und Anpassung der NK-Vorauszahlung (§ 560 Abs. 4 BGB). Ein Schreiben, eine Gesamtmiete, eine
 * Mieterhöhung beim Übernehmen. Erreichbar über „Mieterhöhung“ und „NK-Anpassung“ — beide Seiten zeigen dasselbe
 * Formular und unterscheiden sich nur darin, welcher Abschnitt zuerst angehakt ist.
 */
export function Anpassungsschreiben({
  mietvertragId, mieter, strasse, plzOrt, einheit, basisKaltmiete, basisNk, erhoehungen, mehrwertsteuer, jobcenter,
  zahlungsweg: zahlungswegVertrag, mandat, kopien, revalidatePfad, index, indexHinweis, nk, nkHinweis, startIndex, startNk,
}: AnpassungsschreibenProps) {
  const [mitIndex, setMitIndex] = useState(index !== null && startIndex);
  const [mitNk, setMitNk] = useState(nk !== null && startNk);

  // ----- gemeinsame Angaben -----
  const [gueltigAbIso, setGueltigAbIso] = useState(() => isoDatum(vorgeschlagenesGueltigAb()));
  const [briefdatumIso, setBriefdatumIso] = useState(() => isoDatum(new Date()));
  const [absender, setAbsender] = useState("");
  const [anrede, setAnrede] = useState(() => briefAnrede(mieter));
  const [zahlungsweg, setZahlungsweg] = useState<"LASTSCHRIFT" | "UEBERWEISUNG">(zahlungswegVertrag ?? "LASTSCHRIFT");
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    try {
      const gemerkt = window.localStorage.getItem(ABSENDER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig aus dem Browser-Speicher laden
      if (gemerkt) setAbsender(gemerkt);
    } catch {}
  }, []);
  const absenderAendern = (wert: string) => {
    setAbsender(wert);
    try {
      window.localStorage.setItem(ABSENDER_KEY, wert);
    } catch {}
  };

  const gueltigAb = ausIso(gueltigAbIso);
  const briefdatum = ausIso(briefdatumIso) ?? new Date();
  const vertragStand = { kaltmiete: basisKaltmiete, nebenkostenVorauszahlung: basisNk, mieterhoehungen: erhoehungen };
  // Stand im Monat vor Wirksamwerden = bisherige Miete.
  const bisher = gueltigAb
    ? ermittleMieteFuerMonat(vertragStand, gueltigAb.getFullYear(), gueltigAb.getMonth())
    : ermittleMieteFuerMonat(vertragStand, new Date().getFullYear(), new Date().getMonth() + 1);
  // Kaltmiete, die ab „Gültig ab“ ohne Indexerhöhung gilt (bei reiner NK-Anpassung unverändert).
  const kaltmieteAb = gueltigAb ? ermittleMieteFuerMonat(vertragStand, gueltigAb.getFullYear(), gueltigAb.getMonth() + 1).kaltmiete : bisher.kaltmiete;

  // ----- Indexerhöhung -----
  const vpi = index?.vpi ?? [];
  const key = (w: { jahr: number; monat: number }) => `${w.jahr}-${w.monat}`;
  const referenzDatum = index?.referenzDatum ?? null;
  const vorMonat = index?.basisVorbelegung ?? (referenzDatum ? { jahr: referenzDatum.getUTCFullYear(), monat: referenzDatum.getUTCMonth() + 1, gespeichert: false } : null);
  const basisStandard = vorMonat ? (vpi.find((w) => w.jahr === vorMonat.jahr && w.monat === vorMonat.monat) ?? null) : null;
  const neuesterStandard = vpi.length > 0 ? vpi[vpi.length - 1] : null;

  const [basisKey, setBasisKey] = useState(basisStandard ? key(basisStandard) : "");
  const [neuKey, setNeuKey] = useState(neuesterStandard ? key(neuesterStandard) : "");
  const [mieteEigen, setMieteEigen] = useState<string | null>(null);
  // Standard: auf volle Euro abrunden (zugunsten des Mieters); abgewählt = auf den Cent genau.
  const [abrunden, setAbrunden] = useState(true);

  const basis = vpi.find((w) => key(w) === basisKey) ?? null;
  const neu = vpi.find((w) => key(w) === neuKey) ?? neuesterStandard;
  const rechnerisch = basis && neu ? neueIndexmiete(bisher.kaltmiete, basis.wert, neu.wert, abrunden) : null;
  const neueKalt = mieteEigen !== null ? Math.max(0, Number(mieteEigen.replace(",", ".")) || 0) : rechnerisch;
  const aenderungProzent = basis && neu ? (neu.wert / basis.wert - 1) * 100 : null;
  const erhoehungBetrag = neueKalt !== null ? Math.round((neueKalt - bisher.kaltmiete) * 100) / 100 : null;

  const fruehestens = referenzDatum ? new Date(referenzDatum.getUTCFullYear() + 1, referenzDatum.getUTCMonth(), 1) : null;
  const zuFrueh = mitIndex && gueltigAb !== null && fruehestens !== null && gueltigAb < fruehestens;
  // Zugang: Die Miete gilt ab dem übernächsten Monat nach Zugang (§ 557b Abs. 3 BGB). Für „Gültig ab“ muss das
  // Schreiben also spätestens am Letzten des Monats davor zugehen; frühester möglicher Zugang ist das Briefdatum.
  const zugangSpaetestens = gueltigAb ? spaetesterZugang(gueltigAb) : null;
  const zugangZuSpaet = mitIndex && zugangSpaetestens !== null && briefdatum > zugangSpaetestens;
  // Rundung: Wurde zugunsten des Mieters auf volle Euro abgerundet, nennt das Schreiben den rechnerischen Wert.
  const rechenwert = basis && neu ? Math.round(bisher.kaltmiete * (neu.wert / basis.wert) * 100) / 100 : null;
  const abgerundet = mieteEigen === null && abrunden && rechenwert !== null && neueKalt !== null && rechenwert - neueKalt >= 0.005;

  // ----- NK-Anpassung -----
  const [zuschlag, setZuschlag] = useState(STANDARD_ZUSCHLAG_PROZENT);
  const [zuschlagGrund, setZuschlagGrund] = useState(STANDARD_ZUSCHLAG_GRUND);
  const [nkEigen, setNkEigen] = useState<string | null>(null);
  const zuschlagProzent = Math.max(0, Number(zuschlag.replace(",", ".")) || 0);
  const nkVorschlag = nk ? schlageVorauszahlungVor({ ...nk, aktuelleVorauszahlung: bisher.nebenkostenVorauszahlung, zuschlagProzent }) : null;
  const nkAktiv = mitNk && nk !== null && nkVorschlag !== null;
  const neueNk = nkAktiv ? (nkEigen !== null ? Math.max(0, Number(nkEigen.replace(",", ".")) || 0) : nkVorschlag.vorschlag) : bisher.nebenkostenVorauszahlung;
  const nkDifferenz = Math.round((neueNk - bisher.nebenkostenVorauszahlung) * 100) / 100;
  const nkAenderung = nkAktiv && Math.abs(nkDifferenz) >= 0.005;

  // ----- Brief -----
  const idx =
    mitIndex && index && basis && neu && neueKalt !== null && erhoehungBetrag !== null && aenderungProzent !== null
      ? { index, basis, neu, neueKalt, erhoehungBetrag, aenderungProzent }
      : null;
  const nurNk = nkAktiv && !mitIndex;
  const beide = mitIndex && nkAktiv;
  // Gesamtmiete ab „Gültig ab“: neue Kaltmiete (falls Index) bzw. unveränderte Kaltmiete + neue NK.
  const gesamt = (idx ? idx.neueKalt : kaltmieteAb) + neueNk + mehrwertsteuer;
  // Beide Abschnitte mit Änderung: engere Absätze, damit das Schreiben auf eine A4-Seite passt.
  const kompakt = beide && nkAenderung;
  const ab = kompakt ? "mb-2" : "mb-3";
  const bereit = mitIndex ? idx !== null : nkAktiv;
  const zeigeGesamtmiete = idx !== null || (nurNk && nkAenderung);

  const mandatAngaben = mandatTeile(mandat);

  const [fehler, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const aktion = mitIndex ? uebernehmeIndexerhoehung : passeNkVorauszahlungAn;
    const ergebnis = await runFormAction(aktion.bind(null, mietvertragId), formData);
    setGespeichert(ergebnis === null);
    return ergebnis;
  }, null);

  const absenderZeilen = absender.split("\n").map((z) => z.trim()).filter(Boolean);
  const absenderName = absenderZeilen[0] ?? "";
  const absenderOrt = absenderZeilen.at(-1)?.replace(/^\d{5}\s*/, "") ?? "";
  const gueltigAbText = gueltigAb ? formatDatumLokal(gueltigAb) : "…";

  const notizen = [
    idx ? `Indexmiete § 557b BGB: VPI ${monatLabel(idx.basis.jahr, idx.basis.monat)} ${zahl(idx.basis.wert)} → ${monatLabel(idx.neu.jahr, idx.neu.monat)} ${zahl(idx.neu.wert)}` : null,
    nkAktiv && nk ? `NK-Vorauszahlung angepasst nach Abrechnung ${nk.jahr} (§ 560 Abs. 4 BGB)` : null,
  ].filter(Boolean).join(" · ");

  const uebernehmenText = pending
    ? "Speichern…"
    : idx
      ? `${formatEuro(idx.neueKalt)}${nkAktiv ? ` + NK ${formatEuro(neueNk)}` : ""} ab ${gueltigAbText} übernehmen`
      : nkAktiv
        ? `NK ${formatEuro(neueNk)} ab ${gueltigAbText} übernehmen`
        : "Übernehmen";

  const abschnittKopf = (
    id: string,
    checked: boolean,
    onChange: (v: boolean) => void,
    andererAn: boolean,
    titel: string,
    verfuegbar: boolean,
  ) => (
    <label className={`flex items-center gap-2 text-sm font-medium ${verfuegbar ? "text-white" : "text-neutral-500"}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        // Mindestens ein Abschnitt muss angehakt bleiben.
        disabled={!verfuegbar || (checked && !andererAn)}
        onChange={(e) => onChange(e.target.checked)}
      />
      {titel}
    </label>
  );

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <DateInput label="Gültig ab" value={gueltigAbIso} onChange={setGueltigAbIso} labelClassName="text-xs text-neutral-400" />
            <DateInput label="Datum des Schreibens" value={briefdatumIso} onChange={setBriefdatumIso} labelClassName="text-xs text-neutral-400" />
          </div>
          <p className="text-xs text-neutral-500">
            Beide Abschnitte gelten ab demselben „Gültig ab“ (vorbelegt: übernächster Monatserster) und werden als eine
            Mieterhöhung übernommen. Abschnitte, die nicht angehakt sind, erscheinen weder im Schreiben noch in der Übernahme.
          </p>

          {/* ---------- Abschnitt 1: Indexerhöhung ---------- */}
          <div className="rounded-md border border-neutral-800 p-3">
            {abschnittKopf("an-index", mitIndex, setMitIndex, mitNk, "Indexerhöhung der Kaltmiete (§ 557b BGB)", index !== null)}
            {index === null && indexHinweis && <p className="mt-2 text-xs text-neutral-500">{indexHinweis}</p>}
            {index !== null && mitIndex && (
              <div className="mt-3">
                <p className="mb-3 text-xs text-neutral-500">
                  Ausgangspunkt: {index.referenzQuelle} am {formatDate(index.referenzDatum)}. Vorbelegt ist als Basisindex{" "}
                  {vorMonat?.gespeichert ? "der bei der letzten Erhöhung zugrunde gelegte Index" : "der VPI des Monats selbst"}
                  {vorMonat && ` (${monatLabel(vorMonat.jahr, vorMonat.monat)})`} und als neuer Index der neueste eingetragene Wert.
                  Wurde die letzte Erhöhung nach einem anderen Index berechnet (Schreiben prüfen), den Monat hier ändern.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-basis">Basisindex (Monat)</label>
                    <select id="ix-basis" value={basisKey} onChange={(e) => setBasisKey(e.target.value)} className={eingabeKlasse}>
                      {!basisStandard && <option value="">– bitte wählen –</option>}
                      {[...vpi].reverse().map((w) => (
                        <option key={key(w)} value={key(w)}>{monatLabel(w.jahr, w.monat)} – {zahl(w.wert)}</option>
                      ))}
                    </select>
                    {!basisStandard && vorMonat && (
                      <p className="mt-1 text-xs text-amber-400">
                        Für {monatLabel(vorMonat.jahr, vorMonat.monat)} ist kein VPI eingetragen.{" "}
                        <Link href="/mietvertraege/vpi-werte" className="underline">Nachtragen</Link>
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-neu">Neuer Index (Monat)</label>
                    <select id="ix-neu" value={neuKey} onChange={(e) => setNeuKey(e.target.value)} className={eingabeKlasse}>
                      {[...vpi].reverse().map((w) => (
                        <option key={key(w)} value={key(w)}>{monatLabel(w.jahr, w.monat)} – {zahl(w.wert)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-miete">Neue Kaltmiete (€)</label>
                    <input
                      id="ix-miete"
                      inputMode="decimal"
                      value={mieteEigen ?? (rechnerisch !== null ? String(rechnerisch) : "")}
                      onChange={(e) => setMieteEigen(e.target.value)}
                      className={eingabeKlasse}
                    />
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-neutral-400">
                      <input type="checkbox" checked={abrunden} onChange={(e) => setAbrunden(e.target.checked)} />
                      auf volle Euro abrunden
                    </label>
                    {mieteEigen !== null && (
                      <button type="button" onClick={() => setMieteEigen(null)} className="mt-1 text-xs text-neutral-400 hover:text-white">
                        auf Rechenwert zurücksetzen
                      </button>
                    )}
                  </div>
                </div>
                {zuFrueh && fruehestens && (
                  <p className="mt-3 text-xs text-amber-400">
                    Die Miete muss mindestens ein Jahr unverändert geblieben sein (Erhöhungen nach §§ 559/560 BGB
                    ausgenommen). Frühestens {formatDatumLokal(fruehestens)} — „Gültig ab“ liegt davor.
                  </p>
                )}
                {zugangZuSpaet && (
                  <p className="mt-3 text-xs text-amber-400">
                    Das Schreiben ist auf den {formatDatumLokal(briefdatum)} datiert und kann frühestens an diesem Tag
                    zugehen — dann gilt die Erhöhung erst ab {formatDatumLokal(fruehestensGueltigNachZugang(briefdatum))}.
                    „Gültig ab“ liegt davor.
                  </p>
                )}
                {zugangSpaetestens && (
                  <p className="mt-3 text-xs text-neutral-500">
                    Soll die Erhöhung ab {gueltigAbText} gelten, muss das Schreiben spätestens am {formatDatumLokal(zugangSpaetestens)}{" "}
                    zugehen, sonst verschiebt sie sich um einen Monat (laut Vertrag ist die geänderte Miete ab dem
                    übernächsten Monat nach Zugang zu zahlen). Den Zugang nachweisbar machen (Einwurf-Einschreiben oder Bote mit Zeuge).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* ---------- Abschnitt 2: NK-Anpassung ---------- */}
          <div className="rounded-md border border-neutral-800 p-3">
            {abschnittKopf(
              "an-nk",
              mitNk,
              setMitNk,
              mitIndex,
              `NK-Vorauszahlung anpassen (§ 560 Abs. 4 BGB)${nk ? `, Abrechnung ${nk.jahr}` : ""}`,
              nk !== null,
            )}
            {nk === null && nkHinweis && <p className="mt-2 text-xs text-neutral-500">{nkHinweis}</p>}
            {nk !== null && nkVorschlag !== null && mitNk && (
              <div className="mt-3">
                <table className="w-full text-sm">
                  <tbody>
                    <tr>
                      <td className="py-1 pr-4 text-neutral-400">Kostenanteil {nk.jahr}</td>
                      <td className="py-1 text-right text-white">{formatEuro(nk.kostenanteilGesamt)}</td>
                    </tr>
                    {nkVorschlag.hochgerechnet && (
                      <tr>
                        <td className="py-1 pr-4 text-neutral-400">hochgerechnet auf 12 Monate</td>
                        <td className="py-1 text-right text-white">{formatEuro(nkVorschlag.jahreskosten)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1 pr-4 text-neutral-400">rechnerisch monatlich (÷ 12)</td>
                      <td className="py-1 text-right text-white">{formatEuro(nkVorschlag.rechnerischMonatlich)}</td>
                    </tr>
                    <tr>
                      <td className="py-1 pr-4 text-neutral-400">bisherige Vorauszahlung (mtl.)</td>
                      <td className="py-1 text-right text-white">{formatEuro(bisher.nebenkostenVorauszahlung)}</td>
                    </tr>
                    <tr className="border-t border-neutral-700 font-medium">
                      <td className="py-1.5 pr-4 text-white">
                        Vorschlag{zuschlagProzent > 0 && ` (inkl. ${String(zuschlagProzent).replace(".", ",")} % Zuschlag)`}, aufgerundet
                      </td>
                      <td className="py-1.5 text-right text-white">{formatEuro(nkVorschlag.vorschlag)}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-neu">Neue Vorauszahlung (mtl., €)</label>
                    <input
                      id="nk-neu"
                      inputMode="decimal"
                      value={nkEigen ?? String(nkVorschlag.vorschlag)}
                      onChange={(e) => setNkEigen(e.target.value)}
                      className={eingabeKlasse}
                    />
                    {nkEigen !== null && (
                      <button type="button" onClick={() => setNkEigen(null)} className="mt-1 text-xs text-neutral-400 hover:text-white">
                        auf Vorschlag zurücksetzen
                      </button>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-zuschlag">Zuschlag (%)</label>
                    <input id="nk-zuschlag" inputMode="decimal" value={zuschlag} onChange={(e) => setZuschlag(e.target.value)} className={eingabeKlasse} />
                  </div>
                </div>
                {zuschlagProzent > 0 && (
                  <div className="mt-3">
                    <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-zuschlag-grund">Begründung des Zuschlags (erscheint im Schreiben)</label>
                    <input
                      id="nk-zuschlag-grund"
                      value={zuschlagGrund}
                      onChange={(e) => setZuschlagGrund(e.target.value)}
                      placeholder="z.B. angekündigte Preiserhöhung der Stadtwerke zum 1.1."
                      className={eingabeKlasse}
                    />
                    <p className="mt-1 text-xs text-amber-400">
                      Pauschale Zuschläge sind nach BGH (VIII ZR 294/10) angreifbar — bei einem konkreten Grund (z.B.
                      angekündigte Preiserhöhung) diesen hier eintragen.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
          {kompakt && (
            <p className="text-xs text-neutral-500">
              Mit beiden Abschnitten ist das Schreiben knapp bemessen (10 pt, engere Absätze): in der Vorschau prüfen,
              ob die Unterschrift noch auf der ersten Seite steht — zusätzliche Sätze wie der Jobcenter-Hinweis kosten Platz.
            </p>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="an-absender">
              Absender (Name, Straße, PLZ Ort — wird in diesem Browser gemerkt)
            </label>
            <textarea id="an-absender" rows={3} value={absender} onChange={(e) => absenderAendern(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="an-anrede">
              Anrede{mieter.some((m) => m.anrede === null) && " (Frau/Herr beim Mieter nicht erfasst → neutral)"}
            </label>
            <input id="an-anrede" value={anrede} onChange={(e) => setAnrede(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="an-zahlweg">
              Zahlungsweg des Mieters{!zahlungswegVertrag && " (im Vertrag nicht erfasst)"}
            </label>
            <select id="an-zahlweg" value={zahlungsweg} onChange={(e) => setZahlungsweg(e.target.value as "LASTSCHRIFT" | "UEBERWEISUNG")} className={eingabeKlasse}>
              <option value="LASTSCHRIFT">SEPA-Lastschrift</option>
              <option value="UEBERWEISUNG">Überweisung / Dauerauftrag</option>
            </select>
            {zahlungsweg === "LASTSCHRIFT" && (
              <p className="mt-1 text-xs text-neutral-500">
                Das Schreiben gilt als Vorabankündigung. Den neuen Betrag ab „Gültig ab“ auch im Lastschrifteinzug bei
                der Bank eintragen.{" "}
                {mandatAngaben.length > 0
                  ? `Aus der letzten Lastschrift im Journal ins Schreiben übernommen: ${mandatAngaben.join(", ")}.`
                  : "Im Journal wurde keine Mandatsreferenz gefunden — Mandatsreferenz und Gläubiger-ID fehlen im Schreiben."}
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={() => window.print()} disabled={!bereit} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50">
              Schreiben drucken / als PDF
            </button>
            <form action={formAction}>
              <input type="hidden" name="gueltigAb" value={gueltigAbIso} />
              {idx && <input type="hidden" name="kaltmiete" value={idx.neueKalt} />}
              {idx && <input type="hidden" name="indexMonat" value={`${idx.neu.jahr}-${String(idx.neu.monat).padStart(2, "0")}`} />}
              {nkAktiv && <input type="hidden" name="nebenkostenVorauszahlung" value={neueNk} />}
              <input type="hidden" name="notizen" value={notizen} />
              <button type="submit" disabled={pending || !bereit || !gueltigAb} className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50">
                {uebernehmenText}
              </button>
            </form>
          </div>
          {fehler && <p className="text-sm text-red-400">{fehler}</p>}
          {gespeichert && !fehler && (
            <p className="text-sm text-green-400">
              Übernommen — steht als Mieterhöhung ({idx && nkAktiv ? "Kaltmiete und NK-Vorauszahlung angepasst" : idx ? "NK-Vorauszahlung unverändert" : "Kaltmiete unverändert"}) im Vertrag.
            </p>
          )}
          <p className="text-xs text-neutral-500">Erst übernehmen, wenn das Schreiben verschickt ist: Die Miete gilt dann im Soll ab „Gültig ab“.</p>
          <SchreibenAblegen mietvertragId={mietvertragId} revalidatePath={revalidatePfad} belegDatumIso={briefdatumIso} kopien={kopien} />
        </div>
      </div>

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-neutral-500">Vorschau</p>
      {!bereit ? (
        <p className="text-sm text-neutral-400">
          {mitIndex ? "Bitte einen Basisindex wählen." : "Bitte mindestens einen Abschnitt anhaken."}
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className={`druckbereich mx-auto w-[210mm] min-h-[297mm] bg-white px-[20mm] pb-[15mm] pt-[15mm] font-serif ${kompakt ? "text-[10pt]" : "text-[11pt]"} leading-snug text-black shadow`}>
            <p className="mb-2 text-[8pt] text-neutral-600 underline">{absenderZeilen.join(" · ") || "Absender"}</p>
            <div className="flex items-start justify-between">
              <div className={`mt-2 ${kompakt ? "min-h-[28mm]" : "min-h-[32mm]"}`}>
                {mieter.map((m) => (<p key={mieterName(m)}>{empfaengerZeile(m)}</p>))}
                <p>{strasse}</p>
                <p>{plzOrt}</p>
              </div>
              <p className="mt-2">{absenderOrt ? `${absenderOrt}, ` : ""}{formatDatumLokal(briefdatum)}</p>
            </div>

            <p className={`${kompakt ? "mb-3" : "mb-6"} mt-4 font-bold`}>
              {beide
                ? "Anpassung der Miete (Indexmiete, § 557b BGB) und der Betriebskostenvorauszahlung (§ 560 Abs. 4 BGB)"
                : idx
                  ? "Anpassung der Miete nach der vereinbarten Indexmiete (§ 557b BGB)"
                  : "Anpassung der Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB"}
              <br />
              Mietobjekt: {strasse}, {plzOrt}, Wohnung {einheit}
            </p>

            <p className={ab}>{anrede}</p>

            {/* ---------- Abschnitt Indexmiete ---------- */}
            {idx && (
              <>
                <p className={ab}>
                  in Ihrem Mietvertrag ist eine Indexmiete gemäß § 557b BGB vereinbart. Danach sind Vermieter und Mieter
                  berechtigt, die Miete entsprechend und im selben Verhältnis wie die Entwicklung des
                  Verbraucherpreisindexes für Deutschland anzupassen. Ausgangspunkt ist der Preisindex zum Zeitpunkt {idx.index.referenzQuelle === "Mietbeginn" ? "des Mietbeginns" : "der letzten Mietanpassung"} ({formatDate(idx.index.referenzDatum)}). Ich erkläre
                  hiermit in Textform die Anpassung der Miete wie folgt:
                </p>
                {beide && nkAenderung && <p className="mb-1 font-bold">1. Nettokaltmiete (Indexmiete, § 557b BGB)</p>}
                <table className="mb-2 w-full">
                  <tbody>
                    <tr>
                      <td className="py-0.5">Verbraucherpreisindex für Deutschland (2020 = 100), Ausgangswert {monatLabel(idx.basis.jahr, idx.basis.monat)}</td>
                      <td className="py-0.5 text-right">{zahl(idx.basis.wert)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">Verbraucherpreisindex für Deutschland (2020 = 100), aktueller Wert {monatLabel(idx.neu.jahr, idx.neu.monat)}</td>
                      <td className="py-0.5 text-right">{zahl(idx.neu.wert)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">Veränderung des Preisindexes</td>
                      <td className="py-0.5 text-right">{idx.aenderungProzent >= 0 ? "+" : ""}{prozent(idx.aenderungProzent)} %</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">bisherige Nettokaltmiete</td>
                      <td className="py-0.5 text-right">{formatEuro(bisher.kaltmiete)}</td>
                    </tr>
                    <tr className="border-t border-black font-bold">
                      <td className="py-1">neue Nettokaltmiete ab {gueltigAbText}</td>
                      <td className="py-1 text-right">{formatEuro(idx.neueKalt)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">Erhöhung der Nettokaltmiete</td>
                      <td className="py-0.5 text-right">{idx.erhoehungBetrag >= 0 ? "+" : ""}{formatEuro(idx.erhoehungBetrag)}</td>
                    </tr>
                  </tbody>
                </table>
                <p className={`${ab} text-[9pt] leading-snug`}>
                  {abgerundet && rechenwert !== null && (
                    <>
                      Rechenweg: {formatEuro(bisher.kaltmiete)} × {zahl(idx.neu.wert)} ÷ {zahl(idx.basis.wert)} = {formatEuro(rechenwert)},
                      zu Ihren Gunsten auf volle Euro abgerundet.{" "}
                    </>
                  )}
                  Quelle: Statistisches Bundesamt (Destatis), Verbraucherpreisindex für Deutschland, Gesamtindex.
                </p>
              </>
            )}

            {/* ---------- Abschnitt NK-Vorauszahlung ---------- */}
            {nkAktiv && nk && nkVorschlag && (nurNk || nkAenderung) && (
              <>
                {beide && <p className="mb-1 font-bold">2. Betriebskostenvorauszahlung (§ 560 Abs. 4 BGB)</p>}
                <p className="mb-2">
                  {beide ? "Auf" : "auf"} Grundlage der Betriebskostenabrechnung für den Abrechnungszeitraum 01.01.{nk.jahr} bis 31.12.{nk.jahr}{" "}
                  {nkAenderung
                    ? "passe ich Ihre monatliche Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB wie folgt an:"
                    : "bleibt Ihre monatliche Betriebskostenvorauszahlung unverändert."}
                </p>
                <table className="mb-2 w-full">
                  <tbody>
                    <tr>
                      <td className="py-0.5">
                        Ihr Anteil an den Betriebskosten {nk.jahr}
                        {nkVorschlag.hochgerechnet && ` (Nutzung ${formatDate(nk.zeitraumVon)} – ${formatDate(nk.zeitraumBis)}, hochgerechnet auf zwölf Monate)`}
                      </td>
                      <td className="py-0.5 text-right">{formatEuro(nkVorschlag.hochgerechnet ? nkVorschlag.jahreskosten : nk.kostenanteilGesamt)}</td>
                    </tr>
                    <tr>
                      <td className="py-0.5">davon monatlich (÷ 12)</td>
                      <td className="py-0.5 text-right">{formatEuro(nkVorschlag.rechnerischMonatlich)}</td>
                    </tr>
                    {zuschlagProzent > 0 && (
                      <tr>
                        <td className="py-0.5">
                          zzgl. {String(zuschlagProzent).replace(".", ",")} % Zuschlag{zuschlagGrund && ` (${zuschlagGrund})`}
                        </td>
                        <td className="py-0.5 text-right">{formatEuro(Math.round(nkVorschlag.rechnerischMonatlich * zuschlagProzent) / 100)}</td>
                      </tr>
                    )}
                    {nurNk && (
                      <tr>
                        <td className="py-0.5">bisherige monatliche Vorauszahlung</td>
                        <td className="py-0.5 text-right">{formatEuro(bisher.nebenkostenVorauszahlung)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-black font-bold">
                      <td className="py-1">
                        neue monatliche Vorauszahlung ab {gueltigAbText}
                        {!nurNk && ` (bisher ${formatEuro(bisher.nebenkostenVorauszahlung)})`}
                      </td>
                      <td className="py-1 text-right">{formatEuro(neueNk)}</td>
                    </tr>
                  </tbody>
                </table>
              </>
            )}

            {/* ---------- Gesamtmiete und Zahlungsweg ---------- */}
            {zeigeGesamtmiete && (
              <>
                <p className={ab}>
                  {nurNk && `Die Vorauszahlung ${nkDifferenz > 0 ? "erhöht" : "verringert"} sich damit um ${formatEuro(Math.abs(nkDifferenz))} monatlich. `}
                  Ab dem {gueltigAbText} setzt sich Ihre monatliche Miete {idx ? "damit " : ""}wie folgt zusammen:
                </p>
                <table className={`${ab} w-2/3`}>
                  <tbody>
                    <tr><td className="py-0.5">Nettokaltmiete</td><td className="py-0.5 text-right">{formatEuro(idx ? idx.neueKalt : kaltmieteAb)}</td></tr>
                    <tr>
                      <td className="py-0.5">Betriebskostenvorauszahlung{nkAenderung ? "" : " (unverändert)"}</td>
                      <td className="py-0.5 text-right">{formatEuro(neueNk)}</td>
                    </tr>
                    {mehrwertsteuer > 0 && (<tr><td className="py-0.5">Mehrwertsteuer</td><td className="py-0.5 text-right">{formatEuro(mehrwertsteuer)}</td></tr>)}
                    <tr className="border-t border-black font-bold"><td className="py-1">Gesamtmiete</td><td className="py-1 text-right">{formatEuro(gesamt)}</td></tr>
                  </tbody>
                </table>

                <p className={ab}>
                  {idx && (
                    <>
                      Die geänderte Miete ist mit Beginn des übernächsten Monats nach Zugang dieser Erklärung zu entrichten,
                      das ist der {gueltigAbText}. Die Miete war zuvor seit dem {formatDate(idx.index.referenzDatum)} unverändert.{" "}
                    </>
                  )}
                  {zahlungsweg === "LASTSCHRIFT" ? (
                    <>
                      Die Gesamtmiete von {formatEuro(gesamt)} ziehe ich erstmals mit der Lastschrift für{" "}
                      {gueltigAb ? monatJahr(gueltigAb) : "…"} aufgrund des bestehenden SEPA-Lastschriftmandats
                      <MandatKlammer mandat={mandat} /> von Ihrem Konto ein; Sie brauchen nichts weiter zu veranlassen. Dieses Schreiben gilt
                      zugleich als Vorabankündigung (Pre-Notification) des geänderten Lastschriftbetrags.
                    </>
                  ) : (
                    `Bitte zahlen Sie ab dem ${gueltigAbText} die neue Gesamtmiete von ${formatEuro(gesamt)} und passen Sie einen bestehenden Dauerauftrag entsprechend an.`
                  )}
                  {jobcenter && " Wird Ihre Miete vom Jobcenter gezahlt, leiten Sie dieses Schreiben bitte dorthin weiter."}
                </p>
              </>
            )}
            <p className={ab}>Für Rückfragen stehe ich Ihnen gern zur Verfügung.</p>
            <p className={kompakt ? "mb-8" : "mb-10"}>Mit freundlichen Grüßen</p>
            <p>{absenderName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
