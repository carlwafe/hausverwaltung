"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseSpreadsheetFile } from "@/lib/import/spreadsheet";
import { mapEinheitenRows, type ParsedEinheitRow } from "@/lib/import/einheiten-import";

export type PreviewResult =
  | { headers: string[]; rows: ParsedEinheitRow[]; fileName: string }
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

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) {
    return { error: "Kein Objekt angelegt. Bitte zuerst unter Objekt ein Objekt anlegen." };
  }

  try {
    const { headers, rows } = await parseSpreadsheetFile(file);
    if (rows.length === 0) {
      return { error: "Keine Datenzeilen in der Datei gefunden." };
    }

    const mapped = mapEinheitenRows(headers, rows, {
      strasse: objekt.strasse,
      hausnummer: objekt.hausnummer,
    });

    const seen = new Map<string, number>();
    for (const r of mapped) {
      if (!r.bezeichnung) continue;
      const key = `${r.strasse}|${r.hausnummer}|${r.bezeichnung}`.toLowerCase();
      const firstRow = seen.get(key);
      if (firstRow) {
        r.errors.push(`Doppelte Bezeichnung im selben Gebäude (auch in Zeile ${firstRow})`);
      } else {
        seen.set(key, r.rowNumber);
      }
    }

    const existing = await prisma.einheit.findMany({ include: { gebaeude: true } });
    const existingSet = new Set(
      existing.map((e) => `${e.gebaeude.strasse}|${e.gebaeude.hausnummer}|${e.bezeichnung}`.toLowerCase()),
    );
    for (const r of mapped) {
      if (!r.bezeichnung) continue;
      const key = `${r.strasse}|${r.hausnummer}|${r.bezeichnung}`.toLowerCase();
      if (existingSet.has(key)) {
        r.errors.push("Existiert bereits in der Datenbank");
      }
    }

    return { headers, rows: mapped, fileName: file.name };
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Fehler beim Lesen der Datei: ${err.message}`
          : "Unbekannter Fehler beim Lesen der Datei.",
    };
  }
}

export async function commitImport(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();

  const raw = formData.get("rows");
  if (typeof raw !== "string") return "Keine Daten zum Importieren.";

  let rows: ParsedEinheitRow[];
  try {
    rows = JSON.parse(raw);
  } catch {
    return "Daten konnten nicht gelesen werden.";
  }

  const validRows = rows.filter((r) => r.errors.length === 0);
  if (validRows.length === 0) return "Keine gültigen Zeilen zum Importieren.";

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return "Kein Objekt vorhanden.";

  const skipped = rows.length - validRows.length;
  const fileName = formData.get("fileName")?.toString() ?? "unbekannt";

  await prisma.$transaction(async (tx) => {
    const gebaeudeCache = new Map<string, string>();

    for (const r of validRows) {
      const key = `${r.strasse}|${r.hausnummer}`;
      let gebaeudeId = gebaeudeCache.get(key);
      if (!gebaeudeId) {
        const gebaeude = await tx.gebaeude.upsert({
          where: {
            objektId_strasse_hausnummer: {
              objektId: objekt.id,
              strasse: r.strasse,
              hausnummer: r.hausnummer,
            },
          },
          create: { objektId: objekt.id, strasse: r.strasse, hausnummer: r.hausnummer },
          update: {},
        });
        gebaeudeId = gebaeude.id;
        gebaeudeCache.set(key, gebaeudeId);
      }

      await tx.einheit.create({
        data: {
          gebaeudeId,
          bezeichnung: r.bezeichnung,
          typ: r.typ,
          etage: r.etage || null,
          wohnflaecheQm: r.wohnflaecheQm as number,
        },
      });
    }

    await tx.importBatch.create({
      data: {
        typ: "EINHEITEN",
        dateiname: fileName,
        userId: user.id,
        anzahlZeilen: validRows.length,
        ergebnis: `${validRows.length} Einheiten importiert${skipped > 0 ? `, ${skipped} übersprungen` : ""}`,
      },
    });
  });

  revalidatePath("/einheiten");
  revalidatePath("/gebaeude");
  revalidatePath("/");
  return `${validRows.length} Einheiten wurden erfolgreich importiert.${
    skipped > 0 ? ` ${skipped} Zeile(n) wurden wegen Fehlern übersprungen.` : ""
  }`;
}
