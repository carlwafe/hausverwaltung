"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireEditor } from "@/lib/session";
import { leseDatei, loescheDatei } from "@/lib/storage";
import { pruefeVollstaendigkeit, zeilenSchluesselAusRohdaten, type VollstaendigkeitsErgebnis } from "@/lib/import/vollstaendigkeit";

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
    alleNichtZugeordneten,
  ] = await Promise.all([
      prisma.buchung.findMany({ where: { buchungsart: { code: "MIETZAHLUNG" } }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: "KOSTENPOSITION" } }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: "MIETWEITERLEITUNG" } }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { kontokreis: "KAUTIONSKONTO" } }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: "NEBENKOSTENAUSGLEICH" } }, select: { rohdaten: true } }),
      prisma.nichtZugeordneteBuchung.findMany({ select: { rohdaten: true } }),
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
  const nichtZugeordnet = new Set(
    alleNichtZugeordneten
      .map((n) => zeilenSchluesselAusRohdaten(n.rohdaten))
      .filter((s): s is string => s !== null),
  );

  return pruefeVollstaendigkeit(inhalt, batch.dateiname, {
    zahlung,
    kosten,
    mietweiterleitung,
    kautionsbuchung,
    sonstige,
    nichtZugeordnet,
  });
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
