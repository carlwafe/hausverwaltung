"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { ART_GRUPPEN, ART_OPTIONEN } from "@/lib/dokumente-anzeige";
import Link from "next/link";
import {
  entferneBezug,
  erkenneDokument,
  ladeBezugAuswahl,
  legeDokumentAb,
  ordneDokumentZu,
  speichereDokumentLabels,
  type ZuordnungsZiel,
} from "../actions";

const FELD = "h-[38px] w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white disabled:opacity-60";
const LABEL = "mb-1 block text-xs text-neutral-400";

export type LabelWerte = {
  art: string;
  titel: string;
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
            {ART_GRUPPEN.map((g) => (
              <optgroup key={g} label={g}>
                {ART_OPTIONEN.filter((a) => a.gruppe === g).map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>Titel (Kurzbeschreibung)</label>
          <input name="titel" defaultValue={werte.titel} disabled={!editierbar} maxLength={200} placeholder="z.B. Reparatur Warmwasserleitung" className={FELD} />
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

export type AktuellerBezug = { ziel: ZuordnungsZiel; label: string; href: string; entfernbar: boolean };

type Option = { id: string; label: string };
type Auswahl = Record<ZuordnungsZiel, Option[]>;

const ZIEL_LABEL: Record<ZuordnungsZiel, string> = {
  buchung: "Kostenposition",
  mietvertrag: "Mieterakte (Mietvertrag)",
  einheit: "Einheit",
  gebaeude: "Gebäude",
  dienstleister: "Dienstleister",
  ticket: "Ticket",
};

const ZIELE = Object.keys(ZIEL_LABEL) as ZuordnungsZiel[];
const ART_ANZEIGE: Record<string, string> = Object.fromEntries(ART_OPTIONEN.map((a) => [a.key, a.label]));

// Welcher Bezug zu einem Dokumenttyp meist passt (vorbelegt in „Bezug hinzufügen“, änderbar).
const ZIEL_ZU_ART: Record<string, ZuordnungsZiel> = {
  PROTOKOLL: "mietvertrag",
  VERTRAG: "mietvertrag",
  SCHREIBEN: "mietvertrag",
  RECHNUNG: "buchung",
  BESCHEID: "buchung",
  ABRECHNUNG: "buchung",
  FOTO: "einheit",
  VERSICHERUNG: "gebaeude",
  PRUEFBERICHT: "gebaeude",
  BEHOERDE: "gebaeude",
};

// Bezüge eines Dokuments: bestehende (entfernbar bis auf die Kostenposition), Vorschläge aus den Labels und
// „Bezug hinzufügen“ von Hand. Ein Dokument darf mehrere Bezüge haben (je Art einen). Im Eingang liegt es, bis ein Bezug
// gesetzt oder „Ohne Bezug ablegen“ gewählt wird.
export function BezuegePanel({
  id,
  eingang,
  bezuege,
  vorschlaege,
  ordnerNamen,
  art,
  gelesen,
}: {
  id: string;
  eingang: boolean;
  bezuege: AktuellerBezug[];
  vorschlaege: Vorschlag[];
  ordnerNamen: string[];
  /** Dokumenttyp (für die Vorbelegung der Bezugsart). */
  art: string | null;
  /** Wurde der Inhalt von der Texterkennung gelesen? Sonst gibt es keine Vorschläge aus dem Inhalt. */
  gelesen: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [auswahl, setAuswahl] = useState<Auswahl | null>(null);
  // Gibt es noch keinen Bezug und keine Vorschläge, steht die Auswahl gleich offen (mit der zum Typ passenden Bezugsart).
  const [offen, setOffen] = useState(eingang && bezuege.length === 0 && vorschlaege.length === 0);
  const gesetzt = new Set(bezuege.map((b) => b.ziel));
  const freieZiele = ZIELE.filter((z) => !gesetzt.has(z));
  const vorbelegt = art && ZIEL_ZU_ART[art] && freieZiele.includes(ZIEL_ZU_ART[art]) ? ZIEL_ZU_ART[art] : (freieZiele[0] ?? "buchung");
  const [ziel, setZiel] = useState<ZuordnungsZiel>(vorbelegt);
  const [zielId, setZielId] = useState("");
  const [ordner, setOrdner] = useState("");

  function fuehreAus(aktion: () => Promise<string | null | unknown>, bestaetigung?: string) {
    if (bestaetigung && !confirm(bestaetigung)) return;
    setFehler(null);
    startTransition(async () => {
      const f = await aktion();
      if (typeof f === "string") setFehler(f);
    });
  }

  // Die Auswahllisten werden erst geladen, wenn die Auswahl offen ist (Vercel-CPU).
  useEffect(() => {
    if (!offen || auswahl) return;
    let aktiv = true;
    ladeBezugAuswahl(id).then(
      (a) => {
        if (aktiv && a) setAuswahl(a);
      },
      () => {
        if (aktiv) setFehler("Die Auswahl konnte nicht geladen werden.");
      },
    );
    return () => {
      aktiv = false;
    };
  }, [offen, auswahl, id]);

  const sichtbareVorschlaege = vorschlaege.filter((v) => !gesetzt.has(v.ziel));


  return (
    <div className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-1 text-lg font-medium text-white">Bezüge</h2>
      <p className="mb-3 text-xs text-neutral-500">
        Worauf sich das Dokument bezieht. Es kann mehrere Bezüge haben (z.B. Kostenposition und Gebäude) und erscheint dann in jedem
        passenden Bereich. Eine Kostenposition ist ein fester Nachweis und lässt sich nicht mehr entfernen.
      </p>

      {bezuege.length > 0 ? (
        <ul className="mb-4 flex flex-wrap gap-2">
          {bezuege.map((b) => (
            <li key={b.ziel} className="flex items-center gap-2 rounded-full border border-neutral-700 py-1 pl-3 pr-2 text-sm">
              <span className="text-xs uppercase text-neutral-500">{ZIEL_LABEL[b.ziel]}</span>
              <Link href={b.href} prefetch={false} className="text-white hover:underline [overflow-wrap:anywhere]">
                {b.label}
              </Link>
              {b.entfernbar && (
                <button
                  type="button"
                  disabled={pending}
                  title="Bezug entfernen"
                  onClick={() => fuehreAus(() => entferneBezug(id, b.ziel), `Bezug „${b.label}“ entfernen?`)}
                  className="rounded-full px-1.5 text-neutral-400 hover:bg-neutral-800 hover:text-white disabled:opacity-50"
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mb-4 text-sm text-neutral-400">
          <p>{eingang ? "Noch kein Bezug — das Dokument liegt im Eingang, bis du einen Bezug wählst oder es ohne Bezug ablegst." : "Kein Bezug (Unkategorisiert)."}</p>
          {eingang && !gelesen && sichtbareVorschlaege.length === 0 && (
            <p className="mt-1 text-xs text-neutral-500">
              Der Inhalt wurde nicht gelesen (Erkennung aus oder Typ vorab gewählt), deshalb gibt es keine Vorschläge. Wähle den Bezug unten von Hand
              {art ? ` (vorbelegt passend zum Typ „${ART_ANZEIGE[art] ?? art}“)` : ""} oder starte weiter unten „Inhalt erkennen“.
            </p>
          )}
        </div>
      )}

      {sichtbareVorschlaege.length > 0 && (
        <>
          <h3 className="mb-2 text-sm font-medium text-neutral-300">Vorschläge</h3>
          <ul className="mb-4 divide-y divide-neutral-800 rounded-md border border-neutral-800">
            {sichtbareVorschlaege.map((v) => (
              <li key={`${v.ziel}-${v.zielId}`} className="flex flex-wrap items-center justify-between gap-3 p-3">
                <div className="min-w-0 text-sm">
                  <div className="text-white [overflow-wrap:anywhere]">
                    <span className="mr-2 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase text-neutral-400">
                      {ZIEL_LABEL[v.ziel]}
                    </span>
                    {v.titel}
                    {v.sicher && <span className="ml-2 rounded-full bg-green-950 px-2 py-0.5 text-[10px] uppercase text-green-400">sicher</span>}
                  </div>
                  {v.details && <div className="text-xs text-neutral-500 [overflow-wrap:anywhere]">{v.details}</div>}
                  {v.gruende.length > 0 && <div className="text-xs text-neutral-400">{v.gruende.join(" · ")}</div>}
                </div>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    fuehreAus(
                      () => ordneDokumentZu(id, v.ziel, v.zielId),
                      v.ziel === "buchung" ? `Als Beleg an diese Kostenposition hängen? Das lässt sich nicht mehr rückgängig machen.` : undefined,
                    )
                  }
                  className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
                >
                  Hinzufügen
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {freieZiele.length > 0 &&
        (offen ? (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className={LABEL}>Bezug hinzufügen</label>
              <select
                value={ziel}
                onChange={(e) => {
                  setZiel(e.target.value as ZuordnungsZiel);
                  setZielId("");
                }}
                className="h-[38px] rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white"
              >
                {freieZiele.map((z) => (
                  <option key={z} value={z}>
                    {ZIEL_LABEL[z]}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-96 max-w-full">
              {auswahl ? (
                <MietvertragAuswahl key={ziel} kandidaten={auswahl[ziel]} value={zielId} onChange={setZielId} leerLabel="Bitte wählen…" size="md" />
              ) : (
                <div className="flex h-[38px] items-center rounded-md border border-neutral-700 px-3 text-sm text-neutral-500">Lädt…</div>
              )}
            </div>
            <button
              type="button"
              disabled={pending || !zielId}
              onClick={() => fuehreAus(() => ordneDokumentZu(id, ziel, zielId), ziel === "buchung" ? "Als Beleg an diese Kostenposition hängen? Das lässt sich nicht mehr rückgängig machen." : undefined)}
              className="h-[38px] rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
            >
              Hinzufügen
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOffen(true)}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            + Bezug hinzufügen
          </button>
        ))}

      {eingang && bezuege.length === 0 && (
        <div className="mt-5 border-t border-neutral-800 pt-4">
          <h3 className="mb-1 text-sm font-medium text-neutral-300">Ohne Bezug ablegen</h3>
          <p className="mb-2 text-xs text-neutral-500">
            Für Dokumente ohne passendes Objekt (z.B. Versicherungspolice, Grundbuch): optional in einen frei benannten Ordner unter „Unkategorisiert“.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <input
              value={ordner}
              onChange={(e) => setOrdner(e.target.value)}
              list="ablage-ordner"
              maxLength={80}
              placeholder="Ordnername (optional)"
              className="h-[38px] w-64 rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white"
            />
            <datalist id="ablage-ordner">
              {ordnerNamen.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <button
              type="button"
              disabled={pending}
              onClick={() => fuehreAus(() => legeDokumentAb(id, ordner))}
              className="h-[38px] rounded-md border border-neutral-700 px-3 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
            >
              Ablegen
            </button>
          </div>
        </div>
      )}
      {fehler && <p className="mt-2 text-sm text-red-400">{fehler}</p>}
    </div>
  );
}
