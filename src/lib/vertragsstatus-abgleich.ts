import { prisma } from "@/lib/prisma";
import { heuteDeutschland } from "@/lib/target-tage";

/**
 * Zieht den Status aller Verträge nach Beginn und Mietende nach (Regel: nachgezogenerStatus in
 * vertragsstatus.ts). Läuft nachts über /api/cron/vertragsstatus; zwei kleine Updates, meist ohne Treffer.
 */
export async function gleicheVertragsstatusAb(heute: Date = heuteDeutschland()) {
  const [beendet, aktiv] = await prisma.$transaction([
    prisma.mietvertrag.updateMany({
      where: { status: { in: ["AKTIV", "GEPLANT"] }, ende: { lt: heute } },
      data: { status: "BEENDET" },
    }),
    prisma.mietvertrag.updateMany({
      where: { status: "GEPLANT", OR: [{ beginn: null }, { beginn: { lte: heute } }] },
      data: { status: "AKTIV" },
    }),
  ]);
  return { beendet: beendet.count, aktiv: aktiv.count };
}
