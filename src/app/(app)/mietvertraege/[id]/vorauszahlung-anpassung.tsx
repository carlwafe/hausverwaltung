"use client";

import { useActionState, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { runFormAction } from "@/lib/form-utils";
import { ermittleMieteFuerMonat, type MietvertragFuerSollIst } from "@/lib/soll-ist";
import { schlageVorauszahlungVor, vorgeschlagenesGueltigAb } from "@/lib/vorauszahlung-vorschlag";
import { passeNkVorauszahlungAn } from "../actions";
import { mieterName } from "@/lib/mieter-name";
import { SchreibenAblegen, type SchreibenKopie } from "@/components/schreiben-ablegen";
import { MandatKlammer, mandatTeile, type MandatDaten } from "@/components/mandat-klammer";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
}
function monatJahr(d: Date) {
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(d);
}
function isoDatum(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function ausIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

// Absender wird nur im Browser gemerkt (steht nirgends in den Stammdaten) — reine Bequemlichkeit.
const ABSENDER_KEY = "nk-schreiben-absender";

// Standard-Zuschlag auf die rechnerische Vorauszahlung (Entscheidung des Eigentümers) — je Schreiben
// änderbar, 0 = kein Zuschlag. Rechtlich angreifbar, siehe Hinweis in vorauszahlung-vorschlag.ts.
const STANDARD_ZUSCHLAG_PROZENT = "3";
const STANDARD_ZUSCHLAG_GRUND = "allgemein steigende Energie- und Betriebskosten";

export type VorauszahlungBriefDaten = {
  mietvertragId: string;
  mieter: { anrede: "FRAU" | "HERR" | null; vorname: string; nachname: string }[];
  strasse: string;
  plzOrt: string;
  einheit: string;
  vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">;
  mehrwertsteuer: number;
  // Mindestens ein Mieter bezieht Bürgergeld → Hinweis, das Schreiben ans Jobcenter weiterzuleiten.
  jobcenter: boolean;
  // Aus dem Mietvertrag; null = nicht erfasst → Lastschrift vorbelegt (zahlen die meisten).
  zahlungsweg: "LASTSCHRIFT" | "UEBERWEISUNG" | null;
  // Mandatsreferenz/Gläubiger-ID aus der Bankzeile der letzten Lastschrift (null = keine gefunden).
  mandat: MandatDaten | null;
  // Bereits abgelegte Kopien versandter Schreiben (Dokumente der Art „Schreiben“ dieses Vertrags).
  kopien: SchreibenKopie[];
};

// "Sehr geehrte Frau Muster, sehr geehrter Herr Muster," — fehlt bei einem Mieter die Anrede, für
// alle neutral mit vollem Namen ("Guten Tag Anna Muster und Ben Muster,"), statt die Formen zu mischen.
function briefAnrede(mieter: VorauszahlungBriefDaten["mieter"]): string {
  if (mieter.length === 0) return "Sehr geehrte Damen und Herren,";
  if (mieter.every((m) => m.anrede !== null)) {
    const teile = mieter.map((m) => (m.anrede === "FRAU" ? `sehr geehrte Frau ${m.nachname}` : `sehr geehrter Herr ${m.nachname}`));
    const text = teile.join(", ") + ",";
    return text.charAt(0).toUpperCase() + text.slice(1);
  }
  return `Guten Tag ${mieter.map((m) => mieterName(m)).join(" und ")},`;
}

function empfaengerZeile(m: VorauszahlungBriefDaten["mieter"][number]): string {
  const titel = m.anrede === "FRAU" ? "Frau " : m.anrede === "HERR" ? "Herrn " : "";
  return `${titel}${mieterName(m)}`;
}

const eingabeKlasse =
  "w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400";

/**
 * Schlägt nach einer Nebenkostenabrechnung die neue monatliche Vorauszahlung vor (Kostenanteil auf
 * ein Jahr hochgerechnet ÷ 12, aufgerundet auf volle Euro), bereitet das Anpassungsschreiben an den
 * Mieter nach § 560 Abs. 4 BGB zum Drucken vor und übernimmt den Betrag auf Wunsch als
 * Mieterhöhung (Kaltmiete unverändert).
 */
export function VorauszahlungAnpassung({
  jahr,
  zeitraumVon,
  zeitraumBis,
  kostenanteilGesamt,
  anteileJahr,
  brief,
}: {
  jahr: number;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  anteileJahr: number[];
  brief: VorauszahlungBriefDaten;
}) {
  const [gueltigAbIso, setGueltigAbIso] = useState(() => isoDatum(vorgeschlagenesGueltigAb()));
  const [briefdatumIso, setBriefdatumIso] = useState(() => isoDatum(new Date()));
  const [zuschlag, setZuschlag] = useState(STANDARD_ZUSCHLAG_PROZENT);
  const [zuschlagGrund, setZuschlagGrund] = useState(STANDARD_ZUSCHLAG_GRUND);
  const [absender, setAbsender] = useState("");
  const [anrede, setAnrede] = useState(() => briefAnrede(brief.mieter));
  const [zahlungsweg, setZahlungsweg] = useState<"LASTSCHRIFT" | "UEBERWEISUNG">(brief.zahlungsweg ?? "LASTSCHRIFT");
  const [betragEigen, setBetragEigen] = useState<string | null>(null);
  const [gespeichert, setGespeichert] = useState(false);

  useEffect(() => {
    try {
      const gemerkt = window.localStorage.getItem(ABSENDER_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- einmalig aus dem Browser-Speicher laden
      if (gemerkt) setAbsender(gemerkt);
    } catch {
      // Speicher nicht verfügbar (privates Fenster o.ä.) — dann eben leer.
    }
  }, []);
  const absenderAendern = (wert: string) => {
    setAbsender(wert);
    try {
      window.localStorage.setItem(ABSENDER_KEY, wert);
    } catch {}
  };

  const gueltigAb = ausIso(gueltigAbIso);
  const briefdatum = ausIso(briefdatumIso) ?? new Date();
  // Bisheriger Stand = was im Monat vor dem Wirksamwerden gilt; Kaltmiete = was ab dann gilt.
  const bisher = gueltigAb
    ? ermittleMieteFuerMonat(brief.vertrag, gueltigAb.getFullYear(), gueltigAb.getMonth())
    : ermittleMieteFuerMonat(brief.vertrag, new Date().getFullYear(), new Date().getMonth() + 1);
  const kaltmieteAb = gueltigAb
    ? ermittleMieteFuerMonat(brief.vertrag, gueltigAb.getFullYear(), gueltigAb.getMonth() + 1).kaltmiete
    : bisher.kaltmiete;

  const zuschlagProzent = Math.max(0, Number(zuschlag.replace(",", ".")) || 0);
  const vorschlag = schlageVorauszahlungVor({
    jahr,
    zeitraumVon,
    zeitraumBis,
    kostenanteilGesamt,
    anteileJahr,
    aktuelleVorauszahlung: bisher.nebenkostenVorauszahlung,
    zuschlagProzent,
  });
  const neuerBetrag = betragEigen !== null ? Math.max(0, Number(betragEigen.replace(",", ".")) || 0) : vorschlag.vorschlag;
  const differenz = Math.round((neuerBetrag - bisher.nebenkostenVorauszahlung) * 100) / 100;

  const [fehler, formAction, pending] = useActionState(async (_prev: string | null, formData: FormData) => {
    const ergebnis = await runFormAction(passeNkVorauszahlungAn.bind(null, brief.mietvertragId), formData);
    setGespeichert(ergebnis === null);
    return ergebnis;
  }, null);

  const absenderZeilen = absender.split("\n").map((z) => z.trim()).filter(Boolean);
  const absenderName = absenderZeilen[0] ?? "";
  const absenderOrt = absenderZeilen.at(-1)?.replace(/^\d{5}\s*/, "") ?? "";
  const gesamt = kaltmieteAb + neuerBetrag + brief.mehrwertsteuer;
  const mandatAngaben = mandatTeile(brief.mandat);

  return (
    <div className="mt-6 rounded-lg border border-neutral-800 p-4">
      <h3 className="mb-3 text-sm font-medium text-white">Vorauszahlung anpassen &amp; Schreiben an den Mieter</h3>

      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          <table className="w-full text-sm">
            <tbody>
              <tr>
                <td className="py-1 pr-4 text-neutral-400">Kostenanteil {jahr}</td>
                <td className="py-1 text-right text-white">{formatEuro(kostenanteilGesamt)}</td>
              </tr>
              {vorschlag.hochgerechnet && (
                <tr>
                  <td className="py-1 pr-4 text-neutral-400">hochgerechnet auf 12 Monate</td>
                  <td className="py-1 text-right text-white">{formatEuro(vorschlag.jahreskosten)}</td>
                </tr>
              )}
              <tr>
                <td className="py-1 pr-4 text-neutral-400">rechnerisch monatlich (÷ 12)</td>
                <td className="py-1 text-right text-white">{formatEuro(vorschlag.rechnerischMonatlich)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-neutral-400">bisherige Vorauszahlung (mtl.)</td>
                <td className="py-1 text-right text-white">{formatEuro(bisher.nebenkostenVorauszahlung)}</td>
              </tr>
              <tr className="border-t border-neutral-700 font-medium">
                <td className="py-1.5 pr-4 text-white">Vorschlag{zuschlagProzent > 0 && ` (inkl. ${String(zuschlagProzent).replace(".", ",")} % Zuschlag)`}, aufgerundet</td>
                <td className="py-1.5 text-right text-white">{formatEuro(vorschlag.vorschlag)}</td>
              </tr>
            </tbody>
          </table>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-neu">
                Neue Vorauszahlung (mtl., €)
              </label>
              <input
                id="nk-neu"
                inputMode="decimal"
                value={betragEigen ?? String(vorschlag.vorschlag)}
                onChange={(e) => setBetragEigen(e.target.value)}
                className={eingabeKlasse}
              />
              {betragEigen !== null && (
                <button type="button" onClick={() => setBetragEigen(null)} className="mt-1 text-xs text-neutral-400 hover:text-white">
                  auf Vorschlag zurücksetzen
                </button>
              )}
            </div>
            <div>
              <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-zuschlag">
                Zuschlag (%)
              </label>
              <input
                id="nk-zuschlag"
                inputMode="decimal"
                value={zuschlag}
                onChange={(e) => setZuschlag(e.target.value)}
                className={eingabeKlasse}
              />
            </div>
            <DateInput label="Gültig ab" value={gueltigAbIso} onChange={setGueltigAbIso} labelClassName="text-xs text-neutral-400" />
            <DateInput label="Datum des Schreibens" value={briefdatumIso} onChange={setBriefdatumIso} labelClassName="text-xs text-neutral-400" />
          </div>
          {zuschlagProzent > 0 && (
            <div className="mt-3">
              <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-zuschlag-grund">
                Begründung des Zuschlags (erscheint im Schreiben)
              </label>
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
          <p className="mt-3 text-xs text-neutral-500">
            „Gültig ab“ ist auf den übernächsten Monatsersten vorbelegt, damit das Schreiben sicher vor der nächsten
            Fälligkeit zugeht.
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-absender">
              Absender (Name, Straße, PLZ Ort — wird in diesem Browser gemerkt)
            </label>
            <textarea
              id="nk-absender"
              rows={3}
              value={absender}
              onChange={(e) => absenderAendern(e.target.value)}
              className={eingabeKlasse}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-anrede">
              Anrede
              {brief.mieter.some((m) => m.anrede === null) && " (Frau/Herr beim Mieter nicht erfasst → neutral)"}
            </label>
            <input id="nk-anrede" value={anrede} onChange={(e) => setAnrede(e.target.value)} className={eingabeKlasse} />
          </div>
          <div>
            <label className="mb-1 block text-xs text-neutral-400" htmlFor="nk-zahlungsweg">
              Zahlungsweg des Mieters
              {!brief.zahlungsweg && " (im Vertrag nicht erfasst)"}
            </label>
            <select
              id="nk-zahlungsweg"
              value={zahlungsweg}
              onChange={(e) => setZahlungsweg(e.target.value as "LASTSCHRIFT" | "UEBERWEISUNG")}
              className={eingabeKlasse}
            >
              <option value="LASTSCHRIFT">SEPA-Lastschrift</option>
              <option value="UEBERWEISUNG">Überweisung / Dauerauftrag</option>
            </select>
            {zahlungsweg === "LASTSCHRIFT" && (
              <p className="mt-1 text-xs text-neutral-500">
                Das Schreiben gilt als Vorabankündigung. Nach der Übernahme den neuen Betrag ab „Gültig ab“ auch im
                Lastschrifteinzug bei der Bank eintragen.{" "}
                {mandatAngaben.length > 0
                  ? `Aus der letzten Lastschrift im Journal ins Schreiben übernommen: ${mandatAngaben.join(", ")}.`
                  : "Im Journal wurde keine Mandatsreferenz gefunden — Mandatsreferenz und Gläubiger-ID fehlen im Schreiben."}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200"
            >
              Schreiben drucken / als PDF
            </button>
            <form action={formAction}>
              <input type="hidden" name="gueltigAb" value={gueltigAbIso} />
              <input type="hidden" name="nebenkostenVorauszahlung" value={neuerBetrag} />
              <input type="hidden" name="notizen" value={`NK-Vorauszahlung angepasst nach Abrechnung ${jahr} (§ 560 Abs. 4 BGB)`} />
              <button
                type="submit"
                disabled={pending || !gueltigAb}
                className="rounded-md border border-neutral-700 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
              >
                {pending ? "Speichern…" : `${formatEuro(neuerBetrag)} ab ${gueltigAb ? formatDate(gueltigAb) : "…"} übernehmen`}
              </button>
            </form>
          </div>
          {fehler && <p className="text-sm text-red-400">{fehler}</p>}
          {gespeichert && !fehler && (
            <p className="text-sm text-green-400">Übernommen — steht als Mieterhöhung (Kaltmiete unverändert) im Vertrag.</p>
          )}
          <SchreibenAblegen
            mietvertragId={brief.mietvertragId}
            revalidatePath={`/mietvertraege/${brief.mietvertragId}`}
            belegDatumIso={briefdatumIso}
            kopien={brief.kopien}
          />
        </div>
      </div>

      <p className="mb-2 mt-6 text-xs uppercase tracking-wide text-neutral-500">Vorschau</p>
      <div className="overflow-x-auto">
        <div className="druckbereich mx-auto w-[210mm] min-h-[297mm] bg-white px-[20mm] pb-[20mm] pt-[15mm] font-serif text-[11pt] leading-snug text-black shadow">
          <p className="mb-2 text-[8pt] text-neutral-600 underline">{absenderZeilen.join(" · ") || "Absender"}</p>
          <div className="flex items-start justify-between">
            <div className="mt-2 min-h-[40mm]">
              {brief.mieter.map((m) => (
                <p key={mieterName(m)}>{empfaengerZeile(m)}</p>
              ))}
              <p>{brief.strasse}</p>
              <p>{brief.plzOrt}</p>
            </div>
            <p className="mt-2">
              {absenderOrt ? `${absenderOrt}, ` : ""}
              {formatDate(briefdatum)}
            </p>
          </div>

          <p className="mb-6 mt-4 font-bold">
            Anpassung der Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB
            <br />
            Mietobjekt: {brief.strasse}, {brief.plzOrt}, Wohnung {brief.einheit}
          </p>

          <p className="mb-4">{anrede}</p>
          <p className="mb-4">
            auf Grundlage der Betriebskostenabrechnung für den Abrechnungszeitraum 01.01.{jahr} bis 31.12.{jahr}{" "}
            {Math.abs(differenz) < 0.005
              ? "bleibt Ihre monatliche Betriebskostenvorauszahlung unverändert."
              : "passe ich Ihre monatliche Betriebskostenvorauszahlung gemäß § 560 Abs. 4 BGB wie folgt an:"}
          </p>

          <table className="mb-4 w-full">
            <tbody>
              <tr>
                <td className="py-0.5">
                  Ihr Anteil an den Betriebskosten {jahr}
                  {vorschlag.hochgerechnet && ` (Nutzung ${formatDate(zeitraumVon)} – ${formatDate(zeitraumBis)})`}
                </td>
                <td className="py-0.5 text-right">{formatEuro(kostenanteilGesamt)}</td>
              </tr>
              {vorschlag.hochgerechnet && (
                <tr>
                  <td className="py-0.5">hochgerechnet auf zwölf Monate</td>
                  <td className="py-0.5 text-right">{formatEuro(vorschlag.jahreskosten)}</td>
                </tr>
              )}
              <tr>
                <td className="py-0.5">davon monatlich (÷ 12)</td>
                <td className="py-0.5 text-right">{formatEuro(vorschlag.rechnerischMonatlich)}</td>
              </tr>
              {zuschlagProzent > 0 && (
                <tr>
                  <td className="py-0.5">
                    zzgl. {String(zuschlagProzent).replace(".", ",")} % Zuschlag
                    {zuschlagGrund && ` (${zuschlagGrund})`}
                  </td>
                  <td className="py-0.5 text-right">
                    {formatEuro(Math.round(vorschlag.rechnerischMonatlich * zuschlagProzent) / 100)}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-0.5">bisherige monatliche Vorauszahlung</td>
                <td className="py-0.5 text-right">{formatEuro(bisher.nebenkostenVorauszahlung)}</td>
              </tr>
              <tr className="border-t border-black font-bold">
                <td className="py-1">neue monatliche Vorauszahlung{gueltigAb ? ` ab ${formatDate(gueltigAb)}` : ""}</td>
                <td className="py-1 text-right">{formatEuro(neuerBetrag)}</td>
              </tr>
            </tbody>
          </table>

          {Math.abs(differenz) >= 0.005 && (
            <p className="mb-4">
              Die Vorauszahlung {differenz > 0 ? "erhöht" : "verringert"} sich damit um {formatEuro(Math.abs(differenz))}{" "}
              monatlich. Ab dem {gueltigAb ? formatDate(gueltigAb) : "…"} setzt sich Ihre monatliche Miete wie folgt
              zusammen:
            </p>
          )}
          {Math.abs(differenz) >= 0.005 && (
            <table className="mb-4 w-2/3">
              <tbody>
                <tr>
                  <td className="py-0.5">Nettokaltmiete</td>
                  <td className="py-0.5 text-right">{formatEuro(kaltmieteAb)}</td>
                </tr>
                <tr>
                  <td className="py-0.5">Betriebskostenvorauszahlung</td>
                  <td className="py-0.5 text-right">{formatEuro(neuerBetrag)}</td>
                </tr>
                {brief.mehrwertsteuer > 0 && (
                  <tr>
                    <td className="py-0.5">Mehrwertsteuer</td>
                    <td className="py-0.5 text-right">{formatEuro(brief.mehrwertsteuer)}</td>
                  </tr>
                )}
                <tr className="border-t border-black font-bold">
                  <td className="py-1">Gesamtmiete</td>
                  <td className="py-1 text-right">{formatEuro(gesamt)}</td>
                </tr>
              </tbody>
            </table>
          )}
          {Math.abs(differenz) >= 0.005 && (
            <p className="mb-4">
              {zahlungsweg === "LASTSCHRIFT" ? (
                <>
                  Die Gesamtmiete von {formatEuro(gesamt)} ziehe ich erstmals mit der Lastschrift für{" "}
                  {gueltigAb ? monatJahr(gueltigAb) : "…"} aufgrund des bestehenden SEPA-Lastschriftmandats
                  <MandatKlammer mandat={brief.mandat} /> von Ihrem Konto ein; Sie brauchen nichts weiter zu veranlassen.
                  Dieses Schreiben gilt zugleich als Vorabankündigung (Pre-Notification) des geänderten
                  Lastschriftbetrags.
                </>
              ) : (
                `Bitte zahlen Sie ab dem ${gueltigAb ? formatDate(gueltigAb) : "…"} die neue Gesamtmiete von ${formatEuro(gesamt)} und passen Sie einen bestehenden Dauerauftrag entsprechend an.`
              )}
              {brief.jobcenter && " Wird Ihre Miete vom Jobcenter gezahlt, leiten Sie dieses Schreiben bitte dorthin weiter."}
            </p>
          )}
          <p className="mb-4">Für Rückfragen stehe ich Ihnen gern zur Verfügung.</p>
          <p className="mb-12">Mit freundlichen Grüßen</p>
          <p>{absenderName}</p>
        </div>
      </div>
    </div>
  );
}
