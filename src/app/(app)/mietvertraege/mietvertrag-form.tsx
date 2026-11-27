"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { runFormAction, type FormAktion } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { holeMandatAusKontoauszug } from "./actions";
import { MAX_MIETVERTRAG_NOTIZ } from "@/lib/mietvertrag-notiz";
import { ZAHLUNGSWEG_LABEL, type ZahlungswegArt } from "@/lib/zahlungsweg-anzeige";

type Option = { id: string; label: string };
type EinheitOption = Option & { typ: "WOHNUNG" | "GARAGE" };

type Initial = {
  einheitId: string;
  mieterId1: string;
  mieterId2?: string;
  beginn: string;
  beginnUnbekannt?: boolean;
  ende: string;
  kaltmiete: string;
  nebenkostenVorauszahlung: string;
  mehrwertsteuer?: string;
  status: string;
  kautionBetrag?: string;
  kautionAnlageform?: string;
  kautionEinzahlungUnbekannt?: boolean;
  saldovortrag?: string;
  // Eigener Buchhaltungs-Stichtag (yyyy-mm-dd), leer = der des Objekts.
  buchhaltungAb?: string;
  zahlungsweg?: string;
  // SEPA-Lastschriftmandat (alle optional); Datum yyyy-mm-dd.
  mandatReferenz?: string;
  mandatGlaeubigerId?: string;
  mandatDatum?: string;
  mandatKontoinhaber?: string;
  mandatIban?: string;
  notiz?: string;
};

// Einheitliche Höhe für Eingabefelder und Auswahllisten (wie DateInput und MietvertragAuswahl, h-10).
const FELD = "h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400";

// yyyy-mm-dd → dd.mm.yyyy für Hinweistexte.
const deutschesDatum = (iso: string) => iso.split("-").reverse().join(".");

export function MietvertragForm({
  einheiten,
  mieter,
  initial,
  objektStichtag = "",
  zahlungswegVorschlag = "",
  mietvertragId,
  abbrechenHref,
  action,
}: {
  einheiten: EinheitOption[];
  mieter: Option[];
  initial?: Initial;
  // Buchhaltungs-Stichtag des Objekts (yyyy-mm-dd), "" = keiner gesetzt.
  objektStichtag?: string;
  // Zahlungsweg, den die Ableitung aus den Kontoauszugs-Zeilen vorschlägt ("" = nicht eindeutig).
  zahlungswegVorschlag?: string;
  // Nur beim Bearbeiten: für den Knopf „Mandat aus Kontoauszug übernehmen“.
  mietvertragId?: string;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
  action: FormAktion;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [einheitId, setEinheitId] = useState(initial?.einheitId ?? "");
  const istGarage = einheiten.find((e) => e.id === einheitId)?.typ === "GARAGE";
  const [mieterId1, setMieterId1] = useState(initial?.mieterId1 ?? "");
  const [mieterId2, setMieterId2] = useState(initial?.mieterId2 ?? "");
  const [beginnUnbekannt, setBeginnUnbekannt] = useState(initial?.beginnUnbekannt ?? false);
  // Als React State statt unkontrolliert per defaultValue geführt: React 19 setzt ein <form
  // action={...}> nach jeder Aktion (auch nach einem fehlgeschlagenen Speichern-Versuch mit
  // Fehlermeldung) automatisch auf seine Ursprungswerte zurück — bei unkontrollierten Feldern
  // wären damit nach einem Fehler alle bereits eingetragenen Werte weg. Kontrollierte Felder
  // "heilen" sich beim nächsten Render (ausgelöst durch die Fehlermeldung) selbst wieder, da ihr
  // Wert aus dem (unverändert gebliebenen) State neu gesetzt wird.
  const [kaltmiete, setKaltmiete] = useState(initial?.kaltmiete ?? "");
  const [nebenkostenVorauszahlung, setNebenkostenVorauszahlung] = useState(
    initial?.nebenkostenVorauszahlung ?? "",
  );
  const [mehrwertsteuer, setMehrwertsteuer] = useState(initial?.mehrwertsteuer ?? "");
  const [status, setStatus] = useState(initial?.status ?? "AKTIV");
  const [kautionBetrag, setKautionBetrag] = useState(initial?.kautionBetrag ?? "");
  const [kautionAnlageform, setKautionAnlageform] = useState(initial?.kautionAnlageform ?? "KAUTIONSKONTO");
  const [kautionEinzahlungUnbekannt, setKautionEinzahlungUnbekannt] = useState(
    initial?.kautionEinzahlungUnbekannt ?? false,
  );
  const [saldovortrag, setSaldovortrag] = useState(initial?.saldovortrag ?? "0");
  const [buchhaltungAb, setBuchhaltungAb] = useState(initial?.buchhaltungAb ?? "");
  const [zahlungsweg, setZahlungsweg] = useState(initial?.zahlungsweg ?? "");
  const [mandatReferenz, setMandatReferenz] = useState(initial?.mandatReferenz ?? "");
  const [mandatGlaeubigerId, setMandatGlaeubigerId] = useState(initial?.mandatGlaeubigerId ?? "");
  const [mandatDatum, setMandatDatum] = useState(initial?.mandatDatum ?? "");
  const [mandatKontoinhaber, setMandatKontoinhaber] = useState(initial?.mandatKontoinhaber ?? "");
  const [mandatIban, setMandatIban] = useState(initial?.mandatIban ?? "");
  const [notiz, setNotiz] = useState(initial?.notiz ?? "");
  const [mandatLaedt, setMandatLaedt] = useState(false);
  const [mandatMeldung, setMandatMeldung] = useState<{ text: string; fehler: boolean } | null>(null);
  // Mandatsfelder nur bei Lastschrift oder wenn schon etwas erfasst ist.
  const zeigeMandat =
    zahlungsweg === "LASTSCHRIFT" || [mandatReferenz, mandatGlaeubigerId, mandatDatum, mandatKontoinhaber, mandatIban].some((w) => w !== "");

  async function mandatAusKontoauszug() {
    if (!mietvertragId) return;
    setMandatLaedt(true);
    setMandatMeldung(null);
    try {
      const m = await holeMandatAusKontoauszug(mietvertragId);
      if (typeof m === "string") {
        setMandatMeldung({ text: m, fehler: true });
      } else if (!m) {
        setMandatMeldung({
          text: "Kein Lastschrift-Einzug mit Mandat im Kontoauszug gefunden — erst nach dem ersten importierten Einzug möglich.",
          fehler: true,
        });
      } else {
        const abweichend = [
          [mandatReferenz, m.referenz],
          [mandatGlaeubigerId, m.glaeubigerId],
          [mandatKontoinhaber, m.kontoinhaber],
          [mandatIban.replace(/\s+/g, "").toUpperCase(), m.iban],
        ].some(([alt, neu]) => alt && neu && alt !== neu);
        if (abweichend && !window.confirm("Die bereits eingetragenen Mandatsangaben weichen vom Kontoauszug ab. Mit den Werten aus dem Kontoauszug überschreiben?")) {
          return;
        }
        if (m.referenz) setMandatReferenz(m.referenz);
        if (m.glaeubigerId) setMandatGlaeubigerId(m.glaeubigerId);
        if (m.kontoinhaber) setMandatKontoinhaber(m.kontoinhaber);
        if (m.iban) setMandatIban(m.iban);
        setMandatMeldung({
          text: `Aus dem Einzug vom ${deutschesDatum(m.einzugAm)} übernommen — zum Festhalten unten speichern. Das Unterschriftsdatum bleibt unverändert.`,
          fehler: false,
        });
      }
    } catch {
      setMandatMeldung({ text: "Der Kontoauszug konnte nicht gelesen werden. Bitte erneut versuchen.", fehler: true });
    } finally {
      setMandatLaedt(false);
    }
  }

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Abschnitt titel="Vertrag">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="einheitId">
                Einheit
              </label>
              <select
                id="einheitId"
                name="einheitId"
                required
                value={einheitId}
                onChange={(e) => setEinheitId(e.target.value)}
                className={FELD}
              >
                <option value="" disabled>
                  Bitte wählen…
                </option>
                {einheiten.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="mieterId1">
                  Mieter
                </label>
                <input type="hidden" id="mieterId1" name="mieterId1" value={mieterId1} required />
                <MietvertragAuswahl
                  kandidaten={mieter}
                  value={mieterId1}
                  onChange={setMieterId1}
                  leerLabel="Bitte wählen…"
                  size="md"
                />
              </div>
              <div className="min-w-0">
                <label className="mb-1 block text-sm font-medium" htmlFor="mieterId2">
                  2. Mieter (optional)
                </label>
                <input type="hidden" id="mieterId2" name="mieterId2" value={mieterId2} />
                <MietvertragAuswahl
                  kandidaten={mieter}
                  value={mieterId2}
                  onChange={setMieterId2}
                  leerLabel="– keiner –"
                  size="md"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="mb-1 flex items-end justify-between gap-2">
                  <span className="text-sm font-medium">Mietbeginn</span>
                  <label className="flex items-center gap-1 text-xs font-normal text-neutral-400">
                    <input
                      type="checkbox"
                      checked={beginnUnbekannt}
                      onChange={(e) => setBeginnUnbekannt(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-neutral-700 bg-transparent"
                    />
                    unbekannt
                  </label>
                </div>
                {beginnUnbekannt ? (
                  <div className="flex h-10 items-center rounded-md border border-neutral-800 px-3 text-sm text-neutral-500">
                    unbekannt
                  </div>
                ) : (
                  <DateInput id="beginn" name="beginn" defaultValue={initial?.beginn} />
                )}
                <input type="hidden" name="beginnUnbekannt" value={beginnUnbekannt ? "on" : ""} />
              </div>
              <div>
                <DateInput id="ende" name="ende" label="Mietende" defaultValue={initial?.ende} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="status">
                  Status
                </label>
                <select id="status" name="status" value={status} onChange={(e) => setStatus(e.target.value)} className={FELD}>
                  <option value="AKTIV">Aktiv</option>
                  <option value="GEPLANT">Geplant</option>
                  <option value="BEENDET">Beendet</option>
                </select>
              </div>
              <p className="self-end pb-2.5 text-xs text-neutral-400">
                {status === "BEENDET"
                  ? "Bei „Beendet“ ist das Mietende erforderlich."
                  : "Nach dem Mietende stellt die App den Vertrag von selbst auf „Beendet“, ab dem Mietbeginn von „Geplant“ auf „Aktiv“."}
              </p>
            </div>
          </Abschnitt>

          <Abschnitt titel="Miete">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="kaltmiete">
                  Kaltmiete (€)
                </label>
                <input
                  id="kaltmiete"
                  name="kaltmiete"
                  type="number"
                  step="0.01"
                  required
                  value={kaltmiete}
                  onChange={(e) => setKaltmiete(e.target.value)}
                  className={FELD}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="nebenkostenVorauszahlung">
                  BK-Vorauszahlung (€)
                </label>
                <input
                  id="nebenkostenVorauszahlung"
                  name="nebenkostenVorauszahlung"
                  type="number"
                  step="0.01"
                  required={!istGarage}
                  value={nebenkostenVorauszahlung}
                  onChange={(e) => setNebenkostenVorauszahlung(e.target.value)}
                  className={FELD}
                />
              </div>
            </div>
            <p className="text-xs text-neutral-400">
              Die aktuelle Miete ergibt sich aus diesen Ausgangswerten und den Mieterhöhungen weiter unten.
            </p>

            {istGarage && (
              <div className="space-y-2 border-t border-neutral-800 pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium" htmlFor="mehrwertsteuer">
                      Mehrwertsteuer (€)
                    </label>
                    <input
                      id="mehrwertsteuer"
                      name="mehrwertsteuer"
                      type="number"
                      step="0.01"
                      required
                      value={mehrwertsteuer}
                      onChange={(e) => setMehrwertsteuer(e.target.value)}
                      className={FELD}
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-400">
                  Die Vermieterin ist Kleinunternehmerin (§ 19 UStG): Garagen ohne Umsatzsteuer, also 0 €.
                  {mehrwertsteuer !== "0" && (
                    <>
                      {" "}
                      <button type="button" onClick={() => setMehrwertsteuer("0")} className="underline hover:text-white">
                        0 € eintragen
                      </button>
                    </>
                  )}
                </p>
                <p className="text-xs text-neutral-400">
                  Neue Garagenverträge: Pauschalmiete mit Betriebskosten als Kaltmiete eintragen, BK-Vorauszahlung leer
                  lassen (es wird nicht abgerechnet).
                </p>
              </div>
            )}
          </Abschnitt>

          <Abschnitt titel="Kaution (optional)">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="kautionBetrag">
                  Betrag (€)
                </label>
                <input
                  id="kautionBetrag"
                  name="kautionBetrag"
                  type="number"
                  step="0.01"
                  value={kautionBetrag}
                  onChange={(e) => setKautionBetrag(e.target.value)}
                  className={FELD}
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="kautionAnlageform">
                  Anlageform
                </label>
                <select
                  id="kautionAnlageform"
                  name="kautionAnlageform"
                  value={kautionAnlageform}
                  onChange={(e) => setKautionAnlageform(e.target.value)}
                  className={FELD}
                >
                  <option value="KAUTIONSKONTO">Kautionskonto</option>
                  <option value="SPARBUCH">Sparbuch</option>
                  <option value="BUERGSCHAFT">Bürgschaft</option>
                  <option value="BAR">Bar</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-neutral-400">
              Ursprünglich eingezahlte Kaution, nicht der Auflösungsbetrag (Zinsen ergibt die App aus der Auflösung).
              Feld leeren entfernt die Kaution (nur ohne erfasste Einbehalte).
            </p>
            <div>
              <label className="flex items-center gap-2 text-sm text-neutral-300">
                <input
                  type="checkbox"
                  name="kautionEinzahlungUnbekannt"
                  checked={kautionEinzahlungUnbekannt}
                  onChange={(e) => setKautionEinzahlungUnbekannt(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-neutral-700 bg-transparent"
                />
                Vor Buchhaltungsbeginn eingezahlt (Datum unbekannt, keine Buchung)
              </label>
              <p className="ml-5 mt-1 text-xs text-neutral-500">
                Wirkt nur, solange keine Einzahlung gebucht ist. Liegt nur ein Teil davor, diesen Teil auf /kautionen
                als Einzahlung buchen.
              </p>
            </div>
          </Abschnitt>

          <Abschnitt titel="Notiz (optional)">
            <textarea
              id="notiz"
              name="notiz"
              aria-label="Notiz"
              value={notiz}
              onChange={(e) => setNotiz(e.target.value)}
              rows={3}
              maxLength={MAX_MIETVERTRAG_NOTIZ}
              className="w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
            <p className="text-xs text-neutral-400">
              Interner Freitext, z.B. weitere Bewohner. Erscheint in den Vertragsdaten, ändert keine Beträge.
            </p>
          </Abschnitt>
        </div>

        <div className="space-y-6">
          <Abschnitt titel="Zahlungsweg">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-sm font-medium" htmlFor="zahlungsweg">
                  Zahlungsweg
                </label>
                <select
                  id="zahlungsweg"
                  name="zahlungsweg"
                  value={zahlungsweg}
                  onChange={(e) => setZahlungsweg(e.target.value)}
                  className={FELD}
                >
                  <option value="">– nicht erfasst –</option>
                  <option value="LASTSCHRIFT">SEPA-Lastschrift</option>
                  <option value="UEBERWEISUNG">Überweisung / Dauerauftrag</option>
                  <option value="BEHOERDE">Amt zahlt (Jobcenter, Kreis)</option>
                </select>
              </div>
            </div>
            {zahlungswegVorschlag && zahlungswegVorschlag !== zahlungsweg && (
              <p className="text-xs text-amber-400">
                Vorschlag aus den letzten Zahlungen im Kontoauszug: {ZAHLUNGSWEG_LABEL[zahlungswegVorschlag as ZahlungswegArt] ?? zahlungswegVorschlag}.{" "}
                <button type="button" onClick={() => setZahlungsweg(zahlungswegVorschlag)} className="underline hover:text-amber-300">
                  Übernehmen
                </button>
              </p>
            )}
            <details className="text-xs text-neutral-400">
              <summary className="cursor-pointer hover:text-white">Wann trägt die App den Zahlungsweg selbst ein?</summary>
              <p className="mt-1">
                Beim Kontoauszug-Import, wenn noch keiner erfasst ist und die letzten Zahlungen eindeutig sind
                (Lastschrift, Überweisung oder Zahlung durch Jobcenter/Kreis). Bei gemischten Zahlungen (Einzug,
                Rücklastschrift, dann Dauerauftrag; Amt zahlt nur einen Teil) bleibt das Feld offen und wird von Hand
                entschieden.
              </p>
            </details>

            {zeigeMandat ? (
              <div className="space-y-4 border-t border-neutral-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-medium">SEPA-Lastschriftmandat</h3>
                  {mietvertragId && (
                    <button
                      type="button"
                      onClick={mandatAusKontoauszug}
                      disabled={mandatLaedt}
                      title="Liest Referenz, Gläubiger-ID, Kontoinhaber und IBAN aus dem jüngsten Lastschrift-Einzug dieses Vertrags (sobald der erste Einzug importiert ist)."
                      className="h-10 rounded-md border border-neutral-700 px-3 text-sm hover:bg-neutral-900 disabled:opacity-50"
                    >
                      {mandatLaedt ? "Lese Kontoauszug …" : "Aus Kontoauszug übernehmen"}
                    </button>
                  )}
                </div>
                {mandatMeldung && (
                  <p className={`text-xs ${mandatMeldung.fehler ? "text-amber-400" : "text-green-500"}`}>{mandatMeldung.text}</p>
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0">
                    <label className="mb-1 block text-sm" htmlFor="mandatReferenz">
                      Mandatsreferenz
                    </label>
                    <input
                      id="mandatReferenz"
                      name="mandatReferenz"
                      value={mandatReferenz}
                      maxLength={35}
                      onChange={(e) => setMandatReferenz(e.target.value)}
                      className={`${FELD} font-mono`}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-sm" htmlFor="mandatGlaeubigerId">
                      Gläubiger-ID
                    </label>
                    <input
                      id="mandatGlaeubigerId"
                      name="mandatGlaeubigerId"
                      value={mandatGlaeubigerId}
                      onChange={(e) => setMandatGlaeubigerId(e.target.value)}
                      className={`${FELD} font-mono`}
                    />
                  </div>
                  <div className="min-w-0">
                    <label className="mb-1 block text-sm" htmlFor="mandatKontoinhaber">
                      Kontoinhaber (Zahler)
                    </label>
                    <input
                      id="mandatKontoinhaber"
                      name="mandatKontoinhaber"
                      value={mandatKontoinhaber}
                      maxLength={70}
                      onChange={(e) => setMandatKontoinhaber(e.target.value)}
                      className={FELD}
                    />
                  </div>
                  <DateInput
                    id="mandatDatum"
                    name="mandatDatum"
                    label="Datum der Unterschrift"
                    labelClassName="font-normal"
                    value={mandatDatum}
                    onChange={setMandatDatum}
                  />
                  <div className="col-span-2">
                    <label className="mb-1 block text-sm" htmlFor="mandatIban">
                      IBAN des Zahlers
                    </label>
                    <input
                      id="mandatIban"
                      name="mandatIban"
                      value={mandatIban}
                      onChange={(e) => setMandatIban(e.target.value)}
                      className={`${FELD} font-mono`}
                    />
                  </div>
                </div>
                <p className="text-xs text-neutral-400">
                  Zum Nachschlagen und für die Einzugsdatei. Das Unterschriftsdatum steht nicht im Kontoauszug, es kommt aus
                  den Mandatsunterlagen.
                </p>
              </div>
            ) : (
              // Ohne Lastschrift und ohne erfasstes Mandat bleiben die Mandatsfelder ausgeblendet (leer gespeichert).
              <p className="text-xs text-neutral-500">Die Felder für das SEPA-Mandat erscheinen beim Zahlungsweg „SEPA-Lastschrift“.</p>
            )}
          </Abschnitt>

          <Abschnitt titel="Buchhaltung">
            <div className="grid grid-cols-2 gap-4">
              <DateInput
                id="buchhaltungAb"
                name="buchhaltungAb"
                label="Buchhaltung ab (optional)"
                value={buchhaltungAb}
                onChange={setBuchhaltungAb}
              />
              <div>
                <label className="mb-1 block text-sm font-medium" htmlFor="saldovortrag">
                  Saldovortrag (€)
                </label>
                <input
                  id="saldovortrag"
                  name="saldovortrag"
                  type="number"
                  step="0.01"
                  value={saldovortrag}
                  onChange={(e) => setSaldovortrag(e.target.value)}
                  className={FELD}
                />
              </div>
            </div>
            {buchhaltungAb !== "" && objektStichtag !== "" && buchhaltungAb >= objektStichtag && (
              <p className="text-xs text-red-400">
                „Buchhaltung ab“ muss früher sein als der Stichtag des Objekts ({deutschesDatum(objektStichtag)}) — sonst
                Feld leer lassen.
              </p>
            )}
            {buchhaltungAb !== "" && buchhaltungAb.slice(8) !== "01" && (
              <p className="text-xs text-amber-300">
                Kein Monatserster: Das Soll zählt den Monat des Stichtags voll, Sonderbuchungen aber erst ab dem genauen Tag.
              </p>
            )}
            {(() => {
              const bisher = initial?.buchhaltungAb || objektStichtag;
              const neu = buchhaltungAb || objektStichtag;
              if (neu === bisher || Number(saldovortrag) === 0) return null;
              return (
                <p className="text-xs text-amber-300">
                  {bisher ? `Der Stichtag ändert sich von ${deutschesDatum(bisher)} auf ` : "Der Stichtag ist jetzt "}
                  {neu ? deutschesDatum(neu) : "„keiner“ (Mietbeginn)"}. Der Saldovortrag ({saldovortrag} €){" "}
                  {bisher ? `galt bisher zum ${deutschesDatum(bisher)} und ` : ""}muss jetzt zum neuen Stichtag
                  passen — bei vollständiger Erfassung ab dem neuen Stichtag meist 0, sonst der Saldo zu diesem Datum
                  aus dem Verwalterbericht („Saldo alt“). Sonst wird er doppelt bzw. falsch gerechnet.
                </p>
              );
            })()}
            <p className="text-xs text-neutral-400">
              „Buchhaltung ab“ leer = Stichtag des Objekts{objektStichtag ? ` (${deutschesDatum(objektStichtag)})` : ""}.
              Saldovortrag = Endsaldo vor dem Stichtag: negativ = Rückstand, positiv = Guthaben.
            </p>
            <details className="text-xs text-neutral-400">
              <summary className="cursor-pointer hover:text-white">Wann einen eigenen Stichtag setzen?</summary>
              <p className="mt-1">
                Nur wenn ab diesem Datum <strong>alle</strong> Zahlungen und Sonderbuchungen (Gebühren, Verrechnungen)
                dieses Vertrags vollständig erfasst sind — dann rechnen Jahres-/Quartalsübersicht, Offene Posten und
                Mieterkonto dieses Vertrags auch die früheren Jahre. Der Saldovortrag gilt dann zu diesem Datum. Nur
                früher als der Stichtag des Objekts möglich; empfohlen ist ein Monatserster (Soll und Zahlungen zählen
                monatsweise).
              </p>
              <p className="mt-1">
                Der Saldovortrag (z.B. aus einem extern abgeschlossenen Jahresbericht) fließt fix in Offene Posten und
                Mieterkonto ein.
              </p>
            </details>
          </Abschnitt>
        </div>
      </div>

      {/* Speichern bleibt beim Scrollen am unteren Rand sichtbar. */}
      <div className="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-white px-5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {abbrechenHref && (
          <Link
            href={abbrechenHref}
            className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm text-white hover:bg-neutral-900"
          >
            Abbrechen
          </Link>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="space-y-4 rounded-lg border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h2>
      {children}
    </section>
  );
}
