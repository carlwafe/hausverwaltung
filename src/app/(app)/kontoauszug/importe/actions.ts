"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireEditor } from "@/lib/session";
import { leseDatei, loescheDatei } from "@/lib/storage";
import { pruefeVollstaendigkeit, zeilenSchluesselAusRohdaten, type VollstaendigkeitsErgebnis } from "@/lib/import/vollstaendigkeit";
import { datumBetragSchluessel } from "@/lib/import/bank-csv";

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

  // Bewusst über den gesamten Bestand geprüft, nicht nur gegen diesen Batch: eine Zeile, die
  // schon in einem früheren Import gelandet ist und hier korrekt als Duplikat übersprungen
  // wurde, soll nicht fälschlich als "ungeklärt" gemeldet werden.
  const [
    alleZahlungen,
    alleKosten,
    alleMietweiterleitungen,
    alleKautionsbuchungen,
    alleSonstigenBuchungen,
    alleBeglichenenPositionen,
  ] = await Promise.all([
    prisma.zahlung.findMany({ select: { rohdaten: true } }),
    prisma.kostenposition.findMany({ select: { rohdaten: true } }),
    prisma.eigentuemerBuchung.findMany({ select: { rohdaten: true } }),
    prisma.kautionBuchung.findMany({ select: { rohdaten: true } }),
    prisma.sonstigeBuchung.findMany({ select: { rohdaten: true } }),
    prisma.nebenkostenabrechnungPosition.findMany({
      where: { beglichenAm: { not: null } },
      select: { beglichenAm: true, beglichenBetrag: true },
    }),
  ]);
  const zahlung = new Set(
    alleZahlungen
      .map((z) => zeilenSchluesselAusRohdaten(z.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const kosten = new Set(
    alleKosten
      .map((k) => zeilenSchluesselAusRohdaten(k.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const mietweiterleitung = new Set(
    alleMietweiterleitungen
      .map((m) => zeilenSchluesselAusRohdaten(m.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const kautionsbuchung = new Set(
    alleKautionsbuchungen
      .map((k) => zeilenSchluesselAusRohdaten(k.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const sonstige = new Set(
    alleSonstigenBuchungen
      .map((s) => zeilenSchluesselAusRohdaten(s.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const beglichenePositionen = new Set(
    alleBeglichenenPositionen
      .filter((p) => p.beglichenAm !== null)
      .map((p) => datumBetragSchluessel(p.beglichenAm, Number(p.beglichenBetrag))),
  );

  return pruefeVollstaendigkeit(inhalt, batch.dateiname, {
    zahlung,
    kosten,
    mietweiterleitung,
    kautionsbuchung,
    sonstige,
    beglichenePositionen,
  });
}

export async function raeumeVerwaisteImporteAuf(): Promise<void> {
  await requireEditor();

  const verwaist = await prisma.importBatch.findMany({
    where: {
      typ: "KONTOAUSZUG",
      zahlungen: { none: {} },
      kostenpositionen: { none: {} },
      eigentuemerbuchungen: { none: {} },
      kautionsbuchungen: { none: {} },
      sonstigeBuchungen: { none: {} },
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
