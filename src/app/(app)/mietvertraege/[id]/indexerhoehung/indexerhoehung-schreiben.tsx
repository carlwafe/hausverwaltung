"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { mieterName } from "@/lib/mieter-name";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";
import { neueIndexmiete } from "@/lib/indexmiete";
import { uebernehmeIndexerhoehung } from "../../actions";

type Mieter = { anrede: "FRAU" | "HERR" | null; vorname: string; nachname: string };

const formatEuro = (v: number) => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
const formatDate = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
const formatDatumLokal = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
const zahl = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 3 });
const prozent = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monatLabel = (jahr: number, monat: number) => `${String(monat).padStart(2, "0")}/${jahr}`;
const isoDatum = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ausIso = (iso: string): Date | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
};

// Gleicher Browser-Speicher wie beim NK-Anpassungsschreiben (Absender steht nirgends in den Stammdaten).
const ABSENDER_KEY = "nk-schreiben-absender";

// Übernächster Monatserster: Die Miete ist laut Vertrag ab dem übernächsten Monat nach Zugang fällig.
const vorgeschlagenesGueltigAb = () => {
  const h = new Date();
  return new Date(h.getFullYear(), h.getMonth() + 2, 1);
};

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

export function IndexerhoehungSchreiben({
  mietvertragId, mieter, strasse, plzOrt, einheit, basisKaltmiete, basisNk, erhoehungen, mehrwertsteuer,
  jobcenter, zahlungsweg: zahlungswegVertrag, referenzDatum, referenzQuelle, basisVorbelegung, vpi,
}: {
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
  referenzDatum: Date;
  referenzQuelle: "letzte Mietanpassung" | "Mietbeginn";
  // Vorbelegter Basisindex-Monat: bei der letzten Erhöhung gespeichert, sonst der Referenzmonat selbst.
  basisVorbelegung: { jahr: number; monat: number; gespeichert: boolean } | null;
  vpi: { jahr: number; monat: number; wert: number }[];
}) {
  const key = (w: { jahr: number; monat: number }) => `${w.jahr}-${w.monat}`;
  const vorMonat = basisVorbelegung ?? { jahr: referenzDatum.getUTCFullYear(), monat: referenzDatum.getUTCMonth() + 1, gespeichert: false };
  const basisStandard = vpi.find((w) => w.jahr === vorMonat.jahr && w.monat === vorMonat.monat) ?? null;
  const neuesterStandard = vpi[vpi.length - 1];

  const [basisKey, setBasisKey] = useState(basisStandard ? key(basisStandard) : "");
  const [neuKey, setNeuKey] = useState(key(neuesterStandard));
  const [gueltigAbIso, setGueltigAbIso] = useState(() => isoDatum(vorgeschlagenesGueltigAb()));
  const [briefdatumIso, setBriefdatumIso] = useState(() => isoDatum(new Date()));
  const [absender, setAbsender] = useState("");
  const [anrede, setAnrede] = useState(() => briefAnrede(mieter));
  const [zahlungsweg, setZahlungsweg] = useState<"LASTSCHRIFT" | "UEBERWEISUNG">(zahlungswegVertrag ?? "LASTSCHRIFT");
  const [mieteEigen, setMieteEigen] = useState<string | null>(null);
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

  const basis = vpi.find((w) => key(w) === basisKey) ?? null;
  const neu = vpi.find((w) => key(w) === neuKey) ?? neuesterStandard;
  const gueltigAb = ausIso(gueltigAbIso);
  const briefdatum = ausIso(briefdatumIso) ?? new Date();

  const vertragStand = { kaltmiete: basisKaltmiete, nebenkostenVorauszahlung: basisNk, mieterhoehungen: erhoehungen };
  // Stand im Monat vor Wirksamwerden = bisherige Miete.
  const bisher = gueltigAb
    ? ermittleMieteFuerMonat(vertragStand, gueltigAb.getFullYear(), gueltigAb.getMonth())
    : ermittleMieteFuerMonat(vertragStand, new Date().getFullYear(), new Date().getMonth() + 1);

  const rechnerisch = basis ? neueIndexmiete(bisher.kaltmiete, basis.wert, neu.wert) : null;
  const neueKalt = mieteEigen !== null ? Math.max(0, Number(mieteEigen.replace(",", ".")) || 0) : rechnerisch;
  const aenderungProzent = basis ? (neu.wert / basis.wert - 1) * 100 : null;
  const erhoehungBetrag = neueKalt !== null ? Math.round((neueKalt - bisher.kaltmiete) * 100) / 100 : null;
  const gesamt = neueKalt !== null ? neueKalt + bisher.nebenkostenVorauszahlung + mehrwertsteuer : null;

  const fruehestens = new Date(Date.UTC(referenzDatum.getUTCFullYear() + 1, referenzDatum.getUTCMonth(), 1));
  const zuFrueh = gueltigAb !== null && gueltigAb < new Date(fruehestens.getUTCFullYear(), fruehestens.getUTCMonth(), 1);

  const [fehler, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const ergebnis = await runFormAction(uebernehmeIndexerhoehung.bind(null, mietvertragId), formData);
    setGespeichert(ergebnis === null);
    return ergebnis;
  }, null);

  const absenderZeilen = absender.split("\n").map((z) => z.trim()).filter(Boolean);
  const absenderName = absenderZeilen[0] ?? "";
  const absenderOrt = absenderZeilen.at(-1)?.replace(/^\d{5}\s*/, "") ?? "";
  const gueltigAbText = gueltigAb ? formatDatumLokal(gueltigAb) : "…";
  const bereit = basis !== null && neueKalt !== null && erhoehungBetrag !== null && gesamt !== null && aenderungProzent !== null;

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <p className="mb-3 text-xs text-neutral-500">
            Ausgangspunkt: {referenzQuelle} am {formatDate(referenzDatum)}. Vorbelegt ist als Basisindex{" "}
            {vorMonat.gespeichert ? "der bei der letzten Erhöhung zugrunde gelegte Index" : "der VPI des Monats selbst"}{" "}
            ({monatLabel(vorMonat.jahr, vorMonat.monat)}) und als neuer Index der neueste eingetragene Wert.
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
              {!basisStandard && (
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
            <DateInput label="Gültig ab" value={gueltigAbIso} onChange={setGueltigAbIso} labelClassName="text-xs text-neutral-400" />
            <DateInput label="Datum des Schreibens" value={briefdatumIso} onChange={setBriefdatumIso} labelClassName="text-xs text-neutral-400" />
            <div>
              <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-miete">Neue Kaltmiete (€)</label>
              <input
                id="ix-miete"
                inputMode="decimal"
                value={mieteEigen ?? (rechnerisch !== null ? String(rechnerisch) : "")}
                onChange={(e) => setMieteEigen(e.target.value)}
                className={eingabeKlasse}
              />
              {mieteEigen !== null && (
                <button type="button" onClick={() => setMieteEigen(null)} className="mt-1 text-xs text-neutral-400 hover:text-white">
                  auf Rechenwert zurücksetzen
                </button>
              )}
            </div>
          </div>
          {zuFrueh && (
            <p className="mt-3 text-xs text-amber-400">
              Die Miete muss mindestens ein Jahr unverändert geblieben sein (Erhöhungen nach §§ 559/560 BGB
              ausgenommen). Frühestens {formatDate(fruehestens)} — „Gültig ab“ liegt davor.
            </p>
          )}
          <p className="mt-3 text-xs text-neutral-500">
            „Gültig ab“ ist auf den übernächsten Monatsersten vorbelegt: Laut Vertrag ist die geänderte Miete ab
            dem übernächsten Monat nach Zugang der Erklärung zu zahlen.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-absender">
              Absender (Name, Straße, PLZ Ort — wird in diesem Browser gemerkt)
            </label>
            <textarea id="ix-absender" rows={3} value={absender} onChange={(e) => absenderAendern(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-anrede">
              Anrede{mieter.some((m) => m.anrede === null) && " (Frau/Herr beim Mieter nicht erfasst → neutral)"}
            </label>
            <input id="ix-anrede" value={anrede} onChange={(e) => setAnrede(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="ix-zahlweg">
              Zahlungsweg des Mieters{!zahlungswegVertrag && " (im Vertrag nicht erfasst)"}
            </label>
            <select id="ix-zahlweg" value={zahlungsweg} onChange={(e) => setZahlungsweg(e.target.value as "LASTSCHRIFT" | "UEBERWEISUNG")} className={eingabeKlasse}>
              <option value="LASTSCHRIFT">SEPA-Lastschrift</option>
              <option value="UEBERWEISUNG">Überweisung / Dauerauftrag</option>
            </select>
            {zahlungsweg === "LASTSCHRIFT" && (
              <p className="mt-1 text-xs text-neutral-500">
                Das Schreiben gilt als Vorabankündigung. Den neuen Betrag ab „Gültig ab“ auch im Lastschrifteinzug bei
                der Bank eintragen.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2 pt-2">
            <button type="button" onClick={() => window.print()} disabled={!bereit} className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50">
              Schreiben drucken / als PDF
            </button>
            <form action={formAction}>
              <input type="hidden" name="gueltigAb" value={gueltigAbIso} />
              <input type="hidden" name="kaltmiete" value={neueKalt ?? ""} />
              <input type="hidden" name="indexMonat" value={`${neu.jahr}-${String(neu.monat).padStart(2, "0")}`} />
              <input
                type="hidden"
                name="notizen"
                value={basis ? `Indexmiete § 557b BGB: VPI ${monatLabel(basis.jahr, basis.monat)} ${zahl(basis.wert)} → ${monatLabel(neu.jahr, neu.monat)} ${zahl(neu.wert)}` : ""}
              />
              <button type="submit" disabled={pending || !bereit || !gueltigAb} className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50">
                {pending ? "Speichern…" : neueKalt !== null ? `${formatEuro(neueKalt)} ab ${gueltigAbText} übernehmen` : "Übernehmen"}
              </button>
            </form>
          </div>
          {fehler && <p className="text-sm text-red-400">{fehler}</p>}
          {gespeichert && !fehler && <p className="text-sm text-green-400">Übernommen — steht als Mieterhöhung (NK-Vorauszahlung unverändert) im Vertrag.</p>}
          <p className="text-xs text-neutral-500">Erst übernehmen, wenn das Schreiben verschickt ist: Die Miete gilt dann im Soll ab „Gültig ab“.</p>
        </div>
      </div>

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-neutral-500">Vorschau</p>
      {!bereit ? (
        <p className="text-sm text-neutral-400">Bitte einen Basisindex wählen.</p>
      ) : (
        <div className="overflow-x-auto">
          <div className="druckbereich mx-auto w-[210mm] min-h-[297mm] bg-white px-[20mm] pb-[20mm] pt-[15mm] font-serif text-[11pt] leading-snug text-black shadow">
            <p className="mb-2 text-[8pt] text-neutral-600 underline">{absenderZeilen.join(" · ") || "Absender"}</p>
            <div className="flex items-start justify-between">
              <div className="mt-2 min-h-[40mm]">
                {mieter.map((m) => (<p key={mieterName(m)}>{empfaengerZeile(m)}</p>))}
                <p>{strasse}</p>
                <p>{plzOrt}</p>
              </div>
              <p className="mt-2">{absenderOrt ? `${absenderOrt}, ` : ""}{formatDatumLokal(briefdatum)}</p>
            </div>

            <p className="mb-6 mt-4 font-bold">
              Anpassung der Miete nach der vereinbarten Indexmiete (§ 557b BGB)
              <br />
              Mietobjekt: {strasse}, {plzOrt}, Wohnung {einheit}
            </p>

            <p className="mb-4">{anrede}</p>
            <p className="mb-4">
              in Ihrem Mietvertrag ist eine Indexmiete gemäß § 557b BGB vereinbart. Danach wird die Miete entsprechend
              und im selben Verhältnis wie die Entwicklung des Verbraucherpreisindexes für Deutschland angepasst.
              Ausgangspunkt ist der Preisindex zum Zeitpunkt {referenzQuelle === "Mietbeginn" ? "des Mietbeginns" : "der letzten Mietanpassung"} ({formatDate(referenzDatum)}). Ich erkläre
              hiermit in Textform die Anpassung der Miete wie folgt:
            </p>

            <table className="mb-4 w-full">
              <tbody>
                <tr>
                  <td className="py-0.5">Verbraucherpreisindex für Deutschland (2020 = 100), Ausgangswert {monatLabel(basis.jahr, basis.monat)}</td>
                  <td className="py-0.5 text-right">{zahl(basis.wert)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">Verbraucherpreisindex für Deutschland (2020 = 100), aktueller Wert {monatLabel(neu.jahr, neu.monat)}</td>
                  <td className="py-0.5 text-right">{zahl(neu.wert)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">Veränderung des Preisindexes</td>
                  <td className="py-0.5 text-right">{aenderungProzent >= 0 ? "+" : ""}{prozent(aenderungProzent)} %</td>
                </tr>
                <tr>
                  <td className="py-0.5">bisherige Nettokaltmiete</td>
                  <td className="py-0.5 text-right">{formatEuro(bisher.kaltmiete)}</td>
                </tr>
                <tr className="border-t border-black font-bold">
                  <td className="py-1">neue Nettokaltmiete ab {gueltigAbText}</td>
                  <td className="py-1 text-right">{formatEuro(neueKalt)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">Erhöhung der Nettokaltmiete</td>
                  <td className="py-0.5 text-right">{erhoehungBetrag >= 0 ? "+" : ""}{formatEuro(erhoehungBetrag)}</td>
                </tr>
              </tbody>
            </table>

            <p className="mb-4">Ab dem {gueltigAbText} setzt sich Ihre monatliche Miete damit wie folgt zusammen:</p>
            <table className="mb-4 w-2/3">
              <tbody>
                <tr><td className="py-0.5">Nettokaltmiete</td><td className="py-0.5 text-right">{formatEuro(neueKalt)}</td></tr>
                <tr><td className="py-0.5">Betriebskostenvorauszahlung (unverändert)</td><td className="py-0.5 text-right">{formatEuro(bisher.nebenkostenVorauszahlung)}</td></tr>
                {mehrwertsteuer > 0 && (<tr><td className="py-0.5">Mehrwertsteuer</td><td className="py-0.5 text-right">{formatEuro(mehrwertsteuer)}</td></tr>)}
                <tr className="border-t border-black font-bold"><td className="py-1">Gesamtmiete</td><td className="py-1 text-right">{formatEuro(gesamt)}</td></tr>
              </tbody>
            </table>

            <p className="mb-4">
              Die geänderte Miete ist mit Beginn des übernächsten Monats nach Zugang dieser Erklärung zu entrichten,
              das ist der {gueltigAbText}. Die Miete war zuvor seit dem {formatDate(referenzDatum)} unverändert.{" "}
              {zahlungsweg === "LASTSCHRIFT"
                ? `Den geänderten Betrag ziehe ich ab dem ${gueltigAbText} aufgrund des bestehenden SEPA-Lastschriftmandats von Ihrem Konto ein; Sie brauchen nichts weiter zu veranlassen. Dieses Schreiben gilt zugleich als Vorabankündigung (Pre-Notification) des geänderten Lastschriftbetrags.`
                : `Bitte zahlen Sie ab dem ${gueltigAbText} den neuen Betrag und passen Sie einen bestehenden Dauerauftrag entsprechend an.`}
              {jobcenter && " Wird Ihre Miete vom Jobcenter gezahlt, leiten Sie dieses Schreiben bitte dorthin weiter."}
            </p>
            <p className="mb-4">Für Rückfragen stehe ich Ihnen gern zur Verfügung.</p>
            <p className="mb-12">Mit freundlichen Grüßen</p>
            <p>{absenderName}</p>
          </div>
        </div>
      )}
    </div>
  );
}
