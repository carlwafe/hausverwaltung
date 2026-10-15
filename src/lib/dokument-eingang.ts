// Prüfreihenfolge im Eingang: nach dem Hochladen öffnet sich das erste Dokument; von jedem Dokument aus führt ein Link zum
// nächsten, das noch geprüft werden muss (Eingang = noch nicht abgelegt, nicht ausgeblendet). Es springt nichts automatisch weiter,
// damit man ein abgelegtes Dokument noch einmal ansehen kann.
import { prisma } from "@/lib/prisma";

const EINGANG_WHERE = { eingang: true, ausgeblendetAm: null } as const;

/** Alle Dokumente im Eingang, älteste zuerst (Upload-Reihenfolge). Nur IDs, eine kleine Abfrage. */
async function eingangIds(): Promise<string[]> {
  const zeilen = await prisma.dokument.findMany({ where: EINGANG_WHERE, select: { id: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  return zeilen.map((z) => z.id);
}

/** Anzahl der Dokumente im Eingang und das nächste nach `aktuellId` (für die Anzeige „noch N im Eingang“). */
export async function eingangFortschritt(aktuellId: string): Promise<{ gesamt: number; naechsteId: string | null }> {
  const ids = await eingangIds();
  const i = ids.indexOf(aktuellId);
  const uebrig = ids.filter((x) => x !== aktuellId);
  const naechsteId = uebrig.length === 0 ? null : i === -1 ? uebrig[0] : ids[(i + 1) % ids.length];
  return { gesamt: ids.length, naechsteId };
}
