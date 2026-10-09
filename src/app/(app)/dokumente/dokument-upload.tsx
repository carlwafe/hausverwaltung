"use client";

import { useActionState, useEffect, useState } from "react";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { ART_GRUPPEN, ART_OPTIONEN, ORDNER_VORSCHLAEGE, formatBytes } from "@/lib/dokumente-anzeige";
import { MAX_DOKUMENT_GROESSE_BYTES, ermittleZuGrosseDateien } from "@/lib/upload-limits";
import { ladeDirektAuswahl, uploadDokumentZentral } from "./actions";
import { GroessenFehler } from "@/components/groessen-fehler";

// Feste Höhe: native Auswahlfelder rendern sonst kleiner als Text- und Datumsfelder (38 px = Standard der App).
const FELD = "h-[38px] rounded-md border border-neutral-700 bg-neutral-900 px-3 text-sm text-white";
const MAX_DATEIEN = 4;

type DirektBereich = "mietvertraege" | "einheiten" | "gebaeude" | "allgemein";

// Typen, die sich beim Upload gleich zuordnen lassen: ein Bezug (Mietvertrag, Einheit, Gebäude) bzw. ein Ordner, dazu Datum
// und Titel. `immer`: Mieterunterlagen und Fotos liest die App nie automatisch, die Felder erscheinen also immer; bei den
// übrigen nur ohne Häkchen „Inhalt automatisch erkennen“ (sonst übernimmt die Erkennung die Zuordnung im Eingang).
const DIREKT_ZUORDNEN: Record<string, { bereich: DirektBereich; bezug: string; datum: string; titel: string; hinweis: string; immer: boolean }> = {
  VERTRAG: { bereich: "mietvertraege", bezug: "Mietvertrag", datum: "Vertragsdatum (optional)", titel: "z.B. Mietvertrag Wohnung 3", hinweis: "ohne Auswahl landet der Vertrag im Eingang (z.B. ein Dienstleistervertrag)", immer: true },
  SCHREIBEN: { bereich: "mietvertraege", bezug: "Mietvertrag", datum: "Briefdatum (optional)", titel: "z.B. Mieterhöhung zum 01.12.2026", hinweis: "ohne Auswahl landet das Schreiben im Eingang", immer: true },
  PROTOKOLL: { bereich: "mietvertraege", bezug: "Mietvertrag", datum: "Datum des Protokolls (optional)", titel: "z.B. Übergabeprotokoll Wohnung 3", hinweis: "ohne Auswahl landet das Protokoll im Eingang", immer: true },
  FOTO: { bereich: "einheiten", bezug: "Einheit", datum: "Aufnahmedatum (optional)", titel: "z.B. Küche vor der Renovierung", hinweis: "ohne Auswahl landet das Foto im Eingang", immer: true },
  VERSICHERUNG: { bereich: "gebaeude", bezug: "Gebäude", datum: "Datum (optional)", titel: "z.B. Wohngebäudeversicherung Nachtrag 2026", hinweis: "ohne Auswahl landet das Dokument im Eingang", immer: false },
  PRUEFBERICHT: { bereich: "gebaeude", bezug: "Gebäude", datum: "Datum des Berichts (optional)", titel: "z.B. Prüfbericht Heizung 2026", hinweis: "ohne Auswahl landet das Dokument im Eingang", immer: false },
  BEHOERDE: { bereich: "allgemein", bezug: "Ordner", datum: "Datum (optional)", titel: "z.B. Grundsteuerbescheid 2026", hinweis: "es wird ohne Bezug in diesem Ordner unter „Unkategorisiert“ abgelegt", immer: false },
};

const BEHOERDE_ORDNER = "Steuer & Bescheide";

type Vorgabe = {
  /** Bereich des geöffneten Ordners (nur wenn man dort direkt ablegen kann). */
  bereich: string;
  bezugId: string;
  ordner: string;
  /** Anzeigename des geöffneten Ordners. */
  label: string;
};

// Hochladen = nur Dateien wählen. Typ und Bezüge erkennt die App (Texterkennung) und schlägt sie im Eingang vor;
// den Typ vorab zu wählen ist optional (hilft der Erkennung, und Mieterunterlagen werden damit nie automatisch gelesen).
// Ist ein Ordner geöffnet, lassen sich die Dateien wahlweise direkt dort ablegen.
export function DokumentUpload({ ordnerNamen, vorgabe }: { ordnerNamen: string[]; vorgabe: Vorgabe | null }) {
  const [error, formAction, pending] = useActionState(uploadDokumentZentral, null);
  const [ablegen, setAblegen] = useState<"eingang" | "direkt">(vorgabe ? "direkt" : "eingang");
  const [groessenFehler, setGroessenFehler] = useState<string | null>(null);

  // Typen mit direkter Zuordnung: Bezug (bzw. Ordner), Datum und Titel gleich beim Hochladen angeben — dann wird das Dokument
  // sofort abgelegt, ohne Bezug landet es wie bisher im Eingang.
  const [art, setArt] = useState("");
  const [erkennen, setErkennen] = useState(true);
  const typ = DIREKT_ZUORDNEN[art] ?? null;
  const direktTyp = typ && (typ.immer || !erkennen) ? typ : null;
  const mitAuswahl = direktTyp !== null && direktTyp.bereich !== "allgemein";
  const [auswahlIds, setAuswahlIds] = useState<Record<string, string>>(vorgabe ? { [vorgabe.bereich]: vorgabe.bezugId } : {});
  const auswahlId = direktTyp ? (auswahlIds[direktTyp.bereich] ?? "") : "";
  const [listen, setListen] = useState<Record<string, { id: string; label: string }[]>>({});
  const [ladefehler, setLadefehler] = useState(false);
  const geladenBereich = mitAuswahl ? direktTyp.bereich : null;
  useEffect(() => {
    if (!geladenBereich || listen[geladenBereich]) return;
    let aktiv = true;
    ladeDirektAuswahl(geladenBereich as "mietvertraege" | "einheiten" | "gebaeude").then(
      (a) => {
        if (aktiv) setListen((alt) => ({ ...alt, [geladenBereich]: a }));
      },
      () => {
        if (aktiv) setLadefehler(true);
      },
    );
    return () => {
      aktiv = false;
    };
  }, [geladenBereich, listen]);
  const [behoerdeOrdner, setBehoerdeOrdner] = useState(vorgabe?.bereich === "allgemein" && vorgabe.ordner ? vorgabe.ordner : BEHOERDE_ORDNER);
  // Direkt abgelegt wird mit gewähltem Bezug bzw. bei Behörde (Ordner statt Bezug).
  const direktAktiv = direktTyp !== null && (direktTyp.bereich === "allgemein" || auswahlId !== "");
  const ablegenWert = direktAktiv ? "direkt" : ablegen;
  const bereichWert = direktAktiv ? direktTyp.bereich : vorgabe?.bereich;
  const bezugWert = direktAktiv ? auswahlId : vorgabe?.bezugId;

  const maxMb = MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024);

  // Vorhandene Ordner zuerst, dann die noch nicht vorhandenen Standardvorschläge (ohne Dubletten,
  // Groß-/Kleinschreibung egal).
  const vorhanden = new Set(ordnerNamen.map((n) => n.toLowerCase()));
  const ordnerVorschlaege = [...ordnerNamen, ...ORDNER_VORSCHLAEGE.filter((n) => !vorhanden.has(n.toLowerCase()))];

  function pruefeDateien(e: React.ChangeEvent<HTMLInputElement>) {
    const dateien = [...(e.target.files ?? [])];
    const zuGross = ermittleZuGrosseDateien(e.target.files, MAX_DOKUMENT_GROESSE_BYTES);
    if (dateien.length > MAX_DATEIEN) {
      setGroessenFehler(`Bitte höchstens ${MAX_DATEIEN} Dateien auf einmal wählen.`);
      e.target.value = "";
    } else if (zuGross.length > 0) {
      setGroessenFehler(`Maximal ${maxMb} MB pro Datei: ${zuGross.map((f) => `${f.name} (${formatBytes(f.size)})`).join(", ")}.`);
      e.target.value = "";
    } else if (dateien.reduce((s, f) => s + f.size, 0) > 4 * 1024 * 1024) {
      setGroessenFehler("Die Dateien sind zusammen größer als 4 MB — bitte in zwei Uploads aufteilen.");
      e.target.value = "";
    } else {
      setGroessenFehler(null);
    }
  }

  return (
    <form action={formAction} className="rounded-lg border border-neutral-800 p-4">
      <h2 className="mb-3 text-lg font-medium text-white">Dokumente hochladen</h2>

      {vorgabe && (
        <fieldset className="mb-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-neutral-300">
          <label className="flex items-center gap-2">
            <input type="radio" checked={ablegen === "direkt"} onChange={() => setAblegen("direkt")} />
            Direkt in <strong className="font-medium text-white">{vorgabe.label}</strong> ablegen
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" checked={ablegen === "eingang"} onChange={() => setAblegen("eingang")} />
            In den Eingang (App erkennt und schlägt Bezüge vor)
          </label>
        </fieldset>
      )}
      <input type="hidden" name="ablegen" value={ablegenWert} />
      {ablegenWert === "direkt" && bereichWert && (
        <>
          <input type="hidden" name="bereich" value={bereichWert} />
          <input type="hidden" name="bezugId" value={bezugWert ?? ""} />
          {vorgabe && !direktAktiv && vorgabe.bereich === "allgemein" && (
            <div className="mb-3">
              <label className="mb-1 block text-xs text-neutral-400">Ordnername (optional)</label>
              <input name="ordner" list="dokument-ordner" defaultValue={vorgabe.ordner} maxLength={80} placeholder="z.B. Versicherungen" className={`${FELD} w-56`} />
              <datalist id="dokument-ordner">
                {ordnerVorschlaege.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          )}
        </>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <input
          type="file"
          name="file"
          multiple
          required
          onChange={pruefeDateien}
          className="text-sm text-neutral-300 file:mr-3 file:rounded-md file:border file:border-neutral-700 file:bg-neutral-900 file:px-3 file:py-2 file:text-sm file:text-white"
        />
        <div>
          <label className="mb-1 block text-xs text-neutral-400">Typ vorab (optional)</label>
          <select name="art" value={art} onChange={(e) => setArt(e.target.value)} className={FELD}>
            <option value="">App erkennt den Typ</option>
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
        <label className="flex h-[38px] items-center gap-2 text-sm text-neutral-300">
          <input type="checkbox" name="erkennen" value="1" checked={erkennen} onChange={(e) => setErkennen(e.target.checked)} className="h-4 w-4" />
          Inhalt automatisch erkennen
        </label>
        <button
          type="submit"
          disabled={pending || groessenFehler !== null}
          className="h-[38px] rounded-md bg-white px-3 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Lädt hoch und liest…" : "Hochladen"}
        </button>
      </div>
      {direktTyp && (
        <div className="mt-4 rounded-md border border-neutral-800 p-3">
          <p className="mb-3 text-xs text-neutral-500">
            {direktTyp.bereich === "allgemein" ? "Gleich ablegen" : `${direktTyp.bezug} gleich zuordnen (optional)`}:{" "}
            {direktTyp.bereich === "allgemein"
              ? direktTyp.hinweis.charAt(0).toUpperCase() + direktTyp.hinweis.slice(1)
              : `Mit Auswahl wird das Dokument sofort abgelegt, ${direktTyp.hinweis}`}
            . Der Inhalt wird nicht gelesen. Die Angaben gelten für alle gewählten Dateien.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            {mitAuswahl && geladenBereich && (
              <div className="w-96 max-w-full">
                <label className="mb-1 block text-xs text-neutral-400">{direktTyp.bezug}</label>
                {listen[geladenBereich] ? (
                  <MietvertragAuswahl
                    key={geladenBereich}
                    kandidaten={listen[geladenBereich]}
                    value={auswahlId}
                    onChange={(id) => setAuswahlIds((alt) => ({ ...alt, [geladenBereich]: id }))}
                    leerLabel="Keine (in den Eingang)"
                    size="md"
                  />
                ) : (
                  <div className={`${FELD} flex items-center text-neutral-500`}>{ladefehler ? "Auswahl konnte nicht geladen werden" : "Lädt…"}</div>
                )}
              </div>
            )}
            {direktTyp.bereich === "allgemein" && (
              <div>
                <label className="mb-1 block text-xs text-neutral-400">Ordner (Unkategorisiert)</label>
                <input name="ordner" list="dokument-ordner-direkt" value={behoerdeOrdner} onChange={(e) => setBehoerdeOrdner(e.target.value)} maxLength={80} className={`${FELD} w-64`} />
                <datalist id="dokument-ordner-direkt">
                  {[...new Set([BEHOERDE_ORDNER, ...ordnerVorschlaege])].map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-neutral-400">{direktTyp.datum}</label>
              <DateInput name="belegDatum" />
            </div>
            <div className="min-w-64 flex-1">
              <label className="mb-1 block text-xs text-neutral-400">Titel / Kurzbeschreibung (optional)</label>
              <input name="titel" maxLength={200} placeholder={direktTyp.titel} className={`${FELD} w-full`} />
            </div>
          </div>
        </div>
      )}
      <p className="mt-2 text-xs text-neutral-500">
        Bis zu {MAX_DATEIEN} Dateien auf einmal, je höchstens {maxMb} MB (zusammen 4 MB). Beim Erkennen liest Claude PDF und Bilder und füllt Typ,
        Aussteller, Betrag, Rechnungsnummer usw. vor; die Dokumente werden dafür an Anthropic übertragen. Verträge, Schreiben, Protokolle und
        Fotos liest die App nie automatisch, wenn du sie hier als Typ wählst — bei Mietverträgen und Mieterunterlagen also den Typ vorab wählen
        oder das Häkchen entfernen. Kostenbelege lassen sich auch direkt an der Kostenposition hochladen.
      </p>
      <GroessenFehler text={groessenFehler} />
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}
