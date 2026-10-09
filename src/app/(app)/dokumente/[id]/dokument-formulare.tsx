"use client";

import { useActionState, useState, useTransition } from "react";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { ART_OPTIONEN } from "@/lib/dokumente-anzeige";
import { erkenneDokument, ordneDokumentZu, speichereDokumentLabels, type ZuordnungsZiel } from "../actions";

const FELD = "h-[38px] w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white disabled:opacity-60";
const LABEL = "mb-1 block text-xs text-neutral-400";

export type LabelWerte = {
  art: string;
  belegDatum: string;
  aussteller: string;
  rechnungsnummer: string;
  betrag: string;
  leistungVon: string;
  leistungBis: string;
  kostenjahr: string;
  iban: string;
  kostenartId: string;
  adressat: string;
  objektHinweis: string;
};

export function LabelsForm({
  id,
  werte,
  kostenarten,
  editierbar,
}: {
  id: string;
  werte: LabelWerte;
  kostenarten: { id: string; name: string }[];
  editierbar: boolean;
}) {
  const [fehler, formAction, pending] = useActionState(speichereDokumentLabels.bind(null, id), null);
  const [gespeichert, setGespeichert] = useState(false);

  return (
    <form
      action={(fd) => {
        setGespeichert(false);
        return formAction(fd);
      }}
      onSubmit={() => setGespeichert(true)}
      className="rounded-lg border border-neutral-800 p-4"
    >
      <h2 className="mb-3 text-lg font-medium text-white">Angaben zum Dokument</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className={LABEL}>Dokumenttyp</label>
          <select name="art" defaultValue={werte.art} disabled={!editierbar} className={FELD}>
            <option value="">–</option>
            {ART_OPTIONEN.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Rechnungs-/Belegdatum</label>
          <DateInput name="belegDatum" defaultValue={werte.belegDatum} disabled={!editierbar} />
        </div>
        <div>
          <label className={LABEL}>Betrag (€, Gutschrift negativ)</label>
          <input name="betrag" defaultValue={werte.betrag} disabled={!editierbar} inputMode="decimal" placeholder="z.B. 1.234,56" className={FELD} />
        </div>
        <div>
          <label className={LABEL}>Aussteller</label>
          <input name="aussteller" defaultValue={werte.aussteller} disabled={!editierbar} maxLength={200} className={FELD} />
        </div>
        <div>
          <label className={LABEL}>Rechnungsnummer</label>
          <input name="rechnungsnummer" defaultValue={werte.rechnungsnummer} disabled={!editierbar} maxLength={60} className={FELD} />
        </div>
        <div>
          <label className={LABEL}>IBAN des Ausstellers</label>
          <input name="iban" defaultValue={werte.iban} disabled={!editierbar} maxLength={40} className={FELD} />
        </div>
        <div>
          <label className={LABEL}>Leistungszeitraum von</label>
          <DateInput name="leistungVon" defaultValue={werte.leistungVon} disabled={!editierbar} />
        </div>
        <div>
          <label className={LABEL}>Leistungszeitraum bis</label>
          <DateInput name="leistungBis" defaultValue={werte.leistungBis} disabled={!editierbar} />
        </div>
        <div>
          <label className={LABEL}>Kostenjahr</label>
          <input name="kostenjahr" defaultValue={werte.kostenjahr} disabled={!editierbar} inputMode="numeric" maxLength={4} placeholder="z.B. 2026" className={FELD} />
        </div>
        <div>
          <label className={LABEL}>Kostenart</label>
          <select name="kostenartId" defaultValue={werte.kostenartId} disabled={!editierbar} className={FELD}>
            <option value="">–</option>
            {kostenarten.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>Adressat (Rechnungsempfänger)</label>
          <input name="adressat" defaultValue={werte.adressat} disabled={!editierbar} maxLength={200} className={FELD} />
        </div>
        <div>
          <label className={LABEL}>Objekt laut Dokument (Adresse/Wohnung)</label>
          <input name="objektHinweis" defaultValue={werte.objektHinweis} disabled={!editierbar} maxLength={300} className={FELD} />
        </div>
      </div>
      {editierbar && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={pending}
            className="h-[38px] rounded-md bg-white px-4 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {pending ? "Speichert…" : "Angaben speichern"}
          </button>
          {gespeichert && !pending && !fehler && <span className="text-sm text-neutral-400">Gespeichert.</span>}
          {fehler && <span className="text-sm text-red-400">{fehler}</span>}
        </div>
      )}
    </form>
  );
}

export function ErkennenBereich({
  id,
  erkanntAm,
  konfidenz,
  hinweis,
  erkennbar,
  editierbar,
}: {
  id: string;
  erkanntAm: string | null;
  konfidenz: string | null;
  hinweis: string | null;
  erkennbar: boolean;
  editierbar: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [meldung, setMeldung] = useState<string | null>(null);

  function starte(ueberschreiben: boolean) {
    setMeldung(null);
    startTransition(async () => {
      const fehler = await erkenneDokument(id, ueberschreiben);
      if (typeof fehler === "string") setMeldung(fehler);
    });
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-2 text-lg font-medium text-white">Texterkennung</h2>
      {erkanntAm ? (
        <p className="mb-3 text-sm text-neutral-300">
          Erkannt am {erkanntAm}
          {konfidenz && <> · Sicherheit: <strong>{konfidenz}</strong></>}
          {hinweis && <span className="block text-xs text-neutral-500">{hinweis}</span>}
        </p>
      ) : (
        <p className="mb-3 text-sm text-neutral-500">Noch nicht erkannt.</p>
      )}
      {editierbar && erkennbar && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => starte(false)}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
          >
            {pending ? "Liest das Dokument…" : erkanntAm ? "Erneut erkennen (leere Felder füllen)" : "Inhalt erkennen"}
          </button>
          {erkanntAm && (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (confirm("Alle Angaben löschen und neu aus dem Dokument einlesen? Eigene Eingaben gehen verloren.")) starte(true);
              }}
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-900 disabled:opacity-50"
            >
              Neu erkennen (Angaben ersetzen)
            </button>
          )}
        </div>
      )}
      {!erkennbar && <p className="text-xs text-neutral-500">Erkennbar sind PDF-Dateien und Bilder (PNG, JPG, WebP).</p>}
      <p className="mt-2 text-xs text-neutral-500">
        Das Dokument wird zum Lesen an Anthropic (Claude) übertragen. Das Ergebnis ist ein Vorschlag — bitte Betrag und Rechnungsnummer
        gegen das Original prüfen.
      </p>
      {meldung && <p className="mt-2 text-sm text-red-400">{meldung}</p>}
    </div>
  );
}

export type Vorschlag = {
  ziel: ZuordnungsZiel;
  zielId: string;
  titel: string;
  details: string;
  gruende: string[];
  sicher?: boolean;
};

type Option = { id: string; label: string };

const ZIEL_LABEL: Record<ZuordnungsZiel, string> = {
  buchung: "Kostenposition",
  mietvertrag: "Mieterakte (Mietvertrag)",
  einheit: "Einheit (Foto)",
  dienstleister: "Dienstleister",
  ticket: "Ticket",
};

export function ZuordnenPanel({
  id,
  vorschlaege,
  optionen,
}: {
  id: string;
  vorschlaege: Vorschlag[];
  optionen: Record<ZuordnungsZiel, Option[]>;
}) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [ziel, setZiel] = useState<ZuordnungsZiel>("buchung");
  const [zielId, setZielId] = useState("");

  function ordneZu(z: ZuordnungsZiel, zid: string, beschreibung: string) {
    if (!confirm(`Dokument zuordnen: ${beschreibung}?\nDanach ist die Zuordnung fest.`)) return;
    setFehler(null);
    startTransition(async () => {
      const f = await ordneDokumentZu(id, z, zid);
      if (typeof f === "string") setFehler(f);
    });
  }

  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Zuordnen</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Dieses Dokument liegt im Eingang. Die Zuordnung ist einmalig und danach fest (wie bei allen Dokumenten).
      </p>

      {vorschlaege.length > 0 ? (
        <ul className="mb-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
          {vorschlaege.map((v) => (
            <li key={`${v.ziel}-${v.zielId}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm">
                <div className="text-white [overflow-wrap:anywhere]">
                  <span className="mr-2 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase text-neutral-400">
                    {ZIEL_LABEL[v.ziel]}
                  </span>
                  {v.titel}
                  {v.sicher && <span className="ml-2 rounded-full bg-green-950 px-2 py-0.5 text-[10px] uppercase text-green-400">sicher</span>}
                </div>
                <div className="text-xs text-neutral-500 [overflow-wrap:anywhere]">{v.details}</div>
                {v.gruende.length > 0 && <div className="text-xs text-neutral-400">{v.gruende.join(" · ")}</div>}
              </div>
              <button
                type="button"
                disabled={pending}
                onClick={() => ordneZu(v.ziel, v.zielId, `${ZIEL_LABEL[v.ziel]} ${v.titel}`)}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
              >
                Zuordnen
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-neutral-500">
          Kein passender Vorschlag gefunden. Je vollständiger die Angaben oben (Betrag, Rechnungsnummer, Aussteller), desto besser —
          oder von Hand zuordnen.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className={LABEL}>Von Hand zuordnen zu</label>
          <select
            value={ziel}
            onChange={(e) => {
              setZiel(e.target.value as ZuordnungsZiel);
              setZielId("");
            }}
            className="h-[38px] rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white"
          >
            {(Object.keys(ZIEL_LABEL) as ZuordnungsZiel[]).map((z) => (
              <option key={z} value={z}>
                {ZIEL_LABEL[z]}
              </option>
            ))}
          </select>
        </div>
        <div className="w-96 max-w-full">
          <MietvertragAuswahl key={ziel} kandidaten={optionen[ziel]} value={zielId} onChange={setZielId} leerLabel="Bitte wählen…" size="md" />
        </div>
        <button
          type="button"
          disabled={pending || !zielId}
          onClick={() => ordneZu(ziel, zielId, `${ZIEL_LABEL[ziel]} ${optionen[ziel].find((o) => o.id === zielId)?.label ?? ""}`)}
          className="h-[38px] rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
        >
          Zuordnen
        </button>
      </div>
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}

