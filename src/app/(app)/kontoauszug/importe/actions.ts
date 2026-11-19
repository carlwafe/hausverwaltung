"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireEditor } from "@/lib/session";
import { leseDatei, loescheDatei } from "@/lib/storage";
import {
  pruefeVollstaendigkeit,
  type CamtMonatsErgebnis,
  type VollstaendigkeitsErgebnis,
} from "@/lib/import/vollstaendigkeit";
import { ladeBekannteSchluessel, pruefeCamtMonat } from "@/lib/import/vollstaendigkeit-laden";

export async function pruefeImportVollstaendigkeit(
  importBatchId: string,
): Promise<VollstaendigkeitsErgebnis | { error: string }> {
  await requireUser();

  const batch = await prisma.importBatch.findUnique({ where: { id: importBatchId } });
  if (!batch || !batch.speicherpfad) {
    return { error: "Originaldatei nicht verfügbar." };
  }

  let inhalt: Buffer;
  try {
    inhalt = await leseDatei(batch.speicherpfad);
  } catch {
    return { error: "Originaldatei nicht mehr verfügbar." };
  }

  return pruefeVollstaendigkeit(inhalt, batch.dateiname, await ladeBekannteSchluessel());
}

/** Vollständigkeit eines Monats über alle CAMT-Importe (siehe `pruefeCamtMonat`). */
export async function pruefeCamtMonatVollstaendigkeit(
  monat: string,
): Promise<CamtMonatsErgebnis | { error: string }> {
  await requireUser();
  return pruefeCamtMonat(monat);
}

export async function raeumeVerwaisteImporteAuf(): Promise<void> {
  await requireEditor();

  const verwaist = await prisma.importBatch.findMany({
    where: {
      typ: "KONTOAUSZUG",
      buchungen: { none: {} },
      // Ein Batch, aus dem nur geparkte (noch nicht kategorisierte) Buchungen entstanden sind,
      // gilt nicht als verwaist — die Originaldatei wird für deren Rohdaten-Download noch
      // gebraucht (siehe NichtZugeordneteBuchung).
      nichtZugeordneteBuchungen: { none: {} },
    },
    select: { id: true, speicherpfad: true },
  });

  for (const batch of verwaist) {
    if (batch.speicherpfad) {
      await loescheDatei(batch.speicherpfad);
    }
  }
  await prisma.importBatch.deleteMany({ where: { id: { in: verwaist.map((b) => b.id) } } });

  revalidatePath("/kontoauszug/importe");
}
