import { prisma } from "@/lib/prisma";
import type { EinheitMitAdresse } from "@/lib/gebaeude-gruppen";

// Für die Einheit-Auswahl bei Kostenpositionen (siehe gruppiereGebaeude) — von
// kosten/neu/page.tsx und kosten/[id]/page.tsx genutzt.
export async function ladeEinheitenFuerAuswahl(): Promise<EinheitMitAdresse[]> {
  return prisma.einheit.findMany({
    select: {
      id: true,
      bezeichnung: true,
      gebaeudeId: true,
      gebaeude: { select: { strasse: true, hausnummer: true } },
    },
  });
}
