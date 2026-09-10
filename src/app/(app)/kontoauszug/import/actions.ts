"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireEditor } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import { speichereDatei } from "@/lib/storage";
import {
  mapZahlungenRows,
  type ParsedZahlungRow,
  type MietvertragKandidat,
} from "@/lib/import/zahlungen-import";
import {
  mapKostenRows,
  type EmpfaengerHistorie,
  type GebaeudeKandidat,
  type KostenartKandidat,
  type MieterKandidat,
  type ParsedKostenRow,
} from "@/lib/import/kosten-import";
import { gebaeudeAuswahlWert, parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";
import {
  datumBetragSchluessel,
  ermittleMandatsrefAusZeile,
  findColumn,
  normalizeText,
} from "@/lib/import/bank-csv";
import { einheitSortSchluessel } from "@/lib/einheit-sort";

export type PreviewResult =
  | {
      zahlungenRows: ParsedZahlungRow[];
      mietvertragKandidaten: { id: string; label: string }[];
      bestehendeZahlungen: string[];
      kostenRows: ParsedKostenRow[];
      kostenarten: KostenartKandidat[];
      gebaeude: GebaeudeKandidat[];
      bestehendeKosten: string[];
      bestehendeZahlungenDatumBetrag: string[];
      bestehendeMietweiterleitungen: string[];
      bestehendeKautionsbuchungen: string[];
      offeneKautionen: {
        mietvertragId: string;
        status: "AKTIV" | "AUFGELOEST";
        betrag: number;
        aufloesungsbetrag: number | null;
      }[];
      offeneNebenkostenPositionen: { id: string; label: string; mietvertragId: string | null }[];
      bestehendeNebenkostenausgleich: string[];
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
      bestehendeKostenpositionen,
      bestehendeMietweiterleitungenRaw,
      bestehendeKautionsbuchungenRaw,
      offeneKautionenRaw,
      offeneNebenkostenPositionenRaw,
      beglicheneNebenkostenPositionenRaw,
      bestehendeSonstigenBuchungenRaw,
    ] = await Promise.all([
      prisma.mietvertrag.findMany({
        where: { status: { in: ["AKTIV", "BEENDET"] } },
        include: { einheit: true, mieter: true, zahlungen: true },
      }),
      prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
      prisma.gebaeude.findMany({
        orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
        include: {
          haus: { select: { id: true } },
          kostengruppen: { select: { id: true, bezeichnung: true } },
        },
      }),
      prisma.kostenposition.findMany({
        select: {
          empfaenger: true,
          kostenartId: true,
          gebaeudeId: true,
          hausId: true,
          kostengruppeId: true,
          datum: true,
          betrag: true,
          beschreibung: true,
          rohdaten: true,
          aufteilungGruppeId: true,
        },
      }),
      prisma.eigentuemerBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
      prisma.kautionBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
      prisma.kaution.findMany({
        where: { status: { in: ["AKTIV", "AUFGELOEST"] } },
        select: { mietvertragId: true, status: true, betrag: true, aufloesungsbetrag: true },
      }),
      prisma.nebenkostenabrechnungPosition.findMany({
        where: { beglichenAm: null },
        include: { abrechnung: true, einheit: true, mietvertrag: { include: { mieter: true } } },
      }),
      prisma.nebenkostenabrechnungPosition.findMany({
        where: { beglichenAm: { not: null } },
        select: { beglichenAm: true, beglichenBetrag: true },
      }),
      prisma.sonstigeBuchung.findMany({ select: { datum: true, betrag: true } }),
    ]);

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
    // Verwendungszweck gehört mit in den Schlüssel, nicht nur Mietvertrag+Datum+Betrag: mehrere
    // Mieter zahlen oft am selben Tag denselben (Kaltmiete-)Betrag, und eine "mehrdeutig"-Zeile
    // ohne automatisch vorgeschlagenen Mietvertrag lässt sich versehentlich einem falschen,
    // aber zufällig genau an diesem Tag mit diesem Betrag bereits zahlenden Mietvertrag zuordnen
    // — ohne Verwendungszweck im Schlüssel würde das fälschlich als "bereits importiert" gemeldet,
    // obwohl die eigentlich gemeinte Buchung noch gar nicht importiert wurde.
    const bestehendeZahlungen = new Set(
      vertraege.flatMap((v) =>
        v.zahlungen.map(
          (z) =>
            `${v.id}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`,
        ),
      ),
    );
    // Für den "bereits als Zahlung importiert"-Hinweis im Kosten-Import, und als Rückfall in der
    // Zahlungen-Sektion selbst für Zeilen ohne gewählten Mietvertrag (z.B. "mehrdeutig"), wo der
    // präzise mietvertragsgebundene Schlüssel (bestehendeZahlungen oben) gar nicht erst gebildet
    // werden kann: Zahlung hat (anders als Kostenposition.empfaenger) keine eigene
    // Empfänger-Spalte, nur Verwendungszweck (Freitext) und rohdaten (JSON der Original-CSV-Zeile
    // mit uneinheitlichen Spaltennamen je nach Export) — beide ungeeignet für einen
    // zuverlässigen Namensabgleich. Der Schlüssel besteht deshalb aus Datum+Betrag+Verwendungszweck,
    // ohne Namen — Verwendungszweck ist trotzdem Pflicht im Schlüssel: nur Datum+Betrag allein
    // matcht sonst jede zufällig gleich hohe Zahlung eines ANDEREN Mietvertrags am selben Tag
    // (z.B. dieselbe Kaltmiete in mehreren Wohnungen) und meldet eine tatsächlich noch gar nicht
    // importierte Buchung fälschlich als bereits vorhanden. Betrag als Betragshöhe ohne
    // Vorzeichen, da Zahlung das Rohvorzeichen behält (positiv = normale Miete, negativ =
    // Rücklastschrift-Korrektur), Kosten eingehende Buchungen aber umgekehrt als negativ
    // speichert (siehe kosten-import.ts) — ein direkter Vorzeichenvergleich würde hier nie
    // matchen.
    const bestehendeZahlungenDatumBetrag = new Set(
      vertraege.flatMap((v) =>
        v.zahlungen.map(
          (z) =>
            `${z.datum.toISOString().slice(0, 10)}|${Math.abs(Number(z.betrag)).toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`,
        ),
      ),
    );
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
    // Historie für den Empfänger→Kostenart-Vorschlag. Positionen ohne Empfänger (z.B. von der
    // Sparkasse ohne Namen abgebuchte Kontoführungsgebühren) bleiben drin — für die greift beim
    // Abgleich ein Verwendungszweck-Fallback statt des Empfänger-Namens.
    const historie: EmpfaengerHistorie[] = bestehendeKostenpositionen.map((k) => {
      const rohdaten = (k.rohdaten as Record<string, string> | null) ?? {};
      const mandatsrefCol = findColumn(Object.keys(rohdaten), ["mandatsreferenz"]);
      return {
        empfaenger: k.empfaenger ?? "",
        kostenartId: k.kostenartId,
        gebaeudeAuswahl: gebaeudeAuswahlWert(k.gebaeudeId, k.hausId, k.kostengruppeId) || null,
        verwendungszweck: k.beschreibung,
        mandatsref: ermittleMandatsrefAusZeile(rohdaten, mandatsrefCol, k.beschreibung ?? ""),
      };
    });
    const mieterKandidaten: MieterKandidat[] = vertraege.flatMap((v) =>
      v.mieter.map((m) => ({ vorname: m.vorname, nachname: m.nachname })),
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
    );
    // Aufgeteilte Positionen (siehe kosten/actions.ts teileKostenpositionAuf) einzeln zu betrachten
    // würde eine erneut importierte Original-Buchung nie als "bereits importiert" erkennen —
    // keiner der Teilbeträge entspricht dem ursprünglich importierten Gesamtbetrag. Für den
    // Dedup-Schlüssel werden Positionen derselben Gruppe deshalb zu ihrem Summenbetrag
    // zusammengefasst, bevor der Schlüssel gebildet wird.
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
            k.beschreibung,
          ),
        ),
    );
    const bestehendeMietweiterleitungen = new Set(
      bestehendeMietweiterleitungenRaw.map((m) =>
        datumBetragZweckSchluessel(m.datum, Number(m.betrag), m.verwendungszweck),
      ),
    );
    const bestehendeKautionsbuchungen = new Set(
      bestehendeKautionsbuchungenRaw.map((k) =>
        datumBetragZweckSchluessel(k.datum, Number(k.betrag), k.verwendungszweck),
      ),
    );
    // Für den "als Kautionsrückzahlung markieren"-Vorschlag beim Import (siehe KautionSektion):
    // nur noch aktive Kautionen sind als Ziel sinnvoll, eine bereits zurückgezahlte würde sonst
    // ein zweites Mal überschrieben.
    const offeneKautionen = offeneKautionenRaw.map((k) => ({
      mietvertragId: k.mietvertragId,
      status: k.status as "AKTIV" | "AUFGELOEST",
      betrag: Number(k.betrag),
      aufloesungsbetrag: k.aufloesungsbetrag ? Number(k.aufloesungsbetrag) : null,
    }));
    // Kandidaten für den Nebenkostenausgleich-Import: nur noch nicht beglichene Positionen (siehe
    // where-Filter oben) — eine bereits beglichene Position taucht damit von selbst nicht mehr
    // als Ziel auf, ohne eigenen Dedup-Schlüssel. Label + Vorzeichen der Betragsangabe folgen
    // derselben Konvention wie saldo (positiv = Guthaben, negativ = Nachzahlung).
    const offeneNebenkostenPositionen = offeneNebenkostenPositionenRaw.map((p) => {
      const mieterNamen =
        p.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") ?? "unbekannt";
      const saldo = Number(p.saldo);
      const art = saldo >= 0 ? "Guthaben" : "Nachzahlung";
      const betragText = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(
        Math.abs(saldo),
      );
      return {
        id: p.id,
        label: `${p.abrechnung.jahr} — ${mieterNamen} — ${p.einheit.bezeichnung} (${art} ${betragText})`,
        mietvertragId: p.mietvertragId,
      };
    });
    const bestehendeNebenkostenausgleich = new Set([
      ...beglicheneNebenkostenPositionenRaw
        .filter((p) => p.beglichenAm !== null)
        .map((p) => datumBetragSchluessel(p.beglichenAm, Number(p.beglichenBetrag))),
      ...bestehendeSonstigenBuchungenRaw.map((s) => datumBetragSchluessel(s.datum, Number(s.betrag))),
    ]);

    return {
      zahlungenRows,
      mietvertragKandidaten: mietvertragKandidaten.map((k) => ({ id: k.id, label: k.label })),
      bestehendeZahlungen: [...bestehendeZahlungen],
      kostenRows,
      kostenarten,
      gebaeude,
      bestehendeKosten: [...bestehendeKosten],
      bestehendeZahlungenDatumBetrag: [...bestehendeZahlungenDatumBetrag],
      bestehendeMietweiterleitungen: [...bestehendeMietweiterleitungen],
      bestehendeKautionsbuchungen: [...bestehendeKautionsbuchungen],
      offeneKautionen,
      offeneNebenkostenPositionen,
      bestehendeNebenkostenausgleich: [...bestehendeNebenkostenausgleich],
      fileName: file.name,
      importBatchId: importBatch.id,
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

type ZahlungCommitRow = {
  mietvertragId: string;
  datum: string;
  betrag: number;
  periodeMonat: number;
  periodeJahr: number;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
};

export async function commitZahlungen(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: ZahlungCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Zahlungen zum Importieren ausgewählt.";

  const existing = await prisma.zahlung.findMany({
    where: { mietvertragId: { in: [...new Set(rows.map((r) => r.mietvertragId))] } },
  });
  // Verwendungszweck gehört mit in den Schlüssel, genau wie im Vorschau-Check (siehe
  // pruefeZahlungDuplikat in page.tsx) — sonst wirft z.B. Mietvertrag+Datum+Betrag mehrere
  // Monatsmieten, die derselbe Mieter am selben Tag mit demselben Betrag nachzahlt (Dez./Jan./
  // Feb. rückwirkend in einer Überweisung pro Monat), fälschlich in einen Topf: sobald einer
  // davon schon importiert ist, würden ohne Verwendungszweck im Schlüssel auch die anderen,
  // tatsächlich neuen Zahlungen hier als Duplikat übersprungen.
  const existingSet = new Set(
    existing.map(
      (z) =>
        `${z.mietvertragId}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}|${(z.verwendungszweck ?? "").trim().toLowerCase()}`,
    ),
  );

  const neu = rows.filter(
    (r) =>
      !existingSet.has(
        `${r.mietvertragId}|${r.datum}|${r.betrag.toFixed(2)}|${r.verwendungszweck.trim().toLowerCase()}`,
      ),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.zahlung.createMany({
      data: neu.map((r) => ({
        mietvertragId: r.mietvertragId,
        datum: new Date(r.datum),
        betrag: r.betrag,
        rohdaten: r.rohdaten,
        importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
        periodeMonat: r.periodeMonat,
        periodeJahr: r.periodeJahr,
        verwendungszweck: r.verwendungszweck || null,
      })),
    });
  }

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Zahlung(en) importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/");

  return `${neu.length} Zahlung(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}

type KostenCommitRow = {
  kostenartId: string;
  gebaeudeAuswahl: string;
  jahr: number;
  datum: string;
  betrag: number;
  empfaenger: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
};

export async function commitKosten(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: KostenCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Kostenpositionen zum Importieren ausgewählt.";

  const fehlende = rows.filter((r) => !r.kostenartId);
  if (fehlende.length > 0) {
    return `${fehlende.length} Zeile(n) haben noch keine Kostenart ausgewählt.`;
  }

  const bestehend = await prisma.kostenposition.findMany({
    where: { datum: { not: null } },
    select: { empfaenger: true, datum: true, betrag: true, beschreibung: true, aufteilungGruppeId: true },
  });
  // Siehe Kommentar bei previewImport: aufgeteilte Positionen zu ihrem Summenbetrag
  // zusammenfassen, sonst würde die ursprüngliche Buchung hier nie als Duplikat erkannt.
  const bestehendAufteilungSummen = new Map<string, number>();
  for (const k of bestehend) {
    if (!k.aufteilungGruppeId) continue;
    bestehendAufteilungSummen.set(
      k.aufteilungGruppeId,
      (bestehendAufteilungSummen.get(k.aufteilungGruppeId) ?? 0) + Number(k.betrag),
    );
  }
  const bestehendSet = new Set(
    bestehend.map((k) =>
      kostenDedupSchluessel(
        k.empfaenger,
        k.datum,
        k.aufteilungGruppeId ? bestehendAufteilungSummen.get(k.aufteilungGruppeId)! : Number(k.betrag),
        k.beschreibung,
      ),
    ),
  );

  const neu = rows.filter(
    (r) => !bestehendSet.has(kostenDedupSchluessel(r.empfaenger, new Date(r.datum), r.betrag, r.verwendungszweck)),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.kostenposition.createMany({
      data: neu.map((r) => {
        const { gebaeudeId, hausId, kostengruppeId } = parseGebaeudeAuswahlWert(r.gebaeudeAuswahl);
        return {
          kostenartId: r.kostenartId,
          gebaeudeId,
          hausId,
          kostengruppeId,
          jahr: r.jahr,
          datum: new Date(r.datum),
          betrag: r.betrag,
          empfaenger: r.empfaenger || null,
          beschreibung: r.verwendungszweck || null,
          rohdaten: r.rohdaten,
          importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
        };
      }),
    });
  }

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Kostenposition(en) importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/kosten");

  return `${neu.length} Kostenposition(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}

type MietweiterleitungCommitRow = {
  datum: string;
  betrag: number;
  empfaenger: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
};

export async function commitMietweiterleitungen(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: MietweiterleitungCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Mietweiterleitungen zum Importieren ausgewählt.";

  const bestehend = await prisma.eigentuemerBuchung.findMany({
    select: { datum: true, betrag: true, verwendungszweck: true },
  });
  const bestehendSet = new Set(
    bestehend.map((m) => datumBetragZweckSchluessel(m.datum, Number(m.betrag), m.verwendungszweck)),
  );

  const neu = rows.filter(
    (r) => !bestehendSet.has(datumBetragZweckSchluessel(new Date(r.datum), r.betrag, r.verwendungszweck)),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.eigentuemerBuchung.createMany({
      data: neu.map((r) => ({
        datum: new Date(r.datum),
        betrag: r.betrag,
        empfaenger: r.empfaenger || null,
        verwendungszweck: r.verwendungszweck || null,
        rohdaten: r.rohdaten,
        importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
      })),
    });
  }

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Mietweiterleitung(en) importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/mietweiterleitungen");

  return `${neu.length} Mietweiterleitung(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}

type KautionsbuchungCommitRow = {
  mietvertragId: string;
  datum: string;
  betrag: number;
  empfaenger: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
  // Nur eins von beidem ist jemals gesetzt (siehe KautionSektion: Auflösung nur für eingehende,
  // Auszahlung nur für ausgehende Buchungen anbietbar) — löst zusätzlich zum Anlegen der
  // KautionBuchung ein Update der verknüpften Kaution aus (siehe unten).
  aufloesungsdatum?: string;
  aufloesungsbetrag?: number;
  rueckzahlungsdatum?: string;
  rueckzahlungsbetrag?: number;
};

export async function commitKautionsbuchungen(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: KautionsbuchungCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Kautionsbuchungen zum Importieren ausgewählt.";

  const bestehend = await prisma.kautionBuchung.findMany({
    select: { datum: true, betrag: true, verwendungszweck: true },
  });
  const bestehendSet = new Set(
    bestehend.map((k) => datumBetragZweckSchluessel(k.datum, Number(k.betrag), k.verwendungszweck)),
  );

  const neu = rows.filter(
    (r) => !bestehendSet.has(datumBetragZweckSchluessel(new Date(r.datum), r.betrag, r.verwendungszweck)),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.kautionBuchung.createMany({
      data: neu.map((r) => ({
        mietvertragId: r.mietvertragId || undefined,
        datum: new Date(r.datum),
        betrag: r.betrag,
        empfaenger: r.empfaenger || null,
        verwendungszweck: r.verwendungszweck || null,
        rohdaten: r.rohdaten,
        importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
      })),
    });
  }

  // Für als Kautions-Auflösung oder -Auszahlung markierte Zeilen (siehe KautionSektion): die
  // verknüpfte Kaution wird über ihre eindeutige mietvertragId gefunden, es gibt dafür keine
  // eigene FK-Spalte an KautionBuchung — Kaution.mietvertragId ist ohnehin unique. Nur für
  // tatsächlich neu importierte Zeilen, damit ein erneuter Import eines bereits verarbeiteten
  // Duplikats die Kaution nicht ein zweites Mal überschreibt. Auflösungen zuerst, damit eine im
  // selben Batch enthaltene Auszahlung für dieselbe Kaution korrekt von AUFGELOEST (nicht mehr
  // AKTIV) aus weiterschaltet.
  const aufloesungen = neu.filter(
    (r) => r.mietvertragId && r.aufloesungsdatum && r.aufloesungsbetrag !== undefined,
  );
  let aufloesungenAktualisiert = 0;
  if (aufloesungen.length > 0) {
    const ergebnisse = await Promise.all(
      aufloesungen.map((r) =>
        prisma.kaution.updateMany({
          where: { mietvertragId: r.mietvertragId, status: "AKTIV" },
          data: {
            status: "AUFGELOEST",
            aufloesungsdatum: new Date(r.aufloesungsdatum!),
            aufloesungsbetrag: r.aufloesungsbetrag,
          },
        }),
      ),
    );
    aufloesungenAktualisiert = ergebnisse.reduce((s, e) => s + e.count, 0);
  }

  const rueckzahlungen = neu.filter(
    (r) => r.mietvertragId && r.rueckzahlungsdatum && r.rueckzahlungsbetrag !== undefined,
  );
  let rueckzahlungenAktualisiert = 0;
  if (rueckzahlungen.length > 0) {
    const ergebnisse = await Promise.all(
      rueckzahlungen.map((r) =>
        prisma.kaution.updateMany({
          where: { mietvertragId: r.mietvertragId, status: { in: ["AKTIV", "AUFGELOEST"] } },
          data: {
            status: "ZURUECKGEZAHLT",
            rueckzahlungsdatum: new Date(r.rueckzahlungsdatum!),
            rueckzahlungsbetrag: r.rueckzahlungsbetrag,
          },
        }),
      ),
    );
    rueckzahlungenAktualisiert = ergebnisse.reduce((s, e) => s + e.count, 0);
  }

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Kautionsbuchung(en) importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}${
        aufloesungenAktualisiert > 0 ? `, ${aufloesungenAktualisiert} Kaution(en) als aufgelöst markiert` : ""
      }${
        rueckzahlungenAktualisiert > 0 ? `, ${rueckzahlungenAktualisiert} Kaution(en) als zurückgezahlt markiert` : ""
      }`,
    );
  }

  if (aufloesungenAktualisiert > 0 || rueckzahlungenAktualisiert > 0) revalidatePath("/mietvertraege");

  revalidatePath("/kautionen");

  return `${neu.length} Kautionsbuchung(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }${aufloesungenAktualisiert > 0 ? ` ${aufloesungenAktualisiert} Kaution(en) als aufgelöst markiert.` : ""}${
    rueckzahlungenAktualisiert > 0 ? ` ${rueckzahlungenAktualisiert} Kaution(en) als zurückgezahlt markiert.` : ""
  }`;
}

// Sentinel statt einer echten Position-ID: für eine als Nebenkostenausgleich erkannte Buchung,
// zu der es keine offene NebenkostenabrechnungPosition gibt und auch nie geben wird (z.B. eine
// Rückzahlung für ein Jahr, dessen Abrechnung schon vor dieser App extern erstellt wurde) — wird
// als SonstigeBuchung rein archivarisch abgelegt, damit die Vollständigkeitsprüfung die Zeile
// als geklärt erkennt, ohne dass irgendeine Berechnung (Offene Posten, Nebenkostenabrechnung)
// davon berührt wird. Nicht exportiert, da eine "use server"-Datei nur async-Funktionen
// exportieren darf — derselbe Literal ist in page.tsx als SONSTIGE_SENTINEL dupliziert, beide
// Stellen sind über diesen Kommentar verknüpft.
const NEBENKOSTENAUSGLEICH_SONSTIGE_SENTINEL = "__sonstige__";

type NebenkostenausgleichCommitRow = {
  positionId: string; // echte Position-ID, oder NEBENKOSTENAUSGLEICH_SONSTIGE_SENTINEL
  mietvertragId: string | null;
  datum: string;
  betrag: number; // Rohbetrag von der Bank (Vorzeichen wie im Kontoauszug)
  empfaenger: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
};

export async function commitNebenkostenausgleich(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: NebenkostenausgleichCommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Buchungen zum Importieren ausgewählt.";

  const fehlende = rows.filter((r) => !r.positionId);
  if (fehlende.length > 0) {
    return `${fehlende.length} Zeile(n) haben noch keine Position ausgewählt.`;
  }

  const positionRows = rows.filter((r) => r.positionId !== NEBENKOSTENAUSGLEICH_SONSTIGE_SENTINEL);
  const sonstigeRows = rows.filter((r) => r.positionId === NEBENKOSTENAUSGLEICH_SONSTIGE_SENTINEL);

  // Vorzeichen gedreht, wie schon bei saldo: eine ausgehende Guthaben-Auszahlung (negativer
  // Rohbetrag) wird zu einem positiven beglichenBetrag, eine eingehende Nachzahlung (positiver
  // Rohbetrag) zu einem negativen — direkt mit saldo vergleichbar. Das where mit beglichenAm:
  // null verhindert, dass eine (z.B. durch doppeltes Absenden) bereits beglichene Position
  // stillschweigend überschrieben wird.
  const positionErgebnisse =
    positionRows.length > 0
      ? await prisma.$transaction(
          positionRows.map((r) =>
            prisma.nebenkostenabrechnungPosition.updateMany({
              where: { id: r.positionId, beglichenAm: null },
              data: { beglichenAm: new Date(r.datum), beglichenBetrag: -r.betrag },
            }),
          ),
        )
      : [];
  const beglichen = positionErgebnisse.reduce((sum, e) => sum + e.count, 0);

  // Dedup wie bei Kaution/Mietweiterleitung: gegen den gesamten Bestand, nicht nur diesen Batch.
  let sonstigeNeu = 0;
  if (sonstigeRows.length > 0) {
    const bestehend = await prisma.sonstigeBuchung.findMany({
      select: { datum: true, betrag: true, verwendungszweck: true },
    });
    const bestehendSet = new Set(
      bestehend.map((s) => datumBetragZweckSchluessel(s.datum, Number(s.betrag), s.verwendungszweck)),
    );
    const neu = sonstigeRows.filter(
      (r) => !bestehendSet.has(datumBetragZweckSchluessel(new Date(r.datum), r.betrag, r.verwendungszweck)),
    );
    sonstigeNeu = neu.length;
    if (neu.length > 0) {
      await prisma.sonstigeBuchung.createMany({
        data: neu.map((r) => ({
          mietvertragId: r.mietvertragId || undefined,
          datum: new Date(r.datum),
          betrag: r.betrag,
          empfaenger: r.empfaenger || null,
          verwendungszweck: r.verwendungszweck || null,
          rohdaten: r.rohdaten,
          importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
        })),
      });
    }
  }

  const uebersprungen = positionRows.length - beglichen + (sonstigeRows.length - sonstigeNeu);

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${beglichen} Nebenkostenabrechnung(en) als beglichen markiert, ${sonstigeNeu} sonstige Buchung(en) archiviert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/nebenkostenabrechnungen");

  return `${beglichen} Position(en) als beglichen markiert, ${sonstigeNeu} sonstige Buchung(en) archiviert.${
    uebersprungen > 0 ? ` ${uebersprungen} bereits vorhanden, übersprungen.` : ""
  }`;
}
