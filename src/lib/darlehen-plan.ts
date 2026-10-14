import { prisma } from "@/lib/prisma";
import { berechneTilgungsplan, type Zinsstufe } from "@/lib/tilgungsplan";
import type { DarlehenPlanRate } from "@/lib/darlehen-plan-match";

/** Raten der laufenden Darlehen für den Kontoauszug-Import (Vorjahr bis Folgejahr, damit die Daten klein bleiben). */
export async function ladeDarlehenPlanRaten(): Promise<DarlehenPlanRate[]> {
  const darlehen = await prisma.darlehen.findMany({ where: { aktiv: true } });
  const jahr = new Date().getUTCFullYear();
  const result: DarlehenPlanRate[] = [];
  for (const d of darlehen) {
    const raten = berechneTilgungsplan({
      startRestschuld: Number(d.startRestschuld),
      startDatum: d.startDatum,
      rate: Number(d.rate),
      zinssatz: Number(d.zinssatz),
      zahltag: d.zahltag,
      laufzeitEnde: d.laufzeitEnde,
      zinsbindungBis: d.zinsbindungBis,
      stufen: (d.stufen as Zinsstufe[] | null) ?? [],
    });
    for (const r of raten) {
      if (r.jahr < jahr - 1 || r.jahr > jahr + 1) continue;
      result.push({ darlehenId: d.id, bezeichnung: d.bezeichnung, datum: r.datum.toISOString().slice(0, 10), rate: r.rate, zins: r.zins });
    }
  }
  return result;
}
