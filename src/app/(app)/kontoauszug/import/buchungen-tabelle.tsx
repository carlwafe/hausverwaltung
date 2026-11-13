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
import { ermittleKostenjahrVorschlag } from "@/lib/import/kostenjahr";
import { DateInput } from "@/components/date-input";
import { verlangtBezugsbereit } from "@/lib/anlage-v";
import { NichtKategorisiertButton } from "./nicht-kategorisiert-button";
import { kiPruefeZeilen } from "./ki-actions";
import type { KiEingabeZeile } from "@/lib/import/ki-klassifizierung";
import { mietperiodeFuerVertrag, periodeLabel, type PeriodenKontext } from "@/lib/import/mietperiode";
import { findePlanRate, type DarlehenPlanRate } from "@/lib/darlehen-plan-match";
import { erkenneDarlehen } from "@/lib/darlehen-erkennung";

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
  DARLEHEN: "Darlehensrate (Zins + Tilgung)",
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
  { value: "DARLEHEN", label: FAMILIE_LABELS.DARLEHEN },
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

// Der Hinweis-Filter trennt jeweils "noch nicht importiert" von "bereits importiert": eine schon
// importierte Zeile mit Vorschlag/Prüf-Hinweis soll die Arbeitsliste der noch offenen Zeilen nicht
// verstopfen, muss aber separat auffindbar bleiben.
type HinweisFilter =
  | "alle"
  | "vorschlag"
  | "vorschlag_bereits"
  | "pruefen"
  | "pruefen_bereits"
  // Zahlungen, deren Mietmonat vom Eingangsmonat abweicht (Monatsende, Monat im Text …) — zum Durchsehen.
  | "monat_abweichend"
  // Zeilen, denen die KI bei „Ausgewählte mit KI prüfen“ widersprochen hat.
  | "ki_widerspruch";

const HINWEIS_OPTIONEN: { value: HinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: "Vorgeschlagen" },
  { value: "vorschlag_bereits", label: "Vorgeschlagen + bereits importiert" },
  { value: "pruefen", label: HINWEIS_LABELS.pruefen },
  { value: "pruefen_bereits", label: `${HINWEIS_LABELS.pruefen} + bereits importiert` },
  { value: "monat_abweichend", label: "Mietmonat ≠ Eingangsmonat" },
  { value: "ki_widerspruch", label: "KI-Widerspruch" },
];

// Zahlung, deren Mietmonat nicht der Monat des Eingangs ist.
function monatWeichtAb(r: Pick<BuchungEditRow, "datum" | "periodeJahr" | "periodeMonat">): boolean {
  return Boolean(r.datum) && (r.periodeJahr !== Number(r.datum!.slice(0, 4)) || r.periodeMonat !== Number(r.datum!.slice(5, 7)));
}

function passtZuHinweisFilter(filter: HinweisFilter, hinweis: HinweisAnzeige | null, bereitsImportiert: boolean): boolean {
  if (filter === "alle") return true;
  const bereitsFilter = filter.endsWith("_bereits");
  const art = bereitsFilter ? filter.slice(0, -"_bereits".length) : filter;
  return hinweis === art && bereitsImportiert === bereitsFilter;
}

// Der Hinweis-Status der aktuell gewählten Buchungsart dieser Zeile — nicht der ursprünglich
// vorgeschlagenen. Passt die aktuelle Auswahl zu keinem der (ein oder zwei) Kandidaten aus der
// Klassifizierung (der Nutzer hat manuell umgeschaltet), gibt es keinen Status (null).
function hinweisFuerAuswahl(r: Pick<BuchungEditRow, "errors" | "buchungsartCode" | "kandidaten">): HinweisAnzeige | null {
  if (r.errors.length > 0) return "fehler";
  return r.kandidaten.find((k) => k.code === r.buchungsartCode)?.hinweis ?? null;
}

// Status des ursprünglichen Vorschlags (erster Kandidat) — für den Filter, ändert sich nicht, wenn
// der Nutzer die Zeile anders kategorisiert.
function hinweisFuerVorschlag(r: Pick<BuchungEditRow, "errors" | "kandidaten">): HinweisAnzeige | null {
  if (r.errors.length > 0) return "fehler";
  return r.kandidaten[0]?.hinweis ?? null;
}

type BuchungEditRow = VereinheitlichteZeile & {
  buchungsartCode: string;
  mietvertragId: string;
  periodeMonat: number;
  periodeJahr: number;
  kostenartId: string;
  gebaeudeAuswahl: string;
  jahrEingabe: string;
  // yyyy-mm-dd, nur bei Kostenart „Anschaffung / Herstellung“ (Pflicht): ab wann die Wohnung bezugsbereit war.
  bezugsbereitAb: string;
  // Nur Darlehensrate: Zinsanteil in Euro laut Tilgungsplan (Text, deutsches Komma erlaubt), der Rest ist Tilgung.
  zinsanteil: string;
  // Nur Darlehensrate: das Darlehen der Stammdaten, zu dem die Rate gehört (Pflicht, sofern es aktive Darlehen gibt).
  darlehenId: string;
  // Nur Darlehen: Sonderbuchung (z.B. Verzugszinsen) statt Rate — der ganze Betrag ist Zins, kein Tilgungsanteil, kein Monat.
  darlehenSonder: boolean;
  // Begründung des Mietperioden-Vorschlags (Monatsende → Folgemonat, Monat aus dem Text …), null = Buchungsmonat.
  periodeHinweis: string | null;
  ausgewaehlt: boolean;
  // KI-Zweitmeinung (manuell ausgelöst, siehe runKiPruefung). Bei „Ausgewählte prüfen“ zusätzlich, ob die KI der
  // Zuordnung zustimmt (passt) — und bei Widerspruch ihr Korrekturvorschlag, den man mit „Übernehmen“ setzt.
  ki?: {
    kommentar: string;
    konfidenz: "hoch" | "mittel" | "niedrig";
    passt?: boolean | null;
    korrektur?: KiKorrektur | null;
  };
};

type KiKorrektur = {
  buchungsartCode: string | null;
  mietvertragId: string | null;
  kostenartId: string | null;
  jahr: number | null;
  periodeJahr: number | null;
  periodeMonat: number | null;
};

// Zinsanteil einer Darlehensrate als Zahl (Komma oder Punkt); leer = 0 = die ganze Rate ist Tilgung, NaN = ungültig.
function zinsanteilZahl(text: string): number {
  const t = text.trim().replace(",", ".");
  return t === "" ? 0 : Number(t);
}

function pflichtfeldErfuellt(
  gruppe: BuchungsartGruppe | null,
  r: { mietvertragId: string; kostenartId: string; zinsanteil?: string; betrag?: number | null; darlehenId?: string; darlehenSonder?: boolean },
  darlehenPflicht = false,
): boolean {
  if (!gruppe) return false;
  if (gruppe === "MIETE" || gruppe === "SONDERZAHLUNG") return Boolean(r.mietvertragId);
  if (gruppe === "KOSTEN") return Boolean(r.kostenartId);
  if (gruppe === "DARLEHEN") {
    if (darlehenPflicht && !r.darlehenId) return false;
    // Sonderbuchung: der ganze Betrag ist Zins (nur Abbuchung) und braucht die Kostenart „Schuldzinsen“.
    if (r.darlehenSonder) return Boolean(r.kostenartId) && (r.betrag ?? 0) < 0;
    const zins = zinsanteilZahl(r.zinsanteil ?? "");
    if (!Number.isFinite(zins) || zins < 0) return false;
    if (zins === 0) return true;
    return Boolean(r.kostenartId) && (r.betrag ?? 0) < 0 && zins <= Math.abs(r.betrag ?? 0) + 0.005;
  }
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
  bestehendeRohdaten: Set<string>;
  // Bereits als "nicht kategorisiert" gemerkte Buchungen (Datum+Betrag) — zählen wie importiert.
  gemerkt: Set<string>;
};

function zuBestehendeSets(sets: BestehendeImportSets, gemerkt: string[]): BestehendeSets {
  return {
    bestehendeZahlungen: new Set(sets.bestehendeZahlungen),
    bestehendeZahlungenDatumBetrag: new Set(sets.bestehendeZahlungenDatumBetrag),
    bestehendeKosten: new Set(sets.bestehendeKosten),
    bestehendeMietweiterleitungen: new Set(sets.bestehendeMietweiterleitungen),
    bestehendeKautionsbuchungen: new Set(sets.bestehendeKautionsbuchungen),
    bestehendeNebenkostenausgleich: new Set(sets.bestehendeNebenkostenausgleich),
    bestehendeRohdaten: new Set(sets.bestehendeRohdaten),
    gemerkt: new Set(gemerkt),
  };
}

function istBereitsImportiert(
  gruppe: BuchungsartGruppe | null,
  r: Pick<BuchungEditRow, "datum" | "betrag" | "name" | "verwendungszweck" | "mietvertragId" | "rohdatenSchluessel" | "rohdatenSchluesselWeitere">,
  sets: BestehendeSets,
): boolean {
  if (!r.datum || r.betrag === null) return false;
  // Artunabhängig: hängt die Bankzeile schon an irgendeiner aktiven Buchung (auch unter anderer
  // Buchungsart, z.B. nach einer Umbuchung), gilt sie als importiert.
  if (r.rohdatenSchluessel && sets.bestehendeRohdaten.has(r.rohdatenSchluessel)) return true;
  if (r.rohdatenSchluesselWeitere?.some((k) => sets.bestehendeRohdaten.has(k))) return true;
  if (sets.gemerkt.has(datumBetragSchluessel(new Date(r.datum), r.betrag))) return true;
  if (!gruppe) return false;
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
    // Mietperiode aus previewImport (Monatsende → Folgemonat, Monat aus dem Verwendungszweck, …), sonst Buchungsmonat.
    periodeMonat: r.vorgeschlagenePeriode?.monat ?? monat,
    periodeJahr: r.vorgeschlagenePeriode?.jahr ?? jahr,
    periodeHinweis: r.vorgeschlagenePeriode?.hinweis ?? null,
    kostenartId: r.vorgeschlageneKostenartId ?? "",
    gebaeudeAuswahl: r.vorgeschlageneGebaeudeAuswahl ?? "",
    jahrEingabe:
      gruppe === "NEBENKOSTENAUSGLEICH"
        ? ermittleJahrVorschlag(r.verwendungszweck, r.datum)
        : String(ermittleKostenjahrVorschlag(r.verwendungszweck, r.datum) ?? jahr),
    bezugsbereitAb: "",
    zinsanteil: "",
    darlehenId: "",
    darlehenSonder: false,
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
  darlehenRaten,
  darlehenListe,
  gebaeude,
  einheiten,
  bestehendeSets: bestehendeImportSets,
  bestehendeNichtZugeordnetListe,
  importBatchId,
  periodenKontext,
  onCommitted,
}: {
  zeilen: VereinheitlichteZeile[];
  buchungsarten: BuchungsartKandidat[];
  mietvertragKandidaten: { id: string; label: string }[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean; anschaffung?: boolean; schuldzinsen?: boolean }[];
  darlehenRaten: DarlehenPlanRate[];
  darlehenListe: { id: string; label: string; darlehensnummer: string | null }[];
  gebaeude: {
    id: string;
    label: string;
    strasse: string;
    hausnummer: string;
    haus: { id: string; reihenfolge: number | null } | null;
    kostengruppen: { id: string; bezeichnung: string }[];
  }[];
  einheiten: EinheitMitAdresse[];
  bestehendeSets: BestehendeImportSets;
  bestehendeNichtZugeordnetListe: string[];
  importBatchId: string;
  periodenKontext: PeriodenKontext;
  onCommitted: () => void;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitBuchungen, null);
  const bestehendeSets = zuBestehendeSets(bestehendeImportSets, bestehendeNichtZugeordnetListe);
  const bestehendeNichtZugeordnet = new Set(bestehendeNichtZugeordnetListe);
  const [editRows, setEditRows] = useState<BuchungEditRow[]>(() => zeilen.map((r) => toBuchungEditRow(r, bestehendeSets)));
  const [hinweisFilter, setHinweisFilter] = useState<HinweisFilter>("alle");
  const [familieFilter, setFamilieFilter] = useState<"alle" | BuchungsartGruppe>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [kiPending, setKiPending] = useState<"offen" | "ausgewaehlt" | null>(null);
  const [kiMeldung, setKiMeldung] = useState<string | null>(null);
  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.name);
  const gebaeudeGruppen = gruppiereGebaeude(gebaeude, einheiten);

  function updateRow(rowNumber: number, patch: Partial<BuchungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  // Zeilen, die die Regeln nicht sicher zugeordnet haben und die noch keine KI-Einschätzung haben.
  const kiKandidaten = editRows.filter(
    (r) =>
      r.errors.length === 0 &&
      !r.ki &&
      hinweisFuerAuswahl(r) !== "vorschlag" &&
      !istBereitsImportiert(ermittleBuchungsartGruppe(r.buchungsartCode), r, bestehendeSets),
  );

  // Bisherige Mietzahlungen des Vertrags für die KI („28.10.2026 550,00 € → 11/2026“): gebuchte plus frühere
  // ausgewählte Zeilen derselben Datei mit ihrem aktuellen Monat.
  function verlaufFuer(r: BuchungEditRow): string[] {
    if (!r.mietvertragId || !r.datum) return [];
    const gebucht = (periodenKontext.historie[r.mietvertragId] ?? []).map((h) => ({
      datum: h.datum,
      betrag: h.betrag,
      periode: periodeLabel({ jahr: h.periodeJahr, monat: h.periodeMonat }),
    }));
    const ausDatei = editRows
      .filter(
        (x) =>
          x.rowNumber !== r.rowNumber &&
          x.ausgewaehlt &&
          x.mietvertragId === r.mietvertragId &&
          ermittleBuchungsartGruppe(x.buchungsartCode) === "MIETE" &&
          x.datum !== null &&
          x.betrag !== null,
      )
      .map((x) => ({ datum: x.datum!, betrag: x.betrag!, periode: periodeLabel({ jahr: x.periodeJahr, monat: x.periodeMonat }) }));
    return [...gebucht, ...ausDatei]
      .filter((h) => h.datum < r.datum!)
      .sort((a, b) => a.datum.localeCompare(b.datum))
      .slice(-8)
      .map((h) => `${h.datum.split("-").reverse().join(".")} ${formatEuro(h.betrag)} → ${h.periode}`);
  }

  function kiZeile(r: BuchungEditRow, mitAktuell: boolean): KiEingabeZeile {
    const gruppe = ermittleBuchungsartGruppe(r.buchungsartCode);
    const miete = gruppe === "MIETE";
    return {
      rowNumber: r.rowNumber,
      datum: r.datum,
      betrag: r.betrag,
      name: r.name,
      verwendungszweck: r.verwendungszweck,
      aktuell: mitAktuell
        ? {
            buchungsartCode: r.buchungsartCode,
            mietvertragId: r.mietvertragId || null,
            periode: miete ? periodeLabel({ jahr: r.periodeJahr, monat: r.periodeMonat }) : null,
            kostenartId: gruppe === "KOSTEN" ? r.kostenartId || null : null,
            jahr: (gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH") && r.jahrEingabe ? Number(r.jahrEingabe) : null,
            regelHinweis: miete ? r.periodeHinweis : null,
          }
        : null,
      verlauf: verlaufFuer(r),
      sollMiete: r.mietvertragId ? (periodenKontext.vertraege[r.mietvertragId]?.warmmiete ?? null) : null,
    };
  }

  // „offen“: unsichere Zeilen klassifizieren (Vorschläge werden vorbelegt, nie ausgewählt). „ausgewaehlt“: die zum
  // Import ausgewählten Zeilen samt Mietperiode prüfen — Zeilen, denen die KI widerspricht, werden abgewählt und
  // zeigen ihren Vorschlag zum Übernehmen.
  async function runKiPruefung(modus: "offen" | "ausgewaehlt") {
    setKiMeldung(null);
    setKiPending(modus);
    const pruefen = modus === "ausgewaehlt";
    // Zahlungen desselben Mieters nebeneinander, damit sie im selben Batch landen (die KI sieht dann die ganze Folge).
    const quelle = pruefen
      ? [...kiAusgewaehlt].sort((a, b) => a.mietvertragId.localeCompare(b.mietvertragId) || (a.datum ?? "").localeCompare(b.datum ?? ""))
      : kiKandidaten;
    try {
      const antwort = await kiPruefeZeilen(
        quelle.map((r) => kiZeile(r, pruefen)),
        {
          buchungsarten: buchungsarten
            .filter((b) => b.zahlungswirksam && b.code !== "MAHNGEBUEHR")
            .map((b) => ({ code: b.code, bezeichnung: b.bezeichnung })),
          kostenarten,
          mietvertraege: mietvertragKandidaten,
        },
      );
      if (typeof antwort === "string") {
        setKiMeldung(antwort);
        return;
      }
      const nachRow = new Map(antwort.vorschlaege.map((v) => [v.rowNumber, v]));
      const bestaetigt = antwort.vorschlaege.filter((v) => v.passt === true).length;
      const widerspruch = antwort.vorschlaege.filter((v) => v.passt === false).length;
      setEditRows((rs) =>
        rs.map((r) => {
          const v = nachRow.get(r.rowNumber);
          if (!v) return r;
          if (pruefen) {
            if (v.passt === false) {
              return {
                ...r,
                ausgewaehlt: false,
                ki: {
                  kommentar: v.kommentar,
                  konfidenz: v.konfidenz,
                  passt: false,
                  korrektur: {
                    buchungsartCode: v.buchungsartCode,
                    mietvertragId: v.mietvertragId,
                    kostenartId: v.kostenartId,
                    jahr: v.jahr,
                    periodeJahr: v.periodeJahr,
                    periodeMonat: v.periodeMonat,
                  },
                },
              };
            }
            return { ...r, ki: { kommentar: v.kommentar, konfidenz: v.konfidenz, passt: v.passt } };
          }
          // Vorschläge werden nur vorbelegt, nie automatisch zum Import ausgewählt.
          const neu: BuchungEditRow = { ...r, ki: { kommentar: v.kommentar, konfidenz: v.konfidenz }, ausgewaehlt: false };
          if (v.buchungsartCode) {
            const gruppe = ermittleBuchungsartGruppe(v.buchungsartCode);
            neu.buchungsartCode = v.buchungsartCode;
            if (v.mietvertragId) neu.mietvertragId = v.mietvertragId;
            if (gruppe === "KOSTEN" && v.kostenartId) neu.kostenartId = v.kostenartId;
            if ((gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH") && v.jahr) neu.jahrEingabe = String(v.jahr);
            if (gruppe === "MIETE") Object.assign(neu, periodeNachVertrag(neu, neu.mietvertragId));
            if (gruppe === "MIETE" && v.periodeJahr && v.periodeMonat) {
              neu.periodeJahr = v.periodeJahr;
              neu.periodeMonat = v.periodeMonat;
              neu.periodeHinweis = "Monat von der KI vorgeschlagen";
            }
          }
          return neu;
        }),
      );
      setKiMeldung(
        pruefen
          ? `${antwort.vorschlaege.length} ausgewählte Zeile(n) von der KI geprüft: ${bestaetigt} bestätigt, ${widerspruch} mit Widerspruch${
              widerspruch > 0 ? " — diese sind abgewählt (Filter „KI-Widerspruch“), Vorschlag ansehen und ggf. übernehmen" : ""
            }.`
          : `${antwort.vorschlaege.length} Zeile(n) von der KI eingeschätzt — Vorschläge bitte prüfen und selbst auswählen.`,
      );
    } catch {
      setKiMeldung("KI-Prüfung fehlgeschlagen.");
    } finally {
      setKiPending(null);
    }
  }

  // Mietperiode nach der Regel (mietperiode.ts) für den gewählten Vertrag neu berechnen — z.B. nach Vertragswechsel.
  function periodeNachVertrag(
    r: Pick<BuchungEditRow, "datum" | "betrag" | "verwendungszweck">,
    mietvertragId: string,
  ): Partial<BuchungEditRow> {
    if (!r.datum || r.betrag === null) return {};
    const p = mietperiodeFuerVertrag({ datum: r.datum, betrag: r.betrag, verwendungszweck: r.verwendungszweck }, mietvertragId || null, periodenKontext);
    return { periodeJahr: p.jahr, periodeMonat: p.monat, periodeHinweis: p.hinweis };
  }

  // Was die KI anders zuordnen würde, in Worten („Monat 12/2026 statt 11/2026“).
  function kiAbweichungen(r: BuchungEditRow, k: KiKorrektur): string[] {
    const code = k.buchungsartCode ?? r.buchungsartCode;
    const gruppe = ermittleBuchungsartGruppe(code);
    const aus: string[] = [];
    if (code !== r.buchungsartCode) {
      aus.push(`Buchungsart ${buchungsarten.find((b) => b.code === code)?.bezeichnung ?? code}`);
    }
    if (k.mietvertragId && k.mietvertragId !== r.mietvertragId) {
      aus.push(`Mietvertrag ${mietvertragKandidaten.find((m) => m.id === k.mietvertragId)?.label ?? "?"}`);
    }
    if (gruppe === "MIETE" && k.periodeJahr && k.periodeMonat && (k.periodeJahr !== r.periodeJahr || k.periodeMonat !== r.periodeMonat)) {
      aus.push(
        `Monat ${periodeLabel({ jahr: k.periodeJahr, monat: k.periodeMonat })} statt ${periodeLabel({ jahr: r.periodeJahr, monat: r.periodeMonat })}`,
      );
    }
    if (gruppe === "KOSTEN" && k.kostenartId && k.kostenartId !== r.kostenartId) {
      aus.push(`Kostenart ${kostenarten.find((x) => x.id === k.kostenartId)?.name ?? "?"}`);
    }
    if ((gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH") && k.jahr && String(k.jahr) !== r.jahrEingabe) {
      aus.push(`Jahr ${k.jahr}`);
    }
    return aus;
  }

  function uebernehmeKiKorrektur(r: BuchungEditRow) {
    const k = r.ki?.korrektur;
    if (!k) return;
    const code = k.buchungsartCode ?? r.buchungsartCode;
    const gruppe = ermittleBuchungsartGruppe(code);
    const neu: BuchungEditRow = { ...r, buchungsartCode: code };
    if (k.mietvertragId) neu.mietvertragId = k.mietvertragId;
    if (gruppe === "KOSTEN" && k.kostenartId) neu.kostenartId = k.kostenartId;
    if ((gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH") && k.jahr) neu.jahrEingabe = String(k.jahr);
    if (gruppe === "MIETE" && k.periodeJahr && k.periodeMonat) {
      neu.periodeJahr = k.periodeJahr;
      neu.periodeMonat = k.periodeMonat;
      neu.periodeHinweis = "Monat von der KI übernommen";
    }
    // Bewusst übernommen: die Zeile ist wieder ausgewählt, sofern sie vollständig und noch nicht importiert ist.
    neu.ausgewaehlt = kannAuswaehlen(neu) && !istBereitsImportiert(gruppe, neu, bestehendeSets);
    neu.ki = { kommentar: `Übernommen: ${r.ki!.kommentar}`, konfidenz: r.ki!.konfidenz, passt: null, korrektur: null };
    updateRow(r.rowNumber, neu);
  }

  function handleBuchungsartChange(r: BuchungEditRow, code: string) {
    const gruppe = ermittleBuchungsartGruppe(code);
    updateRow(r.rowNumber, {
      buchungsartCode: code,
      ausgewaehlt:
        r.errors.length === 0 && pflichtfeldErfuellt(gruppe, r, darlehenListe.length > 0) && !istBereitsImportiert(gruppe, r, bestehendeSets),
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
    else if (familie === "DARLEHEN") code = "DARLEHEN_TILGUNG";
    else if (familie === "SONSTIGE") code = sonstigeArten[0]?.code ?? "";
    else if (familie === "KAUTION") {
      code =
        buchungsarten.find((b) => b.code === "KAUTION_EINZAHLUNG")?.code ??
        buchungsarten.find((b) => b.code.startsWith("KAUTION_"))?.code ??
        "";
    }
    handleBuchungsartChange(r, code);
    // Darlehensrate: die Kostenart des Zinsanteils ist nur eine Schuldzinsen-Kostenart (bei genau einer vorbelegt).
    if (familie === "DARLEHEN") {
      const zinsArten = kostenarten.filter((k) => k.schuldzinsen);
      // Passt die Abbuchung zu einer Rate der Tilgungspläne, ist der Zinsanteil vorbelegt.
      const plan = findePlanRate(darlehenRaten, r.datum, r.betrag);
      // Das Darlehen: aus der passenden Plan-Rate, sonst über die Darlehensnummer im Verwendungszweck bzw. die Kontonummer
      // des Empfängers; ohne eindeutigen Treffer wählt man es von Hand.
      const erkannt =
        plan?.darlehenId ?? erkenneDarlehen(darlehenListe, `${r.verwendungszweck} ${r.name}`, r.rohdaten["Kontonummer/IBAN"] ?? null);
      updateRow(r.rowNumber, {
        kostenartId: zinsArten.length === 1 ? zinsArten[0].id : "",
        zinsanteil: plan ? String(plan.zins).replace(".", ",") : "",
        darlehenId: erkannt ?? "",
        darlehenSonder: false,
        // Monat der Rate: der des Tilgungsplans (die Abbuchung kann vor/nach dem 15. liegen), sonst der des Buchungsdatums.
        ...(plan
          ? { periodeJahr: Number(plan.datum.slice(0, 4)), periodeMonat: Number(plan.datum.slice(5, 7)) }
          : r.datum
            ? { periodeJahr: Number(r.datum.slice(0, 4)), periodeMonat: Number(r.datum.slice(5, 7)) }
            : {}),
        ausgewaehlt: r.errors.length === 0 && Boolean(erkannt || darlehenListe.length === 0) && !istBereitsImportiert("DARLEHEN", r, bestehendeSets),
      });
    }
  }

  const gefilterteRows = editRows.filter((r) => {
    // Der Filter richtet sich nach dem ursprünglichen Vorschlag, nicht nach der aktuellen Auswahl:
    // eine umkategorisierte Zeile bleibt unter ihrem Filter, damit man sie weiter bearbeiten kann.
    const vorschlagCode = r.kandidaten[0]?.code ?? "";
    if (hinweisFilter === "monat_abweichend") {
      if (ermittleBuchungsartGruppe(r.buchungsartCode) !== "MIETE" || !monatWeichtAb(r)) return false;
    } else if (hinweisFilter === "ki_widerspruch") {
      if (r.ki?.passt !== false) return false;
    } else if (
      !passtZuHinweisFilter(
        hinweisFilter,
        hinweisFuerVorschlag(r),
        istBereitsImportiert(ermittleBuchungsartGruppe(vorschlagCode), r, bestehendeSets),
      )
    ) {
      return false;
    }
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

  // Kostenart „Anschaffung / Herstellung“ (AfA): ohne „Bezugsbereit ab“ nicht importierbar.
  function brauchtBezugsbereit(r: BuchungEditRow): boolean {
    if (ermittleBuchungsartGruppe(r.buchungsartCode) !== "KOSTEN") return false;
    const kostenart = kostenarten.find((k) => k.id === r.kostenartId);
    return (
      kostenart?.anschaffung === true &&
      verlangtBezugsbereit("ANSCHAFFUNG", r.datum ? Number(r.datum.slice(0, 4)) : r.jahrEingabe ? Number(r.jahrEingabe) : null)
    );
  }

  function kannAuswaehlen(r: BuchungEditRow): boolean {
    const gruppe = ermittleBuchungsartGruppe(r.buchungsartCode);
    return (
      r.errors.length === 0 &&
      pflichtfeldErfuellt(gruppe, r, darlehenListe.length > 0) &&
      (!brauchtBezugsbereit(r) || Boolean(r.bezugsbereitAb))
    );
  }

  // Der Alle-auswählen-Haken betrifft nur Zeilen, die sich tatsächlich auswählen lassen: bereits
  // importierte Zeilen werden unten bei jedem Render wieder abgewählt (sie würden beim Import ohnehin
  // übersprungen) und dürfen deshalb weder den Haken-Zustand bestimmen noch hier umgeschaltet werden —
  // sonst bliebe der Haken für immer leer und ein Klick hätte keine sichtbare Wirkung.
  const auswaehlbareRows = gefilterteRows.filter(
    (r) => kannAuswaehlen(r) && !istBereitsImportiert(ermittleBuchungsartGruppe(r.buchungsartCode), r, bestehendeSets),
  );
  const anzahlAusgewaehlt = auswaehlbareRows.filter((r) => r.ausgewaehlt).length;
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && anzahlAusgewaehlt === auswaehlbareRows.length;
  const teilweiseAusgewaehlt = anzahlAusgewaehlt > 0 && !alleAusgewaehlt;

  function toggleAll(checked: boolean) {
    const betroffen = new Set(auswaehlbareRows.map((r) => r.rowNumber));
    setEditRows((rs) => rs.map((r) => (betroffen.has(r.rowNumber) ? { ...r, ausgewaehlt: checked } : r)));
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt && kannAuswaehlen(r));
  // „Ausgewählte mit KI prüfen“: alles, was beim Klick auf „Importieren“ gebucht würde (unabhängig vom Filter).
  const kiAusgewaehlt = importierbareRows.filter(
    (r) => r.errors.length === 0 && !istBereitsImportiert(ermittleBuchungsartGruppe(r.buchungsartCode), r, bestehendeSets),
  );
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
      periodeMonat: gruppe === "MIETE" || (gruppe === "DARLEHEN" && !r.darlehenSonder) ? r.periodeMonat : undefined,
      periodeJahr: gruppe === "MIETE" || (gruppe === "DARLEHEN" && !r.darlehenSonder) ? r.periodeJahr : undefined,
      kostenartId: gruppe === "KOSTEN" ? r.kostenartId : undefined,
      gebaeudeAuswahl: gruppe === "KOSTEN" ? r.gebaeudeAuswahl : undefined,
      jahr: gruppe === "KOSTEN" || gruppe === "NEBENKOSTENAUSGLEICH" ? (r.jahrEingabe ? Number(r.jahrEingabe) : null) : undefined,
      bezugsbereitAb: gruppe === "KOSTEN" && brauchtBezugsbereit(r) ? r.bezugsbereitAb || null : undefined,
      ...(gruppe === "DARLEHEN"
        ? { kostenartId: r.kostenartId || null, zinsanteil: r.darlehenSonder ? undefined : zinsanteilZahl(r.zinsanteil), darlehenId: r.darlehenId || null, darlehenSonder: r.darlehenSonder }
        : {}),
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
        <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={() => runKiPruefung("offen")}
            disabled={kiPending !== null || kiKandidaten.length === 0}
            title="Schickt nur unsichere, noch nicht importierte Zeilen (ohne IBAN) an Claude. Ergebnis sind Vorschläge mit Begründung."
            className="h-10 w-full whitespace-nowrap rounded-md border border-violet-500/60 px-4 text-sm text-violet-300 hover:bg-violet-950/40 disabled:opacity-40 sm:w-auto"
          >
            {kiPending === "offen" ? "KI prüft…" : `Offene Zeilen mit KI prüfen (${kiKandidaten.length})`}
          </button>
          <button
            type="button"
            onClick={() => runKiPruefung("ausgewaehlt")}
            disabled={kiPending !== null || kiAusgewaehlt.length === 0 || kiAusgewaehlt.length > 250}
            title={
              kiAusgewaehlt.length > 250
                ? "Höchstens 250 Zeilen auf einmal — Auswahl verkleinern."
                : "Schickt alle zum Import ausgewählten Zeilen (ohne IBAN) samt Buchungsart, Mietvertrag, Mietmonat bzw. Kostenart an Claude. Zeilen, denen die KI widerspricht, werden abgewählt und zeigen ihren Vorschlag."
            }
            className="h-10 w-full whitespace-nowrap rounded-md border border-violet-500/60 px-4 text-sm text-violet-300 hover:bg-violet-950/40 disabled:opacity-40 sm:w-auto"
          >
            {kiPending === "ausgewaehlt" ? "KI prüft…" : `Ausgewählte mit KI prüfen (${kiAusgewaehlt.length})`}
          </button>
          <select
            value={hinweisFilter}
            onChange={(e) => setHinweisFilter(e.target.value as HinweisFilter)}
            className="rounded-md border border-neutral-700 bg-transparent h-10 w-full px-2 text-sm text-white outline-none focus:border-neutral-400 sm:w-48"
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
            className="rounded-md border border-neutral-700 bg-transparent h-10 w-full px-2 text-sm text-white outline-none focus:border-neutral-400 sm:w-48"
          >
            {FAMILIE_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {kiMeldung && <p className="mb-2 text-sm text-violet-300">{kiMeldung}</p>}
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
                  ref={(el) => {
                    if (el) el.indeterminate = teilweiseAusgewaehlt;
                  }}
                  disabled={auswaehlbareRows.length === 0}
                  onChange={(e) => toggleAll(e.target.checked)}
                  title="Alle sichtbaren, noch nicht importierten Zeilen aus-/abwählen"
                  className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                />
              </th>
              <SortableTh label="Datum" spalteKey="datum" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Betrag" spalteKey="betrag" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <SortableTh label="Verwendungszweck / Name" spalteKey="text" aktiveSpalte={sortSpalte} richtung={sortRichtung} onSort={toggleSort} />
              <th className="min-w-[160px] px-3 py-2">Buchungsart</th>
              <th className="min-w-[220px] px-3 py-2">Details</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="min-w-[200px] px-3 py-2">KI-Einschätzung</th>
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
                      // Zeilen mit KI-Widerspruch sind abgewählt, sollen aber auffallen statt ausgegraut zu sein.
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt && r.ki?.passt !== false ? "opacity-50" : ""
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
                          <option value="DARLEHEN">{FAMILIE_LABELS.DARLEHEN}</option>
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
                                // Der Vorschlag hängt am Zahlungsverlauf des Vertrags (zahlt er am Monatsende voraus?).
                                ...periodeNachVertrag(r, id),
                              })
                            }
                          />
                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-neutral-500">Miete für</span>
                            <select
                              value={r.periodeMonat}
                              onChange={(e) => updateRow(r.rowNumber, { periodeMonat: Number(e.target.value), periodeHinweis: null })}
                              title="Mietmonat: für welchen Monat die Zahlung gedacht ist (nicht wann sie einging)"
                              className={`rounded-md border bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 ${
                                monatWeichtAb(r) ? "border-amber-500 text-amber-300" : "border-neutral-700"
                              }`}
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
                              onChange={(e) => updateRow(r.rowNumber, { periodeJahr: Number(e.target.value), periodeHinweis: null })}
                              className={`w-16 rounded-md border bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 ${
                                monatWeichtAb(r) ? "border-amber-500 text-amber-300" : "border-neutral-700"
                              }`}
                            />
                          </div>
                          {(r.periodeHinweis || monatWeichtAb(r)) && (
                            <p className="text-[11px] text-amber-300/90">
                              {r.periodeHinweis ?? "Mietmonat weicht vom Eingangsmonat ab (von Hand gesetzt)"}
                            </p>
                          )}
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
                          {brauchtBezugsbereit(r) && (
                            <div className="rounded-md border border-amber-900/50 bg-amber-500/5 p-1.5">
                              <DateInput
                                size="sm"
                                label="Bezugsbereit ab (Pflicht, AfA)"
                                labelClassName="text-xs text-amber-300"
                                value={r.bezugsbereitAb}
                                onChange={(iso) => updateRow(r.rowNumber, { bezugsbereitAb: iso })}
                              />
                            </div>
                          )}
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
                            title={
                              r.datum && r.jahrEingabe !== r.datum.slice(0, 4)
                                ? "Kostenjahr weicht vom Abbuchungsjahr ab (Vorjahres-Abrechnung erkannt) — zählt nur für die Nebenkostenabrechnung"
                                : "Kostenjahr (nur Nebenkostenabrechnung)"
                            }
                            className={`w-20 rounded-md border bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 ${
                              r.datum && r.jahrEingabe !== r.datum.slice(0, 4)
                                ? "border-amber-500 text-amber-300"
                                : "border-neutral-700"
                            }`}
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
                        <div className="space-y-1">
                          <MietvertragAuswahl
                            kandidaten={mietvertragKandidaten}
                            value={r.mietvertragId}
                            leerLabel="– Mietvertrag wählen –"
                            onChange={(id) => updateRow(r.rowNumber, { mietvertragId: id })}
                          />
                          <p className="text-[11px] text-neutral-500">
                            Zahlung auf eine Gebühr (z.B. Mahngebühr), kein Teil der Miete. Die Gebühr selbst
                            als Sonderforderung auf dem Mieterkonto buchen, sonst steigt der Mietsaldo.
                          </p>
                        </div>
                      )}
                      {gruppe === "DARLEHEN" && (() => {
                        const sonder = r.darlehenSonder;
                        const rate = Math.abs(r.betrag ?? 0);
                        const zins = sonder ? rate : zinsanteilZahl(r.zinsanteil);
                        const zinsGueltig = Number.isFinite(zins) && zins >= 0;
                        const tilgung = Math.round((rate - (zinsGueltig ? zins : 0)) * 100) / 100;
                        const zinsArten = kostenarten.filter((k) => k.schuldzinsen);
                        return (
                          <div className="flex flex-col gap-1">
                            {darlehenListe.length > 0 ? (
                              <select
                                value={r.darlehenId}
                                onChange={(e) =>
                                  updateRow(r.rowNumber, {
                                    darlehenId: e.target.value,
                                    ausgewaehlt: r.errors.length === 0 && Boolean(e.target.value) && !bereitsImportiert,
                                  })
                                }
                                className={`w-full rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 ${
                                  r.darlehenId ? "border-neutral-700" : "border-amber-500"
                                }`}
                              >
                                <option value="">– Darlehen wählen –</option>
                                {darlehenListe.map((d) => (
                                  <option key={d.id} value={d.id}>
                                    {d.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <p className="text-[11px] text-amber-400">
                                Noch kein Darlehen in den Stammdaten (Darlehen &amp; Tilgungspläne) — die Rate wird ohne Darlehen gebucht.
                              </p>
                            )}
                            <select
                              value={sonder ? "sonder" : "rate"}
                              onChange={(e) => {
                                const neuSonder = e.target.value === "sonder";
                                const zinsArten = kostenarten.filter((k) => k.schuldzinsen);
                                updateRow(r.rowNumber, {
                                  darlehenSonder: neuSonder,
                                  zinsanteil: "",
                                  ...(neuSonder && !r.kostenartId && zinsArten.length === 1 ? { kostenartId: zinsArten[0].id } : {}),
                                });
                              }}
                              className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                            >
                              <option value="rate">Rate (Zins + Tilgung)</option>
                              <option value="sonder">Sonderbuchung (z.B. Verzugszinsen)</option>
                            </select>
                            {!sonder && (
                              <div className="flex items-center gap-1">
                                <span className="text-[11px] text-neutral-500">Rate für</span>
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
                            )}
                            {!sonder && (
                              <input
                                type="text"
                                inputMode="decimal"
                                value={r.zinsanteil}
                                onChange={(e) => updateRow(r.rowNumber, { zinsanteil: e.target.value })}
                                placeholder="Davon Zinsen (€, laut Tilgungsplan)"
                                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                              />
                            )}
                            {zins > 0 && (
                              <select
                                value={r.kostenartId}
                                onChange={(e) => updateRow(r.rowNumber, { kostenartId: e.target.value })}
                                className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                              >
                                <option value="">– Kostenart der Zinsen wählen –</option>
                                {zinsArten.map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {k.name}
                                  </option>
                                ))}
                              </select>
                            )}
                            {zins > 0 && zinsArten.length === 0 && (
                              <p className="text-[11px] text-amber-400">
                                Noch keine Kostenart mit Einordnung „Schuldzinsen“ — unter Kostenarten anlegen.
                              </p>
                            )}
                            {!sonder && (() => {
                              const plan = findePlanRate(darlehenRaten, r.datum, r.betrag);
                              if (!plan) {
                                return (
                                  <p className="text-[11px] text-neutral-500">
                                    Keine Rate eines Tilgungsplans mit diesem Betrag und Datum — Zinsanteil von Hand eintragen (z.B. nach
                                    Sondertilgung oder Zinsänderung; Tilgungspläne unter Stammdaten → Darlehen &amp; Tilgungspläne).
                                  </p>
                                );
                              }
                              const gleich = zinsGueltig && Math.abs(zins - plan.zins) < 0.005;
                              return (
                                <p className="text-[11px] text-neutral-400">
                                  Tilgungsplan {plan.bezeichnung} ({plan.datum.split("-").reverse().join(".")}): Zinsen {formatEuro(plan.zins)}
                                  {gleich ? (
                                    " ✓"
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => updateRow(r.rowNumber, { zinsanteil: String(plan.zins).replace(".", ",") })}
                                      className="ml-2 underline hover:text-white"
                                    >
                                      übernehmen
                                    </button>
                                  )}
                                </p>
                              );
                            })()}
                            <p className="text-[11px] text-neutral-500">
                              {sonder
                                ? (r.betrag ?? 0) < 0
                                  ? `Sonderbuchung: ${formatEuro(rate)} Zinsen/Kosten (Schuldzinsen), keine Tilgung, keine Rate des Tilgungsplans.`
                                  : "Sonderbuchung nur bei einer Abbuchung (negativer Betrag)."
                                : !zinsGueltig
                                ? "Zinsanteil ungültig."
                                : zins > rate + 0.005
                                  ? "Zinsanteil ist höher als die Rate."
                                  : zins > 0
                                    ? `Zinsen ${formatEuro(zins)} (Kosten) + Tilgung ${formatEuro(tilgung)} (keine Kosten)`
                                    : "Ganze Rate als Tilgung (keine Kosten) — Zinsanteil eintragen, falls enthalten."}
                            </p>
                          </div>
                        );
                      })()}
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
                      {r.errors.length === 0 && !bereitsImportiert && r.doppelzahlungHinweis && (
                        <div className="mt-1 text-amber-400">{r.doppelzahlungHinweis}</div>
                      )}
                    </td>
                    <td className="max-w-[260px] px-3 py-1.5 text-xs">
                      {r.ki?.passt === true ? (
                        <span title={r.ki.kommentar} className="text-green-400">
                          <span className="mr-1 font-medium">✓ KI bestätigt:</span>
                          <span className="text-neutral-400">{r.ki.kommentar}</span>
                        </span>
                      ) : r.ki?.passt === false ? (
                        (() => {
                          const abw = r.ki.korrektur ? kiAbweichungen(r, r.ki.korrektur) : [];
                          return (
                            <div className="space-y-1 rounded-md border border-amber-900/60 bg-amber-500/5 p-1.5">
                              <p className="text-amber-300">
                                <span className="mr-1 font-medium">KI-Widerspruch ({r.ki.konfidenz}):</span>
                                {r.ki.kommentar}
                              </p>
                              {abw.length > 0 && (
                                <p className="text-neutral-300">
                                  Vorschlag: {abw.join(", ")}{" "}
                                  <button
                                    type="button"
                                    onClick={() => uebernehmeKiKorrektur(r)}
                                    className="ml-1 rounded border border-violet-500/60 px-1.5 py-0.5 text-violet-300 hover:bg-violet-950/40"
                                  >
                                    Übernehmen
                                  </button>
                                </p>
                              )}
                            </div>
                          );
                        })()
                      ) : r.ki ? (
                        <span
                          title={r.ki.kommentar}
                          className={r.ki.konfidenz === "hoch" ? "text-violet-300" : r.ki.konfidenz === "mittel" ? "text-amber-300" : "text-neutral-400"}
                        >
                          <span className="mr-1 font-medium">KI ({r.ki.konfidenz}):</span>
                          {r.ki.kommentar}
                        </span>
                      ) : (
                        <span className="text-neutral-600">–</span>
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
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={10} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-neutral-500">
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
