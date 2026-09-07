"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
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
  type ParsedKostenRow,
} from "@/lib/import/kosten-import";
import { gebaeudeAuswahlWert, parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";
import { ermittleMandatsrefAusZeile, findColumn } from "@/lib/import/bank-csv";
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
      offeneNebenkostenPositionen: { id: string; label: string; mietvertragId: string | null }[];
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
      offeneNebenkostenPositionenRaw,
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
        },
      }),
      prisma.eigentuemerBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
      prisma.kautionBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
      prisma.nebenkostenabrechnungPosition.findMany({
        where: { beglichenAm: null },
        include: { abrechnung: true, einheit: true, mietvertrag: { include: { mieter: true } } },
      }),
    ]);

    const mietvertragKandidaten: MietvertragKandidat[] = vertraege.map((v) => ({
      id: v.id,
      // Name zuerst statt Einheit zuerst: in der durchsuchbaren Mietvertrag-Auswahl (siehe
      // MietvertragAuswahl in page.tsx) ist das Eingabefeld schmal, ein bereits ausgewähltes
      // Label wird also oft am Ende abgeschnitten — mit dem Namen vorn bleibt der wichtigste Teil
      // sichtbar, auch wenn die Einheit selbst nicht mehr angezeigt wird.
      label: `${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")} — ${v.einheit.bezeichnung}`,
      warmmiete: Number(v.kaltmiete) + Number(v.nebenkostenVorauszahlung),
      namen: v.mieter.flatMap((m) => [m.vorname, m.nachname]),
      einheitBezeichnung: v.einheit.bezeichnung,
      beginn: v.beginn.toISOString().slice(0, 10),
      ende: v.ende ? v.ende.toISOString().slice(0, 10) : null,
    }))
    .sort((a, b) => {
      const [hausA, whgA] = einheitSortSchluessel(a.einheitBezeichnung);
      const [hausB, whgB] = einheitSortSchluessel(b.einheitBezeichnung);
      return hausA - hausB || whgA - whgB || a.einheitBezeichnung.localeCompare(b.einheitBezeichnung);
    });
    const bestehendeZahlungen = new Set(
      vertraege.flatMap((v) =>
        v.zahlungen.map(
          (z) => `${v.id}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}`,
        ),
      ),
    );
    // Für den "bereits als Zahlung importiert"-Hinweis im Kosten-Import: Zahlung hat (anders als
    // Kostenposition.empfaenger) keine eigene Empfänger-Spalte, nur Verwendungszweck (Freitext)
    // und rohdaten (JSON der Original-CSV-Zeile mit uneinheitlichen Spaltennamen je nach Export)
    // — beide ungeeignet für einen zuverlässigen Namensabgleich. Der Schlüssel besteht deshalb
    // bewusst nur aus Datum+Betrag, ohne Namen; das ist etwas großzügiger als der
    // empfänger-basierte Schlüssel bei Kosten, aber hier reicht das als Hinweis-Badge. Betrag
    // als Betragshöhe ohne Vorzeichen, da Zahlung das Rohvorzeichen behält (positiv = normale
    // Miete, negativ = Rücklastschrift-Korrektur), Kosten eingehende Buchungen aber umgekehrt
    // als negativ speichert (siehe kosten-import.ts) — ein direkter Vorzeichenvergleich würde
    // hier nie matchen.
    const bestehendeZahlungenDatumBetrag = new Set(
      vertraege.flatMap((v) =>
        v.zahlungen.map(
          (z) => `${z.datum.toISOString().slice(0, 10)}|${Math.abs(Number(z.betrag)).toFixed(2)}`,
        ),
      ),
    );
    const zahlungenRows = mapZahlungenRows(headers, rows, mietvertragKandidaten);

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
    const kostenRows = mapKostenRows(headers, rows, historie, gebaeude);
    const bestehendeKosten = new Set(
      bestehendeKostenpositionen
        .filter((k) => k.datum)
        .map((k) => kostenDedupSchluessel(k.empfaenger, k.datum, Number(k.betrag), k.beschreibung)),
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
      offeneNebenkostenPositionen,
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
  await requireUser();

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
  const existingSet = new Set(
    existing.map(
      (z) => `${z.mietvertragId}|${z.datum.toISOString().slice(0, 10)}|${Number(z.betrag).toFixed(2)}`,
    ),
  );

  const neu = rows.filter(
    (r) => !existingSet.has(`${r.mietvertragId}|${r.datum}|${r.betrag.toFixed(2)}`),
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
  await requireUser();

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
    select: { empfaenger: true, datum: true, betrag: true, beschreibung: true },
  });
  const bestehendSet = new Set(
    bestehend.map((k) => kostenDedupSchluessel(k.empfaenger, k.datum, Number(k.betrag), k.beschreibung)),
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
  await requireUser();

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
};

export async function commitKautionsbuchungen(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUser();

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

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${neu.length} Kautionsbuchung(en) importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/kautionen");

  return `${neu.length} Kautionsbuchung(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}

type NebenkostenausgleichCommitRow = {
  positionId: string;
  datum: string;
  betrag: number; // Rohbetrag von der Bank (Vorzeichen wie im Kontoauszug)
};

export async function commitNebenkostenausgleich(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUser();

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

  // Vorzeichen gedreht, wie schon bei saldo: eine ausgehende Guthaben-Auszahlung (negativer
  // Rohbetrag) wird zu einem positiven beglichenBetrag, eine eingehende Nachzahlung (positiver
  // Rohbetrag) zu einem negativen — direkt mit saldo vergleichbar. Das where mit beglichenAm:
  // null verhindert, dass eine (z.B. durch doppeltes Absenden) bereits beglichene Position
  // stillschweigend überschrieben wird.
  const ergebnisse = await prisma.$transaction(
    rows.map((r) =>
      prisma.nebenkostenabrechnungPosition.updateMany({
        where: { id: r.positionId, beglichenAm: null },
        data: { beglichenAm: new Date(r.datum), beglichenBetrag: -r.betrag },
      }),
    ),
  );
  const beglichen = ergebnisse.reduce((sum, e) => sum + e.count, 0);
  const uebersprungen = rows.length - beglichen;

  if (typeof importBatchId === "string") {
    await ergaenzeImportBatchErgebnis(
      importBatchId,
      `${beglichen} Nebenkostenabrechnung(en) als beglichen markiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`,
    );
  }

  revalidatePath("/nebenkostenabrechnungen");

  return `${beglichen} Position(en) als beglichen markiert.${
    uebersprungen > 0 ? ` ${uebersprungen} bereits beglichen, übersprungen.` : ""
  }`;
}
