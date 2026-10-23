"use client";

import { useActionState, useState } from "react";
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

// yyyy-mm-dd → dd.mm.yyyy für Hinweistexte.
const deutschesDatum = (iso: string) => iso.split("-").reverse().join(".");

export function MietvertragForm({
  einheiten,
  mieter,
  initial,
  objektStichtag = "",
  mieterMitWohnung = [],
  zahlungswegVorschlag = "",
  mietvertragId,
  action,
}: {
  einheiten: EinheitOption[];
  mieter: Option[];
  initial?: Initial;
  // Buchhaltungs-Stichtag des Objekts (yyyy-mm-dd), "" = keiner gesetzt.
  objektStichtag?: string;
  // IDs der Mieter mit laufendem/geplantem Wohnungsvertrag (für den MwSt-Hinweis bei Garagen).
  mieterMitWohnung?: string[];
  // Zahlungsweg, den die Ableitung aus den Kontoauszugs-Zeilen vorschlägt ("" = nicht eindeutig).
  zahlungswegVorschlag?: string;
  // Nur beim Bearbeiten: für den Knopf „Mandat aus Kontoauszug übernehmen“.
  mietvertragId?: string;
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

  // Garage zur Wohnung desselben Mieters = Nebenleistung (steuerfrei), allein vermietet = 19 % USt.
  const hatWohnung = [mieterId1, mieterId2].some((id) => id && mieterMitWohnung.includes(id));
  const kaltmieteZahl = Number(kaltmiete.replace(",", "."));
  const mwstVorschlag = hatWohnung
    ? "0"
    : kaltmiete !== "" && Number.isFinite(kaltmieteZahl)
      ? (Math.round(kaltmieteZahl * 19) / 100).toFixed(2)
      : "";

  return (
    <form action={formAction} className="max-w-lg space-y-4">
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
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
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
        <div>
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

        <div>
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
          <div className="mb-1 flex min-h-10 items-end justify-between gap-2">
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
            <div className="flex h-[38px] items-center rounded-md border border-neutral-800 px-3 text-sm text-neutral-500">
              unbekannt
            </div>
          ) : (
            <DateInput id="beginn" name="beginn" defaultValue={initial?.beginn} />
          )}
          <input type="hidden" name="beginnUnbekannt" value={beginnUnbekannt ? "on" : ""} />
        </div>
        <DateInput
          id="ende"
          name="ende"
          label="Mietende (erforderlich bei Status „Beendet“)"
          defaultValue={initial?.ende}
          labelClassName="min-h-10"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1 flex min-h-10 items-end text-sm font-medium" htmlFor="kaltmiete">
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
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
        <div>
          <label
            className="mb-1 flex min-h-10 items-end text-sm font-medium"
            htmlFor="nebenkostenVorauszahlung"
          >
            NK-Vorauszahlung (€){istGarage && " (optional bei Garagen)"}
          </label>
          <input
            id="nebenkostenVorauszahlung"
            name="nebenkostenVorauszahlung"
            type="number"
            step="0.01"
            required={!istGarage}
            value={nebenkostenVorauszahlung}
            onChange={(e) => setNebenkostenVorauszahlung(e.target.value)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {istGarage && (
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
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
          {mieterId1 && (
            <p className="mt-1 text-xs text-neutral-400">
              {hatWohnung
                ? "Dieser Mieter hat auch eine Wohnung bei uns: Die Garage gilt als Nebenleistung zur Wohnung und ist umsatzsteuerfrei — Mehrwertsteuer 0 €."
                : "Dieser Mieter hat keine Wohnung bei uns: Die Garage wird allein vermietet und ist umsatzsteuerpflichtig — Mehrwertsteuer 19 % der Kaltmiete."}
              {mwstVorschlag !== "" && mehrwertsteuer !== mwstVorschlag && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => setMehrwertsteuer(mwstVorschlag)}
                    className="underline hover:text-white"
                  >
                    {hatWohnung ? "0 € eintragen" : `${mwstVorschlag.replace(".", ",")} € eintragen`}
                  </button>
                </>
              )}
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="status">
          Status
        </label>
        <select
          id="status"
          name="status"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="AKTIV">Aktiv</option>
          <option value="GEPLANT">Geplant</option>
          <option value="BEENDET">Beendet</option>
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="zahlungsweg">
          Zahlungsweg
        </label>
        <select
          id="zahlungsweg"
          name="zahlungsweg"
          value={zahlungsweg}
          onChange={(e) => setZahlungsweg(e.target.value)}
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        >
          <option value="">– nicht erfasst –</option>
          <option value="LASTSCHRIFT">SEPA-Lastschrift</option>
          <option value="UEBERWEISUNG">Überweisung / Dauerauftrag</option>
          <option value="BEHOERDE">Amt zahlt (Jobcenter, Kreis)</option>
        </select>
        <p className="mt-1 text-xs text-neutral-400">
          Beim Kontoauszug-Import trägt die App den Zahlungsweg selbst ein, wenn noch keiner erfasst ist und
          die letzten Zahlungen eindeutig sind (Lastschrift, Überweisung oder Zahlung durch Jobcenter/Kreis).
          Bei gemischten Zahlungen (Einzug, Rücklastschrift, dann Dauerauftrag; Amt zahlt nur einen Teil) bleibt das
          Feld offen und wird von Hand entschieden.
        </p>
        {zahlungswegVorschlag && zahlungswegVorschlag !== zahlungsweg && (
          <p className="mt-1 text-xs text-amber-400">
            Vorschlag aus den letzten Zahlungen im Kontoauszug: {ZAHLUNGSWEG_LABEL[zahlungswegVorschlag as ZahlungswegArt] ?? zahlungswegVorschlag}.{" "}
            <button type="button" onClick={() => setZahlungsweg(zahlungswegVorschlag)} className="underline hover:text-amber-300">
              Übernehmen
            </button>
          </p>
        )}
      </div>

      <div className="rounded-md border border-neutral-800 p-4">
        <h3 className="mb-1 text-sm font-medium">SEPA-Lastschriftmandat</h3>
        <p className="mb-3 text-xs text-neutral-400">
          Nur zum Nachschlagen (Nachweis bei Widerspruch, spätere Einzugsdatei). Bestehende Mandate sind aus dem
          Kontoauszug eingetragen; das Unterschriftsdatum steht dort nicht und kommt aus den Mandatsunterlagen.
        </p>
        {mietvertragId && (
          <div className="mb-3">
            <button
              type="button"
              onClick={mandatAusKontoauszug}
              disabled={mandatLaedt}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-900 disabled:opacity-50"
            >
              {mandatLaedt ? "Lese Kontoauszug …" : "Aus Kontoauszug übernehmen"}
            </button>
            <p className="mt-1 text-xs text-neutral-400">
              Liest Referenz, Gläubiger-ID, Kontoinhaber und IBAN aus dem jüngsten Lastschrift-Einzug dieses Vertrags.
              Gedacht für neue Lastschrift-Mieter, sobald der erste Einzug importiert ist.
            </p>
            {mandatMeldung && (
              <p className={`mt-1 text-xs ${mandatMeldung.fehler ? "text-amber-400" : "text-green-500"}`}>{mandatMeldung.text}</p>
            )}
          </div>
        )}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm" htmlFor="mandatReferenz">
              Mandatsreferenz
            </label>
            <input
              id="mandatReferenz"
              name="mandatReferenz"
              value={mandatReferenz}
              maxLength={35}
              onChange={(e) => setMandatReferenz(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="mandatGlaeubigerId">
              Gläubiger-ID
            </label>
            <input
              id="mandatGlaeubigerId"
              name="mandatGlaeubigerId"
              value={mandatGlaeubigerId}
              onChange={(e) => setMandatGlaeubigerId(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <DateInput
            id="mandatDatum"
            name="mandatDatum"
            label="Datum der Unterschrift"
            value={mandatDatum}
            onChange={setMandatDatum}
          />
          <div>
            <label className="mb-1 block text-sm" htmlFor="mandatKontoinhaber">
              Kontoinhaber (Zahler)
            </label>
            <input
              id="mandatKontoinhaber"
              name="mandatKontoinhaber"
              value={mandatKontoinhaber}
              maxLength={70}
              onChange={(e) => setMandatKontoinhaber(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm" htmlFor="mandatIban">
              IBAN des Zahlers
            </label>
            <input
              id="mandatIban"
              name="mandatIban"
              value={mandatIban}
              onChange={(e) => setMandatIban(e.target.value)}
              className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 font-mono text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      </div>

      <div className="rounded-md border border-neutral-800 p-4">
        <DateInput
          id="buchhaltungAb"
          name="buchhaltungAb"
          label="Buchhaltung ab (optional)"
          value={buchhaltungAb}
          onChange={setBuchhaltungAb}
        />
        <p className="mt-2 text-xs text-neutral-400">
          Leer = Buchhaltungs-Stichtag des Objekts{objektStichtag ? ` (${deutschesDatum(objektStichtag)})` : ""}. Nur
          setzen, wenn ab diesem Datum <strong>alle</strong> Zahlungen und Sonderbuchungen (Gebühren, Verrechnungen)
          dieses Vertrags vollständig erfasst sind — dann rechnen Jahres-/Quartalsübersicht, Offene Posten und
          Mieterkonto dieses Vertrags auch die früheren Jahre. Der Saldovortrag gilt dann zu diesem Datum. Nur
          früher als der Stichtag des Objekts möglich; empfohlen ist ein Monatserster (Soll und Zahlungen zählen
          monatsweise).
        </p>
        {buchhaltungAb !== "" && objektStichtag !== "" && buchhaltungAb >= objektStichtag && (
          <p className="mt-2 text-xs text-red-400">
            Muss früher sein als der Stichtag des Objekts ({deutschesDatum(objektStichtag)}) — sonst Feld leer lassen.
          </p>
        )}
        {buchhaltungAb !== "" && buchhaltungAb.slice(8) !== "01" && (
          <p className="mt-2 text-xs text-amber-300">
            Kein Monatserster: das Soll zählt den Monat des Stichtags voll, Sonderbuchungen aber erst ab dem
            genauen Tag.
          </p>
        )}
        {(() => {
          const bisher = initial?.buchhaltungAb || objektStichtag;
          const neu = buchhaltungAb || objektStichtag;
          if (neu === bisher || Number(saldovortrag) === 0) return null;
          return (
            <p className="mt-2 text-xs text-amber-300">
              {bisher ? `Der Stichtag ändert sich von ${deutschesDatum(bisher)} auf ` : "Der Stichtag ist jetzt "}
              {neu ? deutschesDatum(neu) : "„keiner“ (Mietbeginn)"}. Der Saldovortrag ({saldovortrag} €){" "}
              {bisher ? `galt bisher zum ${deutschesDatum(bisher)} und ` : ""}muss jetzt zum neuen Stichtag
              passen — bei vollständiger Erfassung ab dem neuen Stichtag meist 0, sonst der Saldo zu diesem Datum
              aus dem Verwalterbericht („Saldo alt“). Sonst wird er doppelt bzw. falsch gerechnet.
            </p>
          );
        })()}
      </div>

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
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Endsaldo aus der Zeit vor dem Buchhaltungs-Stichtag dieses Vertrags (eigener Stichtag oben, sonst der
          des Objekts; z.B. aus einem extern abgeschlossenen Jahresbericht) — negativ = Rückstand, positiv =
          Guthaben. Fließt fix in die Offene-Posten-Berechnung ein.
        </p>
      </div>

      <fieldset className="rounded-md border border-neutral-800 p-4">
        <legend className="px-1 text-sm font-medium">Kaution (optional)</legend>
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
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
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
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            >
              <option value="KAUTIONSKONTO">Kautionskonto</option>
              <option value="SPARBUCH">Sparbuch</option>
              <option value="BUERGSCHAFT">Bürgschaft</option>
              <option value="BAR">Bar</option>
            </select>
          </div>
        </div>
        <p className="mt-2 text-xs text-neutral-500">
          Betrag = ursprünglich eingezahlte Kaution, nicht der Auflösungsbetrag — die Zinsen ergibt die App aus der
          Auflösung. Feld leeren entfernt die Kaution (nur ohne erfasste Einbehalte).
        </p>
        <label className="mt-4 flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            name="kautionEinzahlungUnbekannt"
            checked={kautionEinzahlungUnbekannt}
            onChange={(e) => setKautionEinzahlungUnbekannt(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-700 bg-transparent"
          />
          Einzahlung vor Buchhaltungsbeginn erfolgt (Datum unbekannt, keine Buchung im Journal)
        </label>
        <p className="ml-5 mt-1 text-xs text-neutral-500">
          Wirkt nur, solange keine Einzahlung gebucht ist. Liegt nur ein Teil vor Buchhaltungsbeginn, diesen Teil
          stattdessen als Einzahlung auf /kautionen buchen.
        </p>
      </fieldset>

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="notiz">
          Notiz (optional)
        </label>
        <textarea
          id="notiz"
          name="notiz"
          value={notiz}
          onChange={(e) => setNotiz(e.target.value)}
          rows={3}
          maxLength={MAX_MIETVERTRAG_NOTIZ}
          className="w-full resize-y rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
        <p className="mt-1 text-xs text-neutral-400">
          Interner Freitext, z.B. weitere Bewohner, die nicht im Vertrag stehen. Wird in den Vertragsdaten angezeigt,
          ändert aber nichts an Beträgen oder Berechnungen.
        </p>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
