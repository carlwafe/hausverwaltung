"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import {
  mapVertraegeRows,
  type ParsedVertragRow,
  type EinheitKandidat,
  type MieterKandidat,
} from "@/lib/import/mietvertraege-import";

const WHG_NR_PATTERN = /WHG\s+(\d+)/i;
const GARAGE_NR_PATTERN = /Garage\s+(\d+)/i;

function extractEinheitNr(bezeichnung: string): string {
  const whgMatch = bezeichnung.match(WHG_NR_PATTERN);
  if (whgMatch) return whgMatch[1];
  const garageMatch = bezeichnung.match(GARAGE_NR_PATTERN);
  if (garageMatch) return garageMatch[1];
  return bezeichnung.trim().toLowerCase();
}

export type PreviewResult =
  | {
      rows: ParsedVertragRow[];
      einheiten: { id: string; label: string }[];
      fileName: string;
    }
  | { error: string };

export async function previewImport(
  _prev: PreviewResult | null,
  formData: FormData,
): Promise<PreviewResult> {
  await requireUser();

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

    const [einheitenRaw, mieterRaw, bestehendeVertraege] = await Promise.all([
      prisma.einheit.findMany({ include: { gebaeude: true } }),
      prisma.mieter.findMany(),
      prisma.mietvertrag.findMany({ select: { einheitId: true, beginn: true } }),
    ]);

    const einheitenKandidaten: EinheitKandidat[] = einheitenRaw.map((e) => ({
      id: e.id,
      hausnummer: e.gebaeude.hausnummer,
      whgNr: extractEinheitNr(e.bezeichnung),
      typ: e.typ,
      label: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} — ${e.bezeichnung}`,
    }));

    const mieterKandidaten: MieterKandidat[] = mieterRaw.map((m) => ({
      id: m.id,
      vorname: m.vorname,
      nachname: m.nachname,
    }));

    const mapped = mapVertraegeRows(headers, rows, einheitenKandidaten, mieterKandidaten);

    const bestehendeSet = new Set(
      bestehendeVertraege.map(
        (v) => `${v.einheitId}|${v.beginn ? v.beginn.toISOString().slice(0, 10) : "unbekannt"}`,
      ),
    );
    for (const r of mapped) {
      if (r.einheitId && r.beginn && bestehendeSet.has(`${r.einheitId}|${r.beginn}`)) {
        r.bereitsVorhanden = true;
      }
    }

    return {
      rows: mapped,
      einheiten: einheitenKandidaten.map((e) => ({ id: e.id, label: e.label })),
      fileName: file.name,
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

type CommitMieter = { mieterId: string | null; vorname: string; nachname: string };

type CommitRow = {
  einheitId: string;
  mieter: CommitMieter[];
  beginn: string;
  ende: string | null;
  kaltmiete: number;
  nebenkostenVorauszahlung: number;
};

export async function commitImport(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireUser();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  let rows: CommitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  if (rows.length === 0) return "Keine Mietverträge zum Importieren ausgewählt.";

  let erstellt = 0;
  const uebersprungen: string[] = [];

  await prisma.$transaction(async (tx) => {
    for (const row of rows) {
      const bestehender = await tx.mietvertrag.findFirst({
        where: { einheitId: row.einheitId, beginn: new Date(row.beginn) },
      });
      if (bestehender) {
        uebersprungen.push(row.einheitId);
        continue;
      }

      const mieterIds: string[] = [];
      for (const m of row.mieter) {
        if (m.mieterId) {
          mieterIds.push(m.mieterId);
        } else if (m.vorname || m.nachname) {
          const neuerMieter = await tx.mieter.create({
            data: { vorname: m.vorname || "-", nachname: m.nachname || "-" },
          });
          mieterIds.push(neuerMieter.id);
        }
      }
      if (mieterIds.length === 0) {
        uebersprungen.push(row.einheitId);
        continue;
      }

      await tx.mietvertrag.create({
        data: {
          einheit: { connect: { id: row.einheitId } },
          mieter: { connect: mieterIds.map((id) => ({ id })) },
          beginn: new Date(row.beginn),
          ende: row.ende ? new Date(row.ende) : undefined,
          kaltmiete: row.kaltmiete,
          nebenkostenVorauszahlung: row.nebenkostenVorauszahlung,
          status: "AKTIV",
        },
      });
      erstellt++;
    }
  });

  revalidatePath("/mietvertraege");
  revalidatePath("/mieter");
  revalidatePath("/");

  return `${erstellt} Mietvertrag/Mietverträge importiert.${
    uebersprungen.length > 0 ? ` ${uebersprungen.length} übersprungen (bereits vorhanden).` : ""
  }`;
}
