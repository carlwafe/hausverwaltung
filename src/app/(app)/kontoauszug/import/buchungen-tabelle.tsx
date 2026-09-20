"use client";

import { Fragment, useActionState, useEffect, useState } from "react";
import { commitBuchungen, type BuchungsartKandidat, type BuchungCommitRow } from "./actions";
import {
  ermittleBuchungsartGruppe,
  type BuchungsartGruppe,
  type HinweisStatus,
  type VereinheitlichteZeile,
} from "@/lib/import/buchung-klassifizierung";
import type { BestehendeImportSets } from "./actions";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { useSpaltenSortierung, SortableTh } from "@/components/spalten-sortierung";
import { gruppiereKostenarten } from "@/lib/kostenart-gruppen";
import { gruppiereGebaeude, type EinheitMitAdresse } from "@/lib/gebaeude-gruppen";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";
import { datumBetragSchluessel } from "@/lib/import/bank-csv";
import { NichtKategorisiertButton } from "./nicht-kategorisiert-button";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// Vertraute Kurz-Bezeichnungen der alten 5 Sektionen statt der vollen (teils technischen)
// Buchungsart-Katalog-Bezeichnung ("Kosten (Ausgabe oder Gutschrift)", "Mietweiterleitung/Einlage
// Eigentümerin", …) — als Filter reicht die Familie, die konkrete Buchungsart wählt man ohnehin
// pro Zeile im eigenen Dropdown (dort bleibt die volle Katalog-Bezeichnung, z.B. um die 5
// Kaution-Varianten zu unterscheiden).
const FAMILIE_LABELS: Record<BuchungsartGruppe, string> = {
  MIETE: "Zahlungen",
  KOSTEN: "Kosten",
  MIETWEITERLEITUNG: "Mietweiterleitungen",
  KAUTION: "Kaution",
  NEBENKOSTENAUSGLEICH: "Nebenkostenausgleich",
  SONDERZAHLUNG: "Gebühren-Zahlung (Mieter)",
  SONSTIGE: "Weitere Buchungsart…",
};
const FAMILIE_OPTIONEN: { value: "alle" | BuchungsartGruppe; label: string }[] = [
  { value: "alle", label: "Alle Buchungsarten" },
  { value: "MIETE", label: FAMILIE_LABELS.MIETE },
  { value: "KOSTEN", label: FAMILIE_LABELS.KOSTEN },
  { value: "MIETWEITERLEITUNG", label: FAMILIE_LABELS.MIETWEITERLEITUNG },
  { value: "KAUTION", label: FAMILIE_LABELS.KAUTION },
  { value: "NEBENKOSTENAUSGLEICH", label: FAMILIE_LABELS.NEBENKOSTENAUSGLEICH },
  { value: "SONDERZAHLUNG", label: FAMILIE_LABELS.SONDERZAHLUNG },
  { value: "SONSTIGE", label: FAMILIE_LABELS.SONSTIGE },
];

// Sucht eine vierstellige Jahreszahl im Buchungstext (z.B. "BK-Abr. 2024") als Vorschlag fürs
// Abrechnungsjahr einer Nebenkostenausgleich-Zeile — findet sich keine (oder liegt der Treffer zu
// weit vom Buchungsdatum entfernt, um wirklich das Abrechnungsjahr zu sein), wird das Vorjahr des
// Buchungsdatums vorgeschlagen (eine Abrechnung wird typischerweise fürs Vorjahr beglichen).
function ermittleJahrVorschlag(verwendungszweck: string, buchungsdatum: string | null): string {
  const buchungsjahr = buchungsdatum ? Number(buchungsdatum.slice(0, 4)) : NaN;
  const vorjahrFallback = Number.isFinite(buchungsjahr) ? String(buchungsjahr - 1) : "";
  const treffer = /\b(19|20)\d{2}\b/.exec(verwendungszweck);
  if (treffer) {
    const gefundenesJahr = Number(treffer[0]);
    if (!Number.isFinite(buchungsjahr) || (gefundenesJahr >= buchungsjahr - 3 && gefundenesJahr <= buchungsjahr)) {
      return treffer[0];
    }
  }
  return vorjahrFallback;
}

// Bewusst nur drei Zustände (siehe buchung-klassifizierung.ts): "vorschlag" heißt, die aktuell
// gewählte Buchungsart wurde sicher erkannt (Muster oder eindeutiger Mietvertrags-/Kostenart-
// Treffer), "pruefen" heißt, es ist nur eine unsichere Vermutung, "fehler" eine Zeile mit
// Parse-Fehlern. Weicht die aktuelle Auswahl von jedem vorgeschlagenen Kandidaten ab (der Nutzer
// hat manuell umgeschaltet), wird keiner dieser drei Zustände gezeigt.
type HinweisAnzeige = "fehler" | HinweisStatus;

const HINWEIS_LABELS: Record<HinweisAnzeige, string> = {
  fehler: "Fehler",
  vorschlag: "Vorschlag übernommen",
  pruefen: "Bitte prüfen",
};

const HINWEIS_FARBEN: Record<HinweisAnzeige, string> = {
  fehler: "text-red-400",
  vorschlag: "text-green-400",
  pruefen: "text-amber-400",
};

const HINWEIS_OPTIONEN: { value: "alle" | HinweisAnzeige; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: HINWEIS_LABELS.vorschlag },
  { value: "pruefen", label: HINWEIS_LABELS.pruefen },
  { value: "fehler", label: HINWEIS_LABELS.fehler },
];

// Der Hinweis-Status der aktuell gewählten Buchungsart dieser Zeile — nicht der ursprünglich
// vorgeschlagenen. Passt die aktuelle Auswahl zu keinem der (ein oder zwei) Kandidaten aus der
// Klassifizierung (der Nutzer hat manuell umgeschaltet), gibt es keinen Status (null).
function hinweisFuerAuswahl(r: Pick<BuchungEditRow, "errors" | "buchungsartCode" | "kandidaten">): HinweisAnzeige | null {
  if (r.errors.length > 0) return "fehler";
  return r.kandidaten.find((k) => k.code === r.buchungsartCode)?.hinweis ?? null;
}

type BuchungEditRow = VereinheitlichteZeile & {
  buchungsartCode: string;
  mietvertragId: string;
  periodeMonat: number;
  periodeJahr: number;
  kostenartId: string;
  gebaeudeAuswahl: string;
  jahrEingabe: string;
  ausgewaehlt: boolean;
};

function pflichtfeldErfuellt(gruppe: BuchungsartGruppe | null, r: { mietvertragId: string; kostenartId: string }): boolean {
  if (!gruppe) return false;
  if (gruppe === "MIETE" || gruppe === "SONDERZAHLUNG") return Boolean(r.mietvertragId);
  if (gruppe === "KOSTEN") return Boolean(r.kostenartId);
  return true;
}

// Dedup-Prüfung fürs Anzeigen (Badge/Auto-Abwahl) — dieselben Schlüsselformeln wie serverseitig in
// commitBuchungen (actions.ts), pro Buchungsart-Familie. Der Betrag von VereinheitlichteZeile trägt
// immer das Rohvorzeichen der Bankbuchung (kommt aus zahlungZeile, siehe buchung-klassifizierung.ts)
// — nur für die Kosten-Familie wird er wie im Kosten-Import üblich negiert.
type BestehendeSets = {
  bestehendeZahlungen: Set<string>;
  bestehendeZahlungenDatumBetrag: Set<string>;
  bestehendeKosten: Set<string>;
  bestehendeMietweiterleitungen: Set<string>;
  bestehendeKautionsbuchungen: Set<string>;
  bestehendeNebenkostenausgleich: Set<string>;
};

function zuBestehendeSets(sets: BestehendeImportSets): BestehendeSets {
  return {
    bestehendeZahlungen: new Set(sets.bestehendeZahlungen),
    bestehendeZahlungenDatumBetrag: new Set(sets.bestehendeZahlungenDatumBetrag),
    bestehendeKosten: new Set(sets.bestehendeKosten),
    bestehendeMietweiterleitungen: new Set(sets.bestehendeMietweiterleitungen),
    bestehendeKautionsbuchungen: new Set(sets.bestehendeKautionsbuchungen),
    bestehendeNebenkostenausgleich: new Set(sets.bestehendeNebenkostenausgleich),
  };
}

function istBereitsImportiert(
  gruppe: BuchungsartGruppe | null,
  r: Pick<BuchungEditRow, "datum" | "betrag" | "name" | "verwendungszweck" | "mietvertragId">,
  sets: BestehendeSets,
): boolean {
  if (!gruppe || !r.datum || r.betrag === null) return false;
  const datum = r.datum;
  const betrag = r.betrag;
  const zweck = (r.verwendungszweck || "").trim().toLowerCase();
  switch (gruppe) {
    case "MIETE":
      if (r.mietvertragId) {
        return sets.bestehendeZahlungen.has(`${r.mietvertragId}|${datum}|${betrag.toFixed(2)}|${zweck}`);
      }
      return sets.bestehendeZahlungenDatumBetrag.has(`${datum}|${Math.abs(betrag).toFixed(2)}|${zweck}`);
    case "KOSTEN": {
      const empfaenger = (r.name || "").trim().toLowerCase();
      return sets.bestehendeKosten.has(`${empfaenger}|${datum}|${(-betrag).toFixed(2)}|${zweck}`);
    }
    case "MIETWEITERLEITUNG":
      return sets.bestehendeMietweiterleitungen.has(`${datum}|${betrag.toFixed(2)}|${zweck}`);
    case "KAUTION":
      return sets.bestehendeKautionsbuchungen.has(`${datum}|${betrag.toFixed(2)}|${zweck}`);
    case "NEBENKOSTENAUSGLEICH":
      // Bewusst großzügigerer Schlüssel (nur Datum+Betragshöhe, kein Verwendungszweck) — dieselbe
      // Formel wie bestehendeNebenkostenausgleich in actions.ts (datumBetragSchluessel). Die
      // tatsächliche Commit-Dedup-Prüfung ist strenger (mit Verwendungszweck) und läuft frisch bei
      // commitBuchungen selbst.
      return sets.bestehendeNebenkostenausgleich.has(datumBetragSchluessel(new Date(datum), betrag));
    default:
      return false;
  }
}

function istBereitsGemerkt(r: Pick<BuchungEditRow, "datum" | "betrag">, bestehendeNichtZugeordnet: Set<string>): boolean {
  if (!r.datum || r.betrag === null) return false;
  return bestehendeNichtZugeordnet.has(datumBetragSchluessel(new Date(r.datum), r.betrag));
}

function toBuchungEditRow(r: VereinheitlichteZeile, sets: BestehendeSets): BuchungEditRow {
  const [jahr, monat] = r.datum ? r.datum.split("-").map(Number) : [new Date().getFullYear(), 1];
  const buchungsartCode = r.kandidaten[0]?.code ?? "";
  const gruppe = ermittleBuchungsartGruppe(buchungsartCode);
  const row = {
    ...r,
    buchungsartCode,
    mietvertragId: r.vorgeschlagenerMietvertragId ?? "",
    periodeMonat: monat,
    periodeJahr: jahr,
    kostenartId: r.vorgeschlageneKostenartId ?? "",
    gebaeudeAuswahl: r.vorgeschlageneGebaeudeAuswahl ?? "",
    jahrEingabe: gruppe === "NEBENKOSTENAUSGLEICH" ? ermittleJahrVorschlag(r.verwendungszweck, r.datum) : String(jahr),
    ausgewaehlt: false,
  };
  row.ausgewaehlt =
    r.errors.length === 0 && pflichtfeldErfuellt(gruppe, row) && !istBereitsImportiert(gruppe, row, sets);
  return row;
}

export function BuchungenTabelle({
  zeilen,
  buchungsarten,
  mietvertragKandidaten,
  kostenarten,
  gebaeude,
  einheiten,
  bestehendeSets: bestehendeImportSets,
  bestehendeNichtZugeordnetListe,
  importBatchId,
  onCommitted,
}: {
  zeilen: VereinheitlichteZeile[];
  buchungsarten: BuchungsartKandidat[];
  mietvertragKandidaten: { id: string; label: string }[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  gebaeude: {
    id: string;
    label: string;
    strasse: string;
    hausnummer: string;
    haus: { id: string } | null;
    kostengruppen: { id: string; bezeichnung: string }[];
  }[];
  einheiten: EinheitMitAdresse[];
  bestehendeSets: BestehendeImportSets;
  bestehendeNichtZugeordnetListe: string[];
  importBatchId: string;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitBuchungen, null);
  const bestehendeSets = zuBestehendeSets(bestehendeImportSets);
  const bestehendeNichtZugeordnet = new Set(bestehendeNichtZugeordnetListe);
  const [editRows, setEditRows] = useState<BuchungEditRow[]>(() => zeilen.map((r) => toBuchungEditRow(r, bestehendeSets)));
  const [hinweisFilter, setHinweisFilter] = useState<"alle" | HinweisAnzeige>("alle");
  const [familieFilter, setFamilieFilter] = useState<"alle" | BuchungsartGruppe>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.name);
  const gebaeudeGruppen = gruppiereGebaeude(gebaeude, einheiten);

  function updateRow(rowNumber: number, patch: Partial<BuchungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function handleBuchungsartChange(r: BuchungEditRow, code: string) {
    const gruppe = ermittleBuchungsartGruppe(code);
    updateRow(r.rowNumber, {
      buchungsartCode: code,
      ausgewaehlt:
        r.errors.length === 0 && pflichtfeldErfuellt(gruppe, r) && !istBereitsImportiert(gruppe, r, bestehendeSets),
    });
  }

  // Oberkategorie-Wechsel im zweistufigen Buchungsart-Dropdown: für Familien mit genau einem
  // Katalog-Code (alle außer Kaution) direkt diesen setzen; bei Kaution auf die häufigste
  // Unterkategorie vorbelegen — die Unter-Auswahl erscheint dann als zweites Feld daneben.
  // Frei angelegte Buchungsarten (siehe /buchungsarten) — nur solche mit echtem Geldfluss, denn nur
  // die lassen sich aus einer Bankzeile importieren.
  const sonstigeArten = buchungsarten.filter(
    (b) => ermittleBuchungsartGruppe(b.code) === "SONSTIGE" && b.zahlungswirksam && b.code !== "MAHNGEBUEHR",
  );

  function handleFamilieChange(r: BuchungEditRow, familie: BuchungsartGruppe | "") {
    let code = "";
    if (familie === "MIETE") code = "MIETZAHLUNG";
    else if (familie === "KOSTEN") code = "KOSTENPOSITION";
    else if (familie === "MIETWEITERLEITUNG") code = "MIETWEITERLEITUNG";
    else if (familie === "NEBENKOSTENAUSGLEICH") code = "NEBENKOSTENAUSGLEICH";
    else if (familie === "SONDERZAHLUNG") code = "SONDERZAHLUNG";
    else if (familie === "SONSTIGE") code = sonstigeArten[0]?.code ?? "";
    else if (familie === "KAUTION") {
      code =
        buchungsarten.find((b) => b.code === "KAUTION_EINZAHLUNG")?.code ??
        buchungsarten.find((b) => b.code.startsWith("KAUTION_"))?.code ??
        "";
    }
    handleBuchungsartChange(r, code);
  }

  const gefilterteRows = editRows.filter((r) => {
    if (hinweisFilter !== "alle" && hinweisFuerAuswahl(r) !== hinweisFilter) return false;
    // Familie-Filter prüft gegen ALLE Kandidaten dieser Zeile, nicht nur die aktuell gewählte
    // Buchungsart — eine unsichere Zeile mit zwei Kandidaten (Miete + Kosten, beide "bitte
    // prüfen") bleibt so unter BEIDEN Filtern auffindbar, bis sie einer Seite zugeordnet wird.
    if (familieFilter !== "alle" && !r.kandidaten.some((k) => ermittleBuchungsartGruppe(k.code) === familieFilter)) {
      return false;
    }
    return true;
  });
  const { sortiert: sortierteRows, spalte: sortSpalte, richtung: sortRichtung, toggleSort } = useSpaltenSortierung(
    gefilterteRows,
    (r, spalte) => {
      switch (spalte) {
        case "datum":
          return r.datum;
        case "betrag":
          return r.betrag;
        case "text":
          return r.verwendungszweck || r.name;
        default:
          return null;
      }
    },
  );

  function kannAuswaehlen(r: BuchungEditRow): boolean {
    const gruppe = ermittleBuchungsartGruppe(r.buchungsartCode);
    return r.errors.length === 0 && pflichtfeldErfuellt(gruppe, r);
  }

  const auswaehlbareRows = gefilterteRows.filter(kannAuswaehlen);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) => (sichtbareRowNumbers.has(r.rowNumber) && kannAuswaehlen(r) ? { ...r, ausgewaehlt: checked } : r)),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt && kannAuswaehlen(r));
  const rowsForCommit: BuchungCommitRow[] = importierbareRows.map((r) => {
    const gruppe = ermittleBuchungsartGruppe(r.buchungsartCode);
    // Kosten-Import-Konvention: Kostenposition.betrag ist der negierte Rohbetrag der Bankbuchung
    // (siehe kosten-import.ts) — VereinheitlichteZeile.betrag trägt dagegen immer das
    // Rohvorzeichen (kommt aus der Zahlungs-Klassifizierung). Nur beim Absenden als Kosten wird
    // deshalb hier negiert, nicht schon beim Einlesen — sonst würde ein manueller
    // Buchungsart-Wechsel zwischen Miete/Kosten den Betrag falsch übernehmen.
    const betrag = gruppe === "KOSTEN" ? -(r.betrag ?? 0) : (r.betrag ?? 0);
    return {
      buchungsartCode: r.buchungsartCode,
      datum: r.datum ?? "",
      betrag,
      empfaenger: r.name || null,
      verwendungszweck: r.verwendungszweck,
      rohdaten: r.rohdaten,
      mietvertragId: gruppe === "MIETE" || gruppe === "KAUTION" || gruppe === "NEBENKOSTENAUSGLEICH" || gruppe === "SONDERZAHLUNG" || gruppe === "SONSTIGE" ? r.mietvertragId || null : undefined,
      periodeMonat: gruppe === "MIETE" ? r.periodeMonat : undefined,
      periodeJahr: gruppe === "MIETE" ? r.periodeJahr : undefined,
      kostenartId: gruppe === "KOSTEN" ? r.kostenartId : undefined,
      gebaeudeAuswahl: gruppe === "KOSTEN" ? r.gebaeudeAuswahl : undefined,
      jahr: gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH" ? (r.jahrEingabe ? Number(r.jahrEingabe) : null) : undefined,
    };
  });

  useEffect(() => {
    if (commitMessage) onCommitted();
  }, [commitMessage, onCommitted]);

  // Siehe ausführlicher Kommentar zum gleichen Muster in den früheren, jetzt ersetzten
  // Sektionen: bewusst kein einmaliger Abgleich beim commitMessage-Wechsel (bestehendeSets ist
  // dann noch der Stand von vor dem asynchronen Refresh in onCommitted), sondern bei jedem Render
  // neu geprüft und nur bei Bedarf angepasst — die Tabelle bleibt danach für eine weitere
  // Import-Runde bedienbar, statt durch eine statische Erfolgsmeldung ersetzt zu werden.
  const nochAbzuwaehlen = editRows.some(
    (r) => r.ausgewaehlt && kannAuswaehlen(r) && istBereitsImportiert(ermittleBuchungsartGruppe(r.buchungsartCode), r, bestehendeSets),
  );
  if (nochAbzuwaehlen) {
    setEditRows((rs) =>
      rs.map((r) =>
        r.ausgewaehlt && kannAuswaehlen(r) && istBereitsImportiert(ermittleBuchungsartGruppe(r.buchungsartCode), r, bestehendeSets)
          ? { ...r, ausgewaehlt: false }
          : r,
      ),
    );
  }

  return (
    <div>
      {commitMessage && (
        <div className="mb-3 rounded-md border border-green-900 bg-green-950/30 px-4 py-2 text-sm text-green-400">
          {commitMessage}
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-medium text-white">
          Buchungen ({editRows.length} Zeile{editRows.length === 1 ? "" : "n"})
        </h2>
        <div className="flex items-center gap-3">
          <select
            value={hinweisFilter}
            onChange={(e) => setHinweisFilter(e.target.value as "alle" | HinweisAnzeige)}
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          >
            {HINWEIS_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <select
            value={familieFilter}
            onChange={(e) => setFamilieFilter(e.target.value as "alle" | BuchungsartGruppe)}
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          >
            {FAMILIE_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[560px] overflow-auto rounded-lg border border-neutral-800 pb-32">
        <table className="w-full text-sm">
          <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={alleAusgewaehlt}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck / Name" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="min-w-[160px] px-3 py-2">Buchungsart</th>
              <th className="min-w-[220px] px-3 py-2">Details</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
              <th className="px-3 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {sortierteRows.map((r) => {
              const gruppe = ermittleBuchungsartGruppe(r.buchungsartCode);
              const bereitsImportiert = istBereitsImportiert(gruppe, r, bestehendeSets);
              const bereitsGemerkt = istBereitsGemerkt(r, bestehendeNichtZugeordnet);
              const auswaehlbar = kannAuswaehlen(r);
              const expanded = expandedRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={!auswaehlbar}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <div className="flex flex-col gap-1">
                        <select
                          value={gruppe ?? ""}
                          disabled={r.errors.length > 0}
                          onChange={(e) => handleFamilieChange(r, e.target.value as BuchungsartGruppe | "")}
                          className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                        >
                          <option value="">– bitte wählen –</option>
                          <option value="MIETE">{FAMILIE_LABELS.MIETE}</option>
                          <option value="KOSTEN">{FAMILIE_LABELS.KOSTEN}</option>
                          <option value="MIETWEITERLEITUNG">{FAMILIE_LABELS.MIETWEITERLEITUNG}</option>
                          <option value="KAUTION">{FAMILIE_LABELS.KAUTION}</option>
                          <option value="NEBENKOSTENAUSGLEICH">{FAMILIE_LABELS.NEBENKOSTENAUSGLEICH}</option>
                          <option value="SONDERZAHLUNG">{FAMILIE_LABELS.SONDERZAHLUNG}</option>
                          {sonstigeArten.length > 0 && <option value="SONSTIGE">{FAMILIE_LABELS.SONSTIGE}</option>}
                        </select>
                        {gruppe === "SONSTIGE" && (
                          <select
                            value={r.buchungsartCode}
                            onChange={(e) => handleBuchungsartChange(r, e.target.value)}
                            className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                          >
                            {sonstigeArten.map((b) => (
                              <option key={b.id} value={b.code}>
                                {b.bezeichnung}
                              </option>
                            ))}
                          </select>
                        )}
                        {gruppe === "KAUTION" && (
                          <select
                            value={r.buchungsartCode}
                            onChange={(e) => handleBuchungsartChange(r, e.target.value)}
                            className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                          >
                            {buchungsarten
                              .filter((b) => b.code.startsWith("KAUTION_"))
                              .map((b) => (
                                <option key={b.id} value={b.code}>
                                  {b.bezeichnung.replace(/^Kaution:\s*/, "")}
                                </option>
                              ))}
                          </select>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5">
                      {gruppe === "MIETE" && (
                        <div className="flex flex-col gap-1">
                          <MietvertragAuswahl
                            kandidaten={mietvertragKandidaten}
                            value={r.mietvertragId}
                            leerLabel="– Mietvertrag wählen –"
                            onChange={(id) =>
                              updateRow(r.rowNumber, {
                                mietvertragId: id,
                                ausgewaehlt: r.errors.length === 0 && Boolean(id) && !bereitsImportiert,
                              })
                            }
                          />
                          <div className="flex gap-1">
                            <select
                              value={r.periodeMonat}
                              onChange={(e) => updateRow(r.rowNumber, { periodeMonat: Number(e.target.value) })}
                              className="rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                            >
                              {MONATE.map((m, idx) => (
                                <option key={m} value={idx + 1}>
                                  {m}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              value={r.periodeJahr}
                              onChange={(e) => updateRow(r.rowNumber, { periodeJahr: Number(e.target.value) })}
                              className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                            />
                          </div>
                        </div>
                      )}
                      {gruppe === "KOSTEN" && (
                        <div className="flex flex-col gap-1">
                          <select
                            value={r.kostenartId}
                            onChange={(e) =>
                              updateRow(r.rowNumber, {
                                kostenartId: e.target.value,
                                ausgewaehlt: r.errors.length === 0 && Boolean(e.target.value) && !bereitsImportiert,
                              })
                            }
                            className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                          >
                            <option value="">– Kostenart wählen –</option>
                            {kostenartGruppen.map((gruppe2) =>
                              gruppe2.label ? (
                                <optgroup key={gruppe2.label} label={gruppe2.label}>
                                  {gruppe2.items.map((k) => (
                                    <option key={k.id} value={k.id}>
                                      {k.name}
                                      {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                                    </option>
                                  ))}
                                </optgroup>
                              ) : (
                                gruppe2.items.map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.name}
                                    {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                                  </option>
                                ))
                              ),
                            )}
                          </select>
                          <select
                            value={r.gebaeudeAuswahl}
                            onChange={(e) => updateRow(r.rowNumber, { gebaeudeAuswahl: e.target.value })}
                            className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                          >
                            <option value="">– Objekt gesamt –</option>
                            {gebaeudeGruppen.map((gruppe3) => (
                              <optgroup key={gruppe3.label} label={gruppe3.label}>
                                {gruppe3.optionen.map((g) => (
                                  <option key={g.value} value={g.value}>
                                    {g.label}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={r.jahrEingabe}
                            onChange={(e) => updateRow(r.rowNumber, { jahrEingabe: e.target.value })}
                            placeholder="Jahr"
                            className="w-20 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                          />
                        </div>
                      )}
                      {(gruppe === "KAUTION" || gruppe === "NEBENKOSTENAUSGLEICH" || gruppe === "SONSTIGE") && (
                        <div className="flex flex-col gap-1">
                          <MietvertragAuswahl
                            kandidaten={mietvertragKandidaten}
                            value={r.mietvertragId}
                            leerLabel="– keinem Mietvertrag zuordnen –"
                            onChange={(id) => updateRow(r.rowNumber, { mietvertragId: id })}
                          />
                          {gruppe === "NEBENKOSTENAUSGLEICH" && (
                            <input
                              type="number"
                              value={r.jahrEingabe}
                              onChange={(e) => updateRow(r.rowNumber, { jahrEingabe: e.target.value })}
                              placeholder="Abrechnungsjahr (optional)"
                              className="w-full rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                            />
                          )}
                        </div>
                      )}
                      {gruppe === "SONDERZAHLUNG" && (
                        <MietvertragAuswahl
                          kandidaten={mietvertragKandidaten}
                          value={r.mietvertragId}
                          leerLabel="– Mietvertrag wählen –"
                          onChange={(id) => updateRow(r.rowNumber, { mietvertragId: id })}
                        />
                      )}
                      {gruppe === "MIETWEITERLEITUNG" && <span className="text-xs text-neutral-500">–</span>}
                      {!gruppe && <span className="text-xs text-neutral-500">Buchungsart wählen</span>}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : (
                        (() => {
                          const hinweis = hinweisFuerAuswahl(r);
                          return hinweis ? (
                            <span className={HINWEIS_FARBEN[hinweis]}>{HINWEIS_LABELS[hinweis]}</span>
                          ) : (
                            <span className="text-neutral-500">Manuell gewählt</span>
                          );
                        })()
                      )}
                      {r.errors.length === 0 && bereitsImportiert && (
                        <span className="ml-1 text-amber-400">
                          bereits importiert{!r.ausgewaehlt ? " – wird übersprungen" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton expanded={expanded} onClick={() => setExpandedRow(expanded ? null : r.rowNumber)} />
                    </td>
                    <td className="px-3 py-1.5">
                      <NichtKategorisiertButton
                        datum={r.datum}
                        betrag={r.betrag}
                        empfaenger={r.name}
                        verwendungszweck={r.verwendungszweck}
                        rohdaten={r.rohdaten}
                        importBatchId={importBatchId}
                        quelle="Buchungen"
                        bereitsGemerkt={bereitsGemerkt}
                        onParked={onCommitted}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={9} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Buchungen importieren`}
        </button>
      </form>
    </div>
  );
}
