"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import { speichereDatei } from "@/lib/storage";
import {
  mapKostenRows,
  type EmpfaengerHistorie,
  type GebaeudeKandidat,
  type KostenartKandidat,
  type ParsedKostenRow,
} from "@/lib/import/kosten-import";

export type PreviewResult =
  | {
      rows: ParsedKostenRow[];
      kostenarten: KostenartKandidat[];
      gebaeude: GebaeudeKandidat[];
      bestehendeKosten: string[];
      fileName: string;
      importBatchId: string;
    }
  | { error: string };

function dedupSchluessel(empfaenger: string | null, datum: Date | null, betrag: number) {
  return `${(empfaenger ?? "").trim().toLowerCase()}|${datum ? datum.toISOString().slice(0, 10) : ""}|${betrag.toFixed(2)}`;
}

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
        typ: "KOSTEN",
        dateiname: file.name,
        speicherpfad,
        anzahlZeilen: rows.length,
        user: { connect: { id: user.id } },
      },
    });

    const [kostenartenRaw, gebaeudeRaw, bestehendeKostenpositionen] = await Promise.all([
      prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
      prisma.gebaeude.findMany({ orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }] }),
      prisma.kostenposition.findMany({
        select: { empfaenger: true, kostenartId: true, gebaeudeId: true, datum: true, betrag: true },
      }),
    ]);

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
    }));

    // Historie für den Empfänger→Kostenart-Vorschlag: nur Positionen mit bekanntem Empfänger.
    const historie: EmpfaengerHistorie[] = bestehendeKostenpositionen
      .filter((k): k is typeof k & { empfaenger: string } => Boolean(k.empfaenger))
      .map((k) => ({ empfaenger: k.empfaenger, kostenartId: k.kostenartId, gebaeudeId: k.gebaeudeId }));

    const mapped = mapKostenRows(headers, rows, historie, gebaeude);

    const bestehendeKosten = new Set(
      bestehendeKostenpositionen
        .filter((k) => k.datum)
        .map((k) => dedupSchluessel(k.empfaenger, k.datum, Number(k.betrag))),
    );

    return {
      rows: mapped,
      kostenarten,
      gebaeude,
      bestehendeKosten: [...bestehendeKosten],
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

type CommitRow = {
  kostenartId: string;
  gebaeudeId: string | null;
  jahr: number;
  datum: string;
  betrag: number;
  empfaenger: string;
  verwendungszweck: string;
  rohdaten: Record<string, string>;
};

export async function commitImport(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUser();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  const importBatchId = formData.get("importBatchId");

  let rows: CommitRow[];
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
    bestehend.map((k) => dedupSchluessel(k.empfaenger, k.datum, Number(k.betrag))),
  );

  const neu = rows.filter(
    (r) => !bestehendSet.has(dedupSchluessel(r.empfaenger, new Date(r.datum), r.betrag)),
  );
  const uebersprungen = rows.length - neu.length;

  if (neu.length > 0) {
    await prisma.kostenposition.createMany({
      data: neu.map((r) => ({
        kostenartId: r.kostenartId,
        gebaeudeId: r.gebaeudeId,
        jahr: r.jahr,
        datum: new Date(r.datum),
        betrag: r.betrag,
        empfaenger: r.empfaenger || null,
        beschreibung: r.verwendungszweck || null,
        rohdaten: r.rohdaten,
        importBatchId: typeof importBatchId === "string" ? importBatchId : undefined,
      })),
    });
  }

  const ergebnis = `${neu.length} importiert${uebersprungen > 0 ? `, ${uebersprungen} übersprungen` : ""}`;
  if (typeof importBatchId === "string") {
    await prisma.importBatch.update({ where: { id: importBatchId }, data: { ergebnis } });
  }

  revalidatePath("/kosten");

  return `${neu.length} Kostenposition(en) importiert.${
    uebersprungen > 0 ? ` ${uebersprungen} als Duplikat übersprungen.` : ""
  }`;
}
