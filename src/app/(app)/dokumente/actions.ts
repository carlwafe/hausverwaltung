"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { speichereDatei, loescheDatei } from "@/lib/storage";

type UploadZiel =
  | { buchungId: string; revalidatePath: string }
  | { mietvertragId: string; revalidatePath: string }
  | { einheitId: string; revalidatePath: string };

// "YYYY-MM-DD" aus einem Datumsfeld als UTC-Mitternacht (wie alle Datumswerte der App); leer/ungültig
// = kein Belegdatum.
function parseBelegDatum(wert: FormDataEntryValue | string | null): Date | null {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  const datum = new Date(`${wert}T00:00:00Z`);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

// Das "file"-Feld kann mehrfach vorkommen (z.B. mehrere Einheit-Fotos auf einmal, siehe
// FotosSektion) — hier bewusst per getAll statt get, damit ein- und mehrteilige Uploads
// dieselbe Action nutzen können.
export async function uploadDokument(
  ziel: UploadZiel,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireEditor();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return "Bitte eine Datei auswählen.";
  }

  // Optionales Belegdatum (Datum des Belegs selbst), gilt für alle Dateien dieses Uploads.
  const belegDatum = parseBelegDatum(formData.get("belegDatum"));

  for (const file of files) {
    const speicherpfad = await speichereDatei(Buffer.from(await file.arrayBuffer()), file.name);
    await prisma.dokument.create({
      data: {
        dateiname: file.name,
        speicherpfad,
        mimeType: file.type || null,
        groesseBytes: file.size,
        buchungId: "buchungId" in ziel ? ziel.buchungId : undefined,
        mietvertragId: "mietvertragId" in ziel ? ziel.mietvertragId : undefined,
        einheitId: "einheitId" in ziel ? ziel.einheitId : undefined,
        hochgeladenVon: user.email ?? user.name ?? null,
        belegDatum,
      },
    });
  }

  revalidatePath(ziel.revalidatePath);
  return null;
}

export async function deleteDokument(id: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();

  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) return;

  await prisma.dokument.delete({ where: { id } });
  await loescheDatei(dokument.speicherpfad);
  revalidatePath(revalidatePathValue);
}

export async function aendereBelegDatum(id: string, datum: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();
  await prisma.dokument.update({ where: { id }, data: { belegDatum: parseBelegDatum(datum) } });
  revalidatePath(revalidatePathValue);
}
