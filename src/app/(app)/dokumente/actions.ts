"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { speichereDatei, loescheDatei } from "@/lib/storage";

type UploadZiel =
  | { kostenpositionId: string; revalidatePath: string }
  | { mietvertragId: string; revalidatePath: string };

export async function uploadDokument(
  ziel: UploadZiel,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireUser();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return "Bitte eine Datei auswählen.";
  }

  const speicherpfad = await speichereDatei(Buffer.from(await file.arrayBuffer()), file.name);
  await prisma.dokument.create({
    data: {
      dateiname: file.name,
      speicherpfad,
      mimeType: file.type || null,
      groesseBytes: file.size,
      kostenpositionId: "kostenpositionId" in ziel ? ziel.kostenpositionId : undefined,
      mietvertragId: "mietvertragId" in ziel ? ziel.mietvertragId : undefined,
      hochgeladenVon: user.email ?? user.name ?? null,
    },
  });

  revalidatePath(ziel.revalidatePath);
  return null;
}

export async function deleteDokument(id: string, revalidatePathValue: string): Promise<void> {
  await requireUser();

  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) return;

  await prisma.dokument.delete({ where: { id } });
  await loescheDatei(dokument.speicherpfad);
  revalidatePath(revalidatePathValue);
}
