import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import { gegenrechnungenJeJahr } from "./nk-saldo";
import type { MietvertragFuerSollIst } from "./soll-ist";

/**
 * Gegenrechnungen der unbezahlten NK-Vorauszahlung (siehe `gegenrechnungenJeJahr`) für viele Verträge in
 * einer Abfrage — für Offene Posten und Dashboard. Es werden nur berechnete Positionen (`details` gesetzt)
 * geladen, und `details` selbst bleibt in der Datenbank (nur der Filter läuft dort).
 */
export async function ladeNkGegenrechnungen(
  vertraege: {
    id: string;
    vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">;
    buchhaltungAb: Date | null;
  }[],
  abrechnungsjahrBis: number,
): Promise<Map<string, { jahr: number; betrag: number }[]>> {
  const positionen = await prisma.nebenkostenabrechnungPosition.findMany({
    where: {
      mietvertragId: { in: vertraege.map((v) => v.id) },
      NOT: { details: { equals: Prisma.DbNull } },
      abrechnung: { jahr: { lte: abrechnungsjahrBis } },
    },
    select: {
      mietvertragId: true,
      zeitraumVon: true,
      zeitraumBis: true,
      vorauszahlungGesamt: true,
      abrechnung: { select: { jahr: true } },
    },
  });
  const nachVertrag = new Map<string, typeof positionen>();
  for (const p of positionen) {
    if (!p.mietvertragId) continue;
    const l = nachVertrag.get(p.mietvertragId) ?? [];
    l.push(p);
    nachVertrag.set(p.mietvertragId, l);
  }
  const ergebnis = new Map<string, { jahr: number; betrag: number }[]>();
  for (const v of vertraege) {
    const liste = gegenrechnungenJeJahr(
      v.vertrag,
      (nachVertrag.get(v.id) ?? []).map((p) => ({
        jahr: p.abrechnung.jahr,
        zeitraumVon: p.zeitraumVon,
        zeitraumBis: p.zeitraumBis,
        vorauszahlungGesamt: Number(p.vorauszahlungGesamt),
      })),
      v.buchhaltungAb,
    );
    if (liste.length > 0) ergebnis.set(v.id, liste);
  }
  return ergebnis;
}
