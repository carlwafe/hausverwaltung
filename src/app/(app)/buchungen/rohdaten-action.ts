"use server";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

// Die Listen (Zahlungen, Kosten) laden die Bankzeile (rohdaten) nicht mit, weil sie bei mehreren
// tausend Zeilen den Großteil der Datenmenge ausmacht — sie wird erst beim Aufklappen einer Zeile
// für genau diese Buchung geholt. Nur lesend, daher requireUser statt requireEditor.
export async function ladeBuchungRohdaten(buchungId: string): Promise<Record<string, string> | null> {
  await requireUser();
  const buchung = await prisma.buchung.findUnique({ where: { id: buchungId }, select: { rohdaten: true } });
  return (buchung?.rohdaten as Record<string, string> | null) ?? null;
}
