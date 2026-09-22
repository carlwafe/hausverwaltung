"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { zeilenSchluesselAusRohdaten } from "@/lib/import/vollstaendigkeit";
import { requireUser, requireEditor } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import { speichereDatei } from "@/lib/storage";
import { mapZahlungenRows, type MietvertragKandidat } from "@/lib/import/zahlungen-import";
import {
  mapKostenRows,
  type EinheitKandidat,
  type EmpfaengerHistorie,
  type GebaeudeKandidat,
  type KostenartKandidat,
  type MieterKandidat,
} from "@/lib/import/kosten-import";
import {
  vereinheitlicheZeilen,
  ermittleBuchungsartGruppe,
  type VereinheitlichteZeile,
  type BuchungsartGruppe,
} from "@/lib/import/buchung-klassifizierung";
import { gebaeudeAuswahlWert, parseGebaeudeAuswahlWert, type EinheitMitAdresse } from "@/lib/gebaeude-gruppen";
import {
  datumBetragSchluessel,
  ermittleMandatsrefAusZeile,
  findColumn,
  normalizeText,
} from "@/lib/import/bank-csv";
import { einheitSortSchluessel } from "@/lib/einheit-sort";

export type BuchungsartKandidat = {
  id: string;
  code: string;
  bezeichnung: string;
  kontokreis: string;
  zahlungswirksam: boolean;
};

// Welche bestehenden Buchungen zählen bei der "bereits importiert"-Erkennung? Nur aktive: eine
// gelöschte (stornierte) Buchung samt Gegenbuchung darf eine erneut hochgeladene Zeile nicht mehr
// blockieren. Ausnahme: das stornierte Original einer Aufteilung ("Zahlung aufteilen") — dessen
// Bankbetrag ist nur dort noch als Ganzes vorhanden (die Teile summieren sich pro Kategorie
// anders), es muss die Zeile also weiter als importiert ausweisen.
async function ladeDedupFilter() {
  const gruppen = await prisma.buchung.findMany({
    where: { aufteilungGruppeId: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
    select: { aufteilungGruppeId: true },
    distinct: ["aufteilungGruppeId"],
  });
  // Umbuchungen (Buchungsart geändert) verweisen per bezugId auf die ursprüngliche Bankbuchung.
  const umbuchungen = await prisma.buchung.findMany({
    where: { bezugTyp: "Umbuchung", bezugId: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
    select: { bezugId: true },
  });
  const gruppenIds = [...gruppen.map((g) => g.aufteilungGruppeId!), ...umbuchungen.map((u) => u.bezugId!)];
  return {
    OR: [AKTIVE_BUCHUNG_FILTER, { id: { in: gruppenIds }, storniertDurchBuchungId: { not: null } }],
  };
}

// Buchungsart-Katalog einmal geladen statt in jeder Commit-Funktion einzeln nachzuschlagen.
async function ladeBuchungsartMap(): Promise<Map<string, string>> {
  const arten = await prisma.buchungsart.findMany({ select: { id: true, code: true } });
  return new Map(arten.map((a) => [a.code, a.id]));
}

export type PreviewResult =
  | {
      zeilen: VereinheitlichteZeile[];
      mietvertragKandidaten: { id: string; label: string }[];
      kostenarten: KostenartKandidat[];
      gebaeude: GebaeudeKandidat[];
      einheiten: EinheitMitAdresse[];
      buchungsarten: BuchungsartKandidat[];
      bestehendeZahlungen: string[];
      bestehendeKosten: string[];
      bestehendeZahlungenDatumBetrag: string[];
      bestehendeMietweiterleitungen: string[];
      bestehendeKautionsbuchungen: string[];
      bestehendeNebenkostenausgleich: string[];
      bestehendeNichtZugeordnet: string[];
      bestehendeRohdaten: string[];
      fileName: string;
      importBatchId: string;
    }
  | { error: string };

// Verwendungszweck gehört mit in den Schlüssel, nicht nur Empfänger+Datum+Betrag: derselbe
// Absender kann am selben Tag mehrere unterschiedliche Kostenpositionen mit zufällig demselben
// Betrag buchen (z.B. zwei Niederschlagswasser-Abrechnungen für unterschiedliche
// Gebäude-Kundennummern, die rein zufällig auf denselben Centbetrag kommen) — ohne den
// Verwendungszweck im Schlüssel würde die zweite, tatsächlich neue Zeile fälschlich als
// Duplikat der ersten erkannt und beim Import stillschweigend übersprungen.
function kostenDedupSchluessel(
  empfaenger: string | null,
  datum: Date | null,
  betrag: number,
  verwendungszweck: string | null,
) {
  return `${(empfaenger ?? "").trim().toLowerCase()}|${datum ? datum.toISOString().slice(0, 10) : ""}|${betrag.toFixed(2)}|${(verwendungszweck ?? "").trim().toLowerCase()}`;
}

// Für Mietweiterleitungen und Kautionsbuchungen: kein Empfänger im Schlüssel — bei
// Mietweiterleitungen ist die Gegenpartei immer dieselbe Eigentümerin, bei Kautionsbuchungen ist
// der Verwendungszweck (der i.d.R. den Mieternamen enthält) zusammen mit Datum+Betrag präziser
// als der oft nur "Eigentümerin/Kautionskonto"-lautende Empfänger.
function datumBetragZweckSchluessel(datum: Date | null, betrag: number, verwendungszweck: string | null) {
  return `${datum ? datum.toISOString().slice(0, 10) : ""}|${betrag.toFixed(2)}|${(verwendungszweck ?? "").trim().toLowerCase()}`;
}

// Reine Set-Aufbau-Logik (kein DB-Zugriff) für die sieben "bereits importiert"-Listen — von
// previewImport beim ersten Laden UND von ladeBestehendeImportSets für den Refresh nach jedem
// Commit in einem beliebigen Abschnitt genutzt, damit beide garantiert denselben Dedup-Schlüssel
// berechnen und nicht auseinanderlaufen können.
export type BestehendeImportSets = {
  bestehendeZahlungen: string[];
  bestehendeZahlungenDatumBetrag: string[];
  bestehendeKosten: string[];
  bestehendeMietweiterleitungen: string[];
  bestehendeKautionsbuchungen: string[];
  bestehendeNebenkostenausgleich: string[];
  bestehendeNichtZugeordnet: string[];
  // Schlüssel (Datum|Betrag|Verwendungszweck|Name) der Bankzeilen, die als Rohdaten an irgendeiner
  // aktiven Buchung hängen — unabhängig von deren Buchungsart. Erkennt eine Zeile als importiert,
  // auch wenn sie inzwischen unter einer anderen Art gebucht ist (z.B. umgebucht auf Gebühren-
  // Zahlung oder Kaution), was die artspezifischen Listen oben nicht können.
  bestehendeRohdaten: string[];
};

function berechneBestehendeImportSets({
  vertraegeMitZahlungen,
  bestehendeKostenpositionen,
  mietweiterleitungenRaw,
  kautionsbuchungenRaw,
  sonstigeZahlungenRaw,
  nichtZugeordneteBuchungenRaw,
  buchungenRohdaten,
}: {
  vertraegeMitZahlungen: {
    id: string;
    zahlungen: {
      datum: Date;
      betrag: unknown;
      verwendungszweck: string | null;
      aufteilungGruppeId: string | null;
    }[];
  }[];
  bestehendeKostenpositionen: {
    empfaenger: string | null;
    datum: Date | null;
    betrag: unknown;
    verwendungszweck: string | null;
    aufteilungGruppeId: string | null;
  }[];
  mietweiterleitungenRaw: { datum: Date | null; betrag: unknown; verwendungszweck: string | null }[];
  kautionsbuchungenRaw: { datum: Date | null; betrag: unknown; verwendungszweck: string | null }[];
  sonstigeZahlungenRaw: { datum: Date | null; betrag: unknown }[];
  nichtZugeordneteBuchungenRaw: { datum: Date | null; betrag: unknown }[];
  buchungenRohdaten: { rohdaten: unknown }[];
}): BestehendeImportSets {
  // Verwendungszweck gehört mit in den Schlüssel, nicht nur Mietvertrag+Datum+Betrag: mehrere
  // Mieter zahlen oft am selben Tag denselben (Kaltmiete-)Betrag, und eine "mehrdeutig"-Zeile
  // ohne automatisch vorgeschlagenen Mietvertrag lässt sich versehentlich einem falschen, aber
  // zufällig genau an diesem Tag mit diesem Betrag bereits zahlenden Mietvertrag zuordnen — ohne
  // Verwendungszweck im Schlüssel würde das fälschlich als "bereits importiert" gemeldet, obwohl
  // die eigentlich gemeinte Buchung noch gar nicht importiert wurde.
  // Aufgeteilte Zahlungen (siehe zahlungen/actions.ts teileZahlungAuf, z.B. eine Sammelüberweisung
  // für Wohnung+Garage in einer Summe) einzeln zu betrachten würde eine erneut importierte
  // Original-Buchung nie als "bereits importiert" erkennen — keiner der Teilbeträge entspricht dem
  // ursprünglich importierten Gesamtbetrag. Analog zu aufteilungSummen bei Kostenpositionen unten:
  // pro aufteilungGruppeId wird der Summenbetrag gebildet; für den Dedup-Schlüssel wird dieser
  // Summenbetrag statt des einzelnen Teilbetrags verwendet, für jeden an der Aufteilung beteiligten
  // Mietvertrag einzeln (die erneut eingelesene Original-Zeile kennt die Aufteilung ja noch nicht,
  // sondern nur den vollen Betrag plus den beim Import ausgewählten einzelnen Mietvertrag).
  const zahlungAufteilungSummen = new Map<string, number>();
  for (const v of vertraegeMitZahlungen) {
    for (const z of v.zahlungen) {
      if (!z.aufteilungGruppeId) continue;
      zahlungAufteilungSummen.set(
        z.aufteilungGruppeId,
        (zahlungAufteilungSummen.get(z.aufteilungGruppeId) ?? 0) + Number(z.betrag),
      );
    }
  }
  const bestehendeZahlungen = new Set(
    vertraegeMitZahlungen.flatMap((v) =>
      v.zahlungen.map((z) => {
        const betrag = z.aufteilungGruppeId ? zahlungAufteilungSummen.get(z.aufteilungGruppeId)! : Number(z.betrag);
        return `${v.id}|${z.datum.toISOString().slice(0, 10)}|${betrag.toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`;
      }),
    ),
  );
  // Rückfall für Zeilen ohne gewählten Mietvertrag (z.B. "mehrdeutig") sowie für den "bereits als
  // Zahlung importiert"-Hinweis im Kosten-Import — Betrag als Betragshöhe ohne Vorzeichen, siehe
  // ausführlicher Kommentar dazu in previewImport.
  const bestehendeZahlungenDatumBetrag = new Set(
    vertraegeMitZahlungen.flatMap((v) =>
      v.zahlungen.map((z) => {
        const betrag = z.aufteilungGruppeId ? zahlungAufteilungSummen.get(z.aufteilungGruppeId)! : Number(z.betrag);
        return `${z.datum.toISOString().slice(0, 10)}|${Math.abs(betrag).toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`;
      }),
    ),
  );

  // Aufgeteilte Positionen (siehe kosten/actions.ts teileKostenpositionAuf) einzeln zu betrachten
  // würde eine erneut importierte Original-Buchung nie als "bereits importiert" erkennen — keiner
  // der Teilbeträge entspricht dem ursprünglich importierten Gesamtbetrag. Für den Dedup-Schlüssel
  // werden Positionen derselben Gruppe deshalb zu ihrem Summenbetrag zusammengefasst.
  const aufteilungSummen = new Map<string, number>();
  for (const k of bestehendeKostenpositionen) {
    if (!k.aufteilungGruppeId) continue;
    aufteilungSummen.set(
      k.aufteilungGruppeId,
      (aufteilungSummen.get(k.aufteilungGruppeId) ?? 0) + Number(k.betrag),
    );
  }
  const bestehendeKosten = new Set(
    bestehendeKostenpositionen
      .filter((k) => k.datum)
      .map((k) =>
        kostenDedupSchluessel(
          k.empfaenger,
          k.datum,
          k.aufteilungGruppeId ? aufteilungSummen.get(k.aufteilungGruppeId)! : Number(k.betrag),
          k.verwendungszweck,
        ),
      ),
  );

  const bestehendeMietweiterleitungen = new Set(
    mietweiterleitungenRaw.map((m) => datumBetragZweckSchluessel(m.datum, Number(m.betrag), m.verwendungszweck)),
  );
  const bestehendeKautionsbuchungen = new Set(
    kautionsbuchungenRaw.map((k) => datumBetragZweckSchluessel(k.datum, Number(k.betrag), k.verwendungszweck)),
  );

  const bestehendeNebenkostenausgleich = new Set(
    sonstigeZahlungenRaw.map((s) => datumBetragSchluessel(s.datum, Number(s.betrag))),
  );
  const bestehendeNichtZugeordnet = new Set(
    nichtZugeordneteBuchungenRaw.map((n) => datumBetragSchluessel(n.datum, Number(n.betrag))),
  );

  return {
    bestehendeZahlungen: [...bestehendeZahlungen],
    bestehendeZahlungenDatumBetrag: [...bestehendeZahlungenDatumBetrag],
    bestehendeKosten: [...bestehendeKosten],
    bestehendeMietweiterleitungen: [...bestehendeMietweiterleitungen],
    bestehendeKautionsbuchungen: [...bestehendeKautionsbuchungen],
    bestehendeNebenkostenausgleich: [...bestehendeNebenkostenausgleich],
    bestehendeNichtZugeordnet: [...bestehendeNichtZugeordnet],
    bestehendeRohdaten: [
      ...new Set(
        buchungenRohdaten
          .map((b) => zeilenSchluesselAusRohdaten(b.rohdaten))
          .filter((s): s is string => s !== null),
      ),
    ],
  };
}

// Refresh-Endpunkt für den Client: nach jedem erfolgreichen Import in einem beliebigen Abschnitt
// (Zahlungen, Kosten, Mietweiterleitungen, Kaution, Nebenkostenausgleich) direkt aufgerufen, um
// die "bereits importiert"-Listen aller Abschnitte auf den aktuellen DB-Stand zu bringen — ohne
// die Datei erneut hochzuladen. Eigenes, schlankeres Promise.all als previewImport (nur die für
// die Dedup-Listen nötigen Felder, keine Kandidatenlisten/Historie fürs Zeilen-Matching).
export async function ladeBestehendeImportSets(): Promise<BestehendeImportSets> {
  await requireUser();
  const dedup = await ladeDedupFilter();

  const [
    vertraege,
    zahlungenRaw,
    bestehendeKostenpositionen,
    mietweiterleitungenRaw,
    kautionsbuchungenRaw,
    sonstigeZahlungenRaw,
    nichtZugeordneteBuchungenRaw,
  ] = await Promise.all([
      prisma.mietvertrag.findMany({ where: { status: { in: ["AKTIV", "BEENDET"] } }, select: { id: true } }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "MIETZAHLUNG" }, ...dedup },
        select: { mietvertragId: true, datum: true, betrag: true, verwendungszweck: true, aufteilungGruppeId: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "KOSTENPOSITION" }, ...dedup },
        select: {
          empfaenger: true,
          datum: true,
          betrag: true,
          verwendungszweck: true,
          aufteilungGruppeId: true,
        },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "MIETWEITERLEITUNG" }, ...dedup },
        select: { datum: true, betrag: true, verwendungszweck: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { kontokreis: "KAUTIONSKONTO" }, ...dedup },
        select: { datum: true, betrag: true, verwendungszweck: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...dedup },
        select: { datum: true, betrag: true },
      }),
      prisma.nichtZugeordneteBuchung.findMany({ select: { datum: true, betrag: true } }),
    ]);

  const zahlungenNachVertrag = new Map<string, typeof zahlungenRaw>();
  for (const z of zahlungenRaw) {
    if (!z.mietvertragId) continue;
    const liste = zahlungenNachVertrag.get(z.mietvertragId) ?? [];
    liste.push(z);
    zahlungenNachVertrag.set(z.mietvertragId, liste);
  }
  const vertraegeMitZahlungen = vertraege.map((v) => ({
    id: v.id,
    zahlungen: (zahlungenNachVertrag.get(v.id) ?? []).map((z) => ({
      datum: z.datum!,
      betrag: z.betrag,
      verwendungszweck: z.verwendungszweck,
      aufteilungGruppeId: z.aufteilungGruppeId,
    })),
  }));

  const buchungenRohdaten = await prisma.buchung.findMany({ where: dedup, select: { rohdaten: true } });

  return berechneBestehendeImportSets({
    vertraegeMitZahlungen,
    bestehendeKostenpositionen,
    mietweiterleitungenRaw,
    kautionsbuchungenRaw,
    sonstigeZahlungenRaw,
    nichtZugeordneteBuchungenRaw,
    buchungenRohdaten,
  });
}


// Ein ImportBatch kann jetzt Ergebnisse von zwei unabhängigen Importen (Zahlungen und Kosten)
// aus derselben Datei sammeln, statt dass der zweite Commit das Ergebnis des ersten überschreibt.
async function ergaenzeImportBatchErgebnis(importBatchId: string, zusatz: string) {
  const batch = await prisma.importBatch.findUnique({
    where: { id: importBatchId },
    select: { ergebnis: true },
  });
  const ergebnis = batch?.ergebnis ? `${batch.ergebnis}; ${zusatz}` : zusatz;
  await prisma.importBatch.update({ where: { id: importBatchId }, data: { ergebnis } });
}

// Liest die Datei nur einmal ein und speichert sie nur einmal, statt (wie zuvor bei getrennten
// Zahlungen- und Kosten-Importen) dieselbe Kontoauszugsdatei zweimal hochladen und ablegen zu
// müssen.
export async function previewImport(
  _prev: PreviewResult | null,
  formData: FormData,
): Promise<PreviewResult> {
  const user = await requireUser();
  const dedup = await ladeDedupFilter();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Bitte eine Datei auswählen." };
  }

  const name = file.name.toLowerCase();
  if (!name.endsWith(".csv") && !name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    return { error: "Nur .csv, .xlsx oder .xls Dateien werden unterstützt." };
  }

  try {
    const { headers, rows } = await parseSpreadsheetFile(file);
    if (rows.length === 0) {
      return { error: "Keine Datenzeilen in der Datei gefunden." };
    }

    const speicherpfad = await speichereDatei(Buffer.from(await file.arrayBuffer()), file.name);
    const importBatch = await prisma.importBatch.create({
      data: {
        typ: "KONTOAUSZUG",
        dateiname: file.name,
        speicherpfad,
        anzahlZeilen: rows.length,
        user: { connect: { id: user.id } },
      },
    });

    const [
      vertraege,
      kostenartenRaw,
      gebaeudeRaw,
      einheitenRaw,
      zahlungenRaw,
      bestehendeKostenpositionen,
      bestehendeMietweiterleitungenRaw,
      bestehendeKautionsbuchungenRaw,
      bestehendeSonstigenBuchungenRaw,
      bestehendeNichtZugeordnetenBuchungenRaw,
      buchungsartenRaw,
    ] = await Promise.all([
      prisma.mietvertrag.findMany({
        where: { status: { in: ["AKTIV", "BEENDET"] } },
        include: { einheit: true, mieter: true },
      }),
      prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
      prisma.gebaeude.findMany({
        orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
        include: {
          haus: { select: { id: true, reihenfolge: true } },
          kostengruppen: { select: { id: true, bezeichnung: true } },
        },
      }),
      prisma.einheit.findMany({
        select: {
          id: true,
          bezeichnung: true,
          gebaeudeId: true,
          gebaeude: { select: { strasse: true, hausnummer: true } },
        },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "MIETZAHLUNG" }, ...dedup },
        select: { mietvertragId: true, datum: true, betrag: true, verwendungszweck: true, aufteilungGruppeId: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "KOSTENPOSITION" }, ...dedup },
        select: {
          empfaenger: true,
          kostenartId: true,
          gebaeudeId: true,
          hausId: true,
          kostengruppeId: true,
          einheitId: true,
          datum: true,
          betrag: true,
          verwendungszweck: true,
          rohdaten: true,
          aufteilungGruppeId: true,
        },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "MIETWEITERLEITUNG" }, ...dedup },
        select: { datum: true, betrag: true, verwendungszweck: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { kontokreis: "KAUTIONSKONTO" }, ...dedup },
        select: { datum: true, betrag: true, verwendungszweck: true },
      }),
      prisma.buchung.findMany({
        where: { buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...dedup },
        select: { datum: true, betrag: true },
      }),
      prisma.nichtZugeordneteBuchung.findMany({ select: { datum: true, betrag: true } }),
      prisma.buchungsart.findMany({
        where: { aktiv: true },
        select: { id: true, code: true, bezeichnung: true, kontokreis: true, zahlungswirksam: true },
        orderBy: { bezeichnung: "asc" },
      }),
    ]);

    const zahlungenNachVertrag = new Map<string, typeof zahlungenRaw>();
    for (const z of zahlungenRaw) {
      if (!z.mietvertragId) continue;
      const liste = zahlungenNachVertrag.get(z.mietvertragId) ?? [];
      liste.push(z);
      zahlungenNachVertrag.set(z.mietvertragId, liste);
    }
    const vertraegeMitZahlungen = vertraege.map((v) => ({
      id: v.id,
      zahlungen: (zahlungenNachVertrag.get(v.id) ?? []).map((z) => ({
        datum: z.datum!,
        betrag: z.betrag,
        verwendungszweck: z.verwendungszweck,
        aufteilungGruppeId: z.aufteilungGruppeId,
      })),
    }));

    // Ein Mieter kann selbst einmal als Kostenposition-Empfänger auftauchen (z.B. eine
    // Kleinreparatur- oder sonstige Kostenerstattung, die die Verwaltung an ihn überwiesen hat) —
    // beide Reihenfolgen (Vorname+Nachname und Nachname+Vorname, je nachdem wie die Bank den
    // Namen im Kontoauszug formatiert) werden hier ausgeschlossen, damit so ein einmaliger
    // Treffer nicht jede künftige Mietzahlung dieses Mieters fälschlich als "bekannter
    // Kosten-Empfänger" (siehe unten) blockiert — sonst bekäme diese Zeile nie wieder einen
    // Mietvertrags-Vorschlag, siehe zahlungen-import.ts.
    const eigeneMieterNamen = new Set(
      vertraege.flatMap((v) =>
        v.mieter.flatMap((m) => [
          normalizeText(`${m.vorname}${m.nachname}`),
          normalizeText(`${m.nachname}${m.vorname}`),
        ]),
      ),
    );
    // Für den Ausschluss bekannter Kosten-Empfänger aus dem Zahlungen-Mietvertrags-Vorschlag
    // (siehe Kommentar in zahlungen-import.ts) — dieselbe Quelle wie die weiter unten gebaute
    // EmpfaengerHistorie, hier aber nur die reinen Namen.
    const bekannteKostenEmpfaenger = new Set(
      bestehendeKostenpositionen
        .map((k) => normalizeText(k.empfaenger ?? ""))
        .filter((n) => n.length > 0 && !eigeneMieterNamen.has(n)),
    );

    const mietvertragKandidaten: MietvertragKandidat[] = vertraege.map((v) => ({
      id: v.id,
      // Name zuerst statt Einheit zuerst: in der durchsuchbaren Mietvertrag-Auswahl (siehe
      // MietvertragAuswahl in page.tsx) ist das Eingabefeld schmal, ein bereits ausgewähltes
      // Label wird also oft am Ende abgeschnitten — mit dem Namen vorn bleibt der wichtigste Teil
      // sichtbar, auch wenn die Einheit selbst nicht mehr angezeigt wird.
      label: `${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")} — ${v.einheit.bezeichnung}`,
      warmmiete: Number(v.kaltmiete) + Number(v.nebenkostenVorauszahlung),
      mieterNamen: v.mieter.map((m) => ({ vorname: m.vorname, nachname: m.nachname })),
      einheitBezeichnung: v.einheit.bezeichnung,
      beginn: v.beginn ? v.beginn.toISOString().slice(0, 10) : null,
      ende: v.ende ? v.ende.toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => {
      const [hausA, whgA] = einheitSortSchluessel(a.einheitBezeichnung);
      const [hausB, whgB] = einheitSortSchluessel(b.einheitBezeichnung);
      return hausA - hausB || whgA - whgB || a.einheitBezeichnung.localeCompare(b.einheitBezeichnung);
    });
    // Für die Kleinreparatur-Erkennung (siehe Kommentar in zahlungen-import.ts/kosten-import.ts):
    // die Id der Kostenart "Reparaturen" sowie alle bereits dort erfassten Beträge, auf den Cent
    // gerundet.
    const reparaturenKostenartId = kostenartenRaw.find((k) => k.name === "Reparaturen")?.id ?? null;
    const bekannteReparaturBetraege = new Set(
      bestehendeKostenpositionen
        .filter((k) => k.kostenartId === reparaturenKostenartId)
        .map((k) => Math.round(Number(k.betrag) * 100) / 100),
    );
    const bekannteWarmmieten = new Set(
      mietvertragKandidaten.map((k) => Math.round(k.warmmiete * 100) / 100),
    );

    const zahlungenRows = mapZahlungenRows(
      headers,
      rows,
      mietvertragKandidaten,
      bekannteKostenEmpfaenger,
      bekannteReparaturBetraege,
    );

    const kostenarten: KostenartKandidat[] = kostenartenRaw.map((k) => ({
      id: k.id,
      name: k.name,
      umlagefaehig: k.umlagefaehig,
    }));
    const gebaeude: GebaeudeKandidat[] = gebaeudeRaw.map((g) => ({
      id: g.id,
      label: `${g.strasse} ${g.hausnummer}`,
      strasse: g.strasse,
      hausnummer: g.hausnummer,
      haus: g.haus,
      kostengruppen: g.kostengruppen,
    }));
    const einheiten: EinheitMitAdresse[] = einheitenRaw;
    const einheitKandidaten: EinheitKandidat[] = einheitenRaw.map((e) => ({
      id: e.id,
      gebaeudeId: e.gebaeudeId,
      bezeichnung: e.bezeichnung,
    }));
    // Historie für den Empfänger→Kostenart-Vorschlag. Positionen ohne Empfänger (z.B. von der
    // Sparkasse ohne Namen abgebuchte Kontoführungsgebühren) bleiben drin — für die greift beim
    // Abgleich ein Verwendungszweck-Fallback statt des Empfänger-Namens.
    // kostenartId ist bei einer KOSTENPOSITION-Buchung immer gesetzt (nur das Schema selbst
    // erzwingt das nicht mehr, siehe Kommentar bei Buchung im Schema) — die Filterung hier ist
    // daher rein defensiv.
    const historie: EmpfaengerHistorie[] = bestehendeKostenpositionen
      .filter((k) => k.kostenartId !== null)
      .map((k) => {
        const rohdaten = (k.rohdaten as Record<string, string> | null) ?? {};
        const mandatsrefCol = findColumn(Object.keys(rohdaten), ["mandatsreferenz"]);
        return {
          empfaenger: k.empfaenger ?? "",
          kostenartId: k.kostenartId!,
          gebaeudeAuswahl: gebaeudeAuswahlWert(k.gebaeudeId, k.hausId, k.kostengruppeId, k.einheitId) || null,
          verwendungszweck: k.verwendungszweck,
          mandatsref: ermittleMandatsrefAusZeile(rohdaten, mandatsrefCol, k.verwendungszweck ?? ""),
        };
      });
    const mieterKandidaten: MieterKandidat[] = vertraege.flatMap((v) =>
      v.mieter.map((m) => ({
        vorname: m.vorname,
        nachname: m.nachname,
        einheitId: v.einheit.id,
        einheitTyp: v.einheit.typ,
      })),
    );
    const kostenRows = mapKostenRows(
      headers,
      rows,
      historie,
      gebaeude,
      mieterKandidaten,
      bekannteReparaturBetraege,
      reparaturenKostenartId,
      bekannteWarmmieten,
      einheitKandidaten,
    );
    const buchungenRohdaten = await prisma.buchung.findMany({ where: dedup, select: { rohdaten: true } });
    const bestehendeSets = berechneBestehendeImportSets({
      buchungenRohdaten,
      vertraegeMitZahlungen,
      bestehendeKostenpositionen,
      mietweiterleitungenRaw: bestehendeMietweiterleitungenRaw,
      kautionsbuchungenRaw: bestehendeKautionsbuchungenRaw,
      sonstigeZahlungenRaw: bestehendeSonstigenBuchungenRaw,
      nichtZugeordneteBuchungenRaw: bestehendeNichtZugeordnetenBuchungenRaw,
    });
    const zeilen = vereinheitlicheZeilen(zahlungenRows, kostenRows).map((z) => ({
      ...z,
      rohdatenSchluessel: zeilenSchluesselAusRohdaten(z.rohdaten),
    }));

    return {
      zeilen,
      mietvertragKandidaten: mietvertragKandidaten.map((k) => ({ id: k.id, label: k.label })),
      kostenarten,
      gebaeude,
      einheiten,
      buchungsarten: buchungsartenRaw,
      fileName: file.name,
      importBatchId: importBatch.id,
      ...bestehendeSets,
    };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Fehler beim Lesen der Datei: ${err.message}`
          : "Unbekannter Fehler beim Lesen der Datei.",
    };
  }
}

export type BuchungCommitRow = {
  // Vom Nutzer im Buchungsart-Dropdown gewählter Katalog-Code (Standard: der erste Kandidat aus
  // ermittleBuchungsartKandidaten, aber änderbar).
  buchungsartCode: string;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
  // Nur bei Buchungsart-Familie "MIETE"/"KAUTION"/"NEBENKOSTENAUSGLEICH" relevant.
  mietvertragId?: string | null;
  // Nur bei "MIETE" relevant.
  periodeMonat?: number | null;
  periodeJahr?: number | null;
  // Nur bei "KOSTEN" relevant.
  kostenartId?: string | null;
  gebaeudeAuswahl?: string | null;
  // Bei "KOSTEN" das Kostenjahr, bei "NEBENKOSTENAUSGLEICH" das Abrechnungsjahr (optional).
  jahr?: number | null;
};

// Ersetzt commitZahlungen/commitKosten/commitMietweiterleitungen/commitKautionsbuchungen/
// commitNebenkostenausgleich — eine Zeile kann jetzt jede beliebige Buchungsart aus dem Katalog
// tragen (vom Nutzer per Dropdown gewählt, siehe buchungen-tabelle.tsx), statt in eine von 5 fest
// zugeordneten Sektionen zu fallen. Pflichtfeld-Prüfung und Dedup-Formel bleiben je
// Buchungsart-Familie exakt dieselben wie in den vorherigen 5 Funktionen — nur die Zuordnung
// "welche Formel für diese Zeile" wird jetzt zur Laufzeit anhand der gewählten Buchungsart
// entschieden statt anhand der Sektion, in der die Zeile ursprünglich angezeigt wurde.
export async function commitBuchungen(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();
  const dedup = await ladeDedupFilter();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: BuchungCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Buchungen zum Importieren ausgewählt.";

  const gruppen = rows.map((r) => ({ row: r, gruppe: ermittleBuchungsartGruppe(r.buchungsartCode) }));
  const unbekannt = gruppen.filter((g) => g.gruppe === null);
  if (unbekannt.length > 0) {
    return `${unbekannt.length} Zeile(n) haben eine unbekannte Buchungsart.`;
  }
  const fehlendeMietvertrag = gruppen.filter(
    (g) => (g.gruppe === "MIETE" || g.gruppe === "SONDERZAHLUNG") && !g.row.mietvertragId,
  );
  if (fehlendeMietvertrag.length > 0) {
    return `${fehlendeMietvertrag.length} Zeile(n) mit Buchungsart "Mietzahlung"/"Gebühren-Zahlung" haben noch keinen Mietvertrag ausgewählt.`;
  }
  const fehlendeKostenart = gruppen.filter((g) => g.gruppe === "KOSTEN" && !g.row.kostenartId);
  if (fehlendeKostenart.length > 0) {
    return `${fehlendeKostenart.length} Zeile(n) mit Buchungsart "Kosten" haben noch keine Kostenart ausgewählt.`;
  }

  const arten = await ladeBuchungsartMap();

  // Nur Buchungsarten mit echtem Geldfluss lassen sich aus einer Bankzeile importieren.
  const sonstigeCodes = [...new Set(gruppen.filter((g) => g.gruppe === "SONSTIGE").map((g) => g.row.buchungsartCode))];
  if (sonstigeCodes.length > 0) {
    const nichtImportierbar = await prisma.buchungsart.findMany({
      where: { code: { in: sonstigeCodes }, OR: [{ zahlungswirksam: false }, { aktiv: false }] },
      select: { bezeichnung: true },
    });
    if (nichtImportierbar.length > 0) {
      return `Buchungsart "${nichtImportierbar[0].bezeichnung}" ist inaktiv oder nicht zahlungswirksam und lässt sich nicht aus einer Bankzeile importieren.`;
    }
  }

  // Pro Buchungsart-Familie dieselbe Dedup-Formel wie in den vorherigen 5 Commit-Funktionen — nur
  // einmal je tatsächlich vorkommender Familie abgefragt, nicht pro Zeile.
  const familien = new Set(gruppen.map((g) => g.gruppe!));
  const neu: (BuchungCommitRow & { gruppe: BuchungsartGruppe })[] = [];
  let uebersprungenGesamt = 0;

  if (familien.has("MIETE")) {
    const zeilen = gruppen.filter((g) => g.gruppe === "MIETE").map((g) => g.row);
    const bestehend = await prisma.buchung.findMany({
      where: {
        buchungsart: { code: "MIETZAHLUNG" },
        mietvertragId: { in: [...new Set(zeilen.map((r) => r.mietvertragId!))] },
        ...dedup,
      },
      select: { mietvertragId: true, datum: true, betrag: true, verwendungszweck: true },
    });
    const bestehendSet = new Set(
      bestehend
        .filter((z) => z.datum)
        .map(
          (z) =>
            `${z.mietvertragId}|${z.datum!.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`,
        ),
    );
    for (const r of zeilen) {
      const schluessel = `${r.mietvertragId}|${r.datum}|${r.betrag.toFixed(2)}|${r.verwendungszweck.trim().toLowerCase()}`;
      if (bestehendSet.has(schluessel)) uebersprungenGesamt++;
      else neu.push({ ...r, gruppe: "MIETE" });
    }
  }

  if (familien.has("KOSTEN")) {
    const zeilen = gruppen.filter((g) => g.gruppe === "KOSTEN").map((g) => g.row);
    const bestehend = await prisma.buchung.findMany({
      where: { buchungsart: { code: "KOSTENPOSITION" }, datum: { not: null }, ...dedup },
      select: { empfaenger: true, datum: true, betrag: true, verwendungszweck: true, aufteilungGruppeId: true },
    });
    // Aufgeteilte Positionen zu ihrem Summenbetrag zusammenfassen, sonst würde die ursprüngliche
    // Buchung hier nie als Duplikat erkannt (siehe Kommentar bei previewImport).
    const aufteilungSummen = new Map<string, number>();
    for (const k of bestehend) {
      if (!k.aufteilungGruppeId) continue;
      aufteilungSummen.set(k.aufteilungGruppeId, (aufteilungSummen.get(k.aufteilungGruppeId) ?? 0) + Number(k.betrag));
    }
    const bestehendSet = new Set(
      bestehend.map((k) =>
        kostenDedupSchluessel(
          k.empfaenger,
          k.datum,
          k.aufteilungGruppeId ? aufteilungSummen.get(k.aufteilungGruppeId)! : Number(k.betrag),
          k.verwendungszweck,
        ),
      ),
    );
    for (const r of zeilen) {
      const schluessel = kostenDedupSchluessel(r.empfaenger, new Date(r.datum), r.betrag, r.verwendungszweck);
      if (bestehendSet.has(schluessel)) uebersprungenGesamt++;
      else neu.push({ ...r, gruppe: "KOSTEN" });
    }
  }

  // Mietweiterleitung/Kaution/Nebenkostenausgleich nutzen dieselbe Dedup-Formel
  // (datumBetragZweckSchluessel), aber jeweils gegen ihre eigene Buchungsart-Familie geprüft —
  // exakt wie bisher, nur jetzt in einer Schleife statt drei fast identischen Funktionen.
  const sonstigeFamilien: { gruppe: BuchungsartGruppe; code?: string; kontokreis?: string }[] = [
    { gruppe: "MIETWEITERLEITUNG", code: "MIETWEITERLEITUNG" },
    { gruppe: "KAUTION", kontokreis: "KAUTIONSKONTO" },
    { gruppe: "NEBENKOSTENAUSGLEICH", code: "NEBENKOSTENAUSGLEICH" },
    { gruppe: "SONDERZAHLUNG", code: "SONDERZAHLUNG" },
  ];
  for (const { gruppe, code, kontokreis } of sonstigeFamilien) {
    if (!familien.has(gruppe)) continue;
    const zeilen = gruppen.filter((g) => g.gruppe === gruppe).map((g) => g.row);
    const bestehend = await prisma.buchung.findMany({
      where: {
        ...(code
          ? { buchungsart: { code } }
          : { buchungsart: { kontokreis: kontokreis as "MIETKONTO" | "KAUTIONSKONTO" | "OBJEKTKONTO" } }),
        ...dedup,
      },
      select: { datum: true, betrag: true, verwendungszweck: true },
    });
    const bestehendSet = new Set(
      bestehend.map((b) => datumBetragZweckSchluessel(b.datum, Number(b.betrag), b.verwendungszweck)),
    );
    for (const r of zeilen) {
      const schluessel = datumBetragZweckSchluessel(new Date(r.datum), r.betrag, r.verwendungszweck);
      if (bestehendSet.has(schluessel)) uebersprungenGesamt++;
      else neu.push({ ...r, gruppe });
    }
  }

  if (familien.has("SONSTIGE")) {
    for (const code of sonstigeCodes) {
      const zeilen = gruppen.filter((g) => g.gruppe === "SONSTIGE" && g.row.buchungsartCode === code).map((g) => g.row);
      const bestehend = await prisma.buchung.findMany({
        where: { buchungsart: { code }, ...dedup },
        select: { datum: true, betrag: true, verwendungszweck: true },
      });
      const bestehendSet = new Set(
        bestehend.map((b) => datumBetragZweckSchluessel(b.datum, Number(b.betrag), b.verwendungszweck)),
      );
      for (const r of zeilen) {
        const schluessel = datumBetragZweckSchluessel(new Date(r.datum), r.betrag, r.verwendungszweck);
        if (bestehendSet.has(schluessel)) uebersprungenGesamt++;
        else neu.push({ ...r, gruppe: "SONSTIGE" });
      }
    }
  }

  if (neu.length > 0) {
    await prisma.buchung.createMany({
      data: neu.map((r) => {
        const { gebaeudeId, hausId, kostengruppeId, einheitId } =
          r.gruppe === "KOSTEN" ? parseGebaeudeAuswahlWert(r.gebaeudeAuswahl ?? "") : {
            gebaeudeId: null,
            hausId: null,
            kostengruppeId: null,
            einheitId: null,
          };
        return {
          buchungsartId: arten.get(r.buchungsartCode)!,
          mietvertragId: r.mietvertragId || undefined,
          kostenartId: r.gruppe === "KOSTEN" ? r.kostenartId : undefined,
          gebaeudeId,
          hausId,
          kostengruppeId,
          einheitId,
          datum: new Date(r.datum),
          betrag: r.betrag,
          empfaenger: r.empfaenger || null,
          verwendungszweck: r.verwendungszweck || null,
          periodeMonat: r.gruppe === "MIETE" ? r.periodeMonat : undefined,
          periodeJahr: r.gruppe === "MIETE" ? r.periodeJahr : undefined,
          jahr: r.gruppe === "KOSTEN" || r.gruppe === "NEBENKOSTENAUSGLEICH" ? r.jahr : undefined,
          rohdaten: r.rohdaten,
          importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
        };
      }),
    });
  }

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Buchung(en) importiert${uebersprungenGesamt > 0 ? `, ${uebersprungenGesamt} übersprungen` : ""}`,
    );
  }

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/");
  revalidatePath("/kosten");
  revalidatePath("/mietweiterleitungen");
  revalidatePath("/kautionen");
  revalidatePath("/nebenkostenabrechnungen");
  revalidatePath("/nebenkostenausgleich");

  return `${neu.length} Buchung(en) importiert.${
    uebersprungenGesamt > 0 ? ` ${uebersprungenGesamt} als Duplikat übersprungen.` : ""
  }`;
}

// Eine Buchung, die der Nutzer in keiner der 5 Import-Sektionen sofort klar zuordnen kann,
// explizit als "nicht kategorisiert" parken statt sie beim Verlassen des Import-Wizards
// unwiederbringlich zu verlieren — siehe NichtZugeordneteBuchung. Bewusst kein Dedup-Check: die
// Anzeige oben auf /kosten filtert nichts weg, Mehrfach-Parken derselben Buchung ist harmlos und
// wird durch die "bereits gemerkt"-Markierung (bestehendeNichtZugeordnet) im Normalfall ohnehin
// verhindert.
export async function parkeAlsNichtKategorisiert(
  buchung: {
    datum: string;
    betrag: number;
    empfaenger: string | null;
    verwendungszweck: string | null;
    rohdaten: Record<string, string> | null;
    importBatchId: string;
  },
  quelle: string,
): Promise<string | null> {
  await requireEditor();

  await prisma.nichtZugeordneteBuchung.create({
    data: {
      datum: new Date(buchung.datum),
      betrag: buchung.betrag,
      empfaenger: buchung.empfaenger || null,
      verwendungszweck: buchung.verwendungszweck || null,
      rohdaten: buchung.rohdaten ?? undefined,
      importBatchId: buchung.importBatchId || undefined,
      quelle,
    },
  });

  revalidatePath("/kosten");

  return "Als nicht kategorisiert gemerkt.";
}
