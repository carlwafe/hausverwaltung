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
import { parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";

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
      fileName: string;
      importBatchId: string;
    }
  | { error: string };

function kostenDedupSchluessel(empfaenger: string | null, datum: Date | null, betrag: number) {
  return `${(empfaenger ?? "").trim().toLowerCase()}|${datum ? datum.toISOString().slice(0, 10) : ""}|${betrag.toFixed(2)}`;
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
          datum: true,
          betrag: true,
          beschreibung: true,
        },
      }),
      prisma.eigentuemerBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
      prisma.kautionBuchung.findMany({ select: { datum: true, betrag: true, verwendungszweck: true } }),
    ]);

    const mietvertragKandidaten: MietvertragKandidat[] = vertraege.map((v) => ({
      id: v.id,
      label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
      warmmiete: Number(v.kaltmiete) + Number(v.nebenkostenVorauszahlung),
      namen: v.mieter.flatMap((m) => [m.vorname, m.nachname]),
      einheitBezeichnung: v.einheit.bezeichnung,
      beginn: v.beginn.toISOString().slice(0, 10),
      ende: v.ende ? v.ende.toISOString().slice(0, 10) : null,
    }));
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
    const historie: EmpfaengerHistorie[] = bestehendeKostenpositionen.map((k) => ({
      empfaenger: k.empfaenger ?? "",
      kostenartId: k.kostenartId,
      gebaeudeId: k.gebaeudeId,
      verwendungszweck: k.beschreibung,
    }));
    const kostenRows = mapKostenRows(headers, rows, historie, gebaeude);
    const bestehendeKosten = new Set(
      bestehendeKostenpositionen
        .filter((k) => k.datum)
        .map((k) => kostenDedupSchluessel(k.empfaenger, k.datum, Number(k.betrag))),
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
    select: { empfaenger: true, datum: true, betrag: true },
  });
  const bestehendSet = new Set(
    bestehend.map((k) => kostenDedupSchluessel(k.empfaenger, k.datum, Number(k.betrag))),
  );

  const neu = rows.filter(
    (r) => !bestehendSet.has(kostenDedupSchluessel(r.empfaenger, new Date(r.datum), r.betrag)),
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
