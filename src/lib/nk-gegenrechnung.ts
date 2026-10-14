import { prisma } from "./prisma";
import { Prisma } from "@/generated/prisma/client";
import { gegenrechnungenJeJahr, type Gegenrechnung } from "./nk-saldo";
import type { MietvertragFuerSollIst } from "./soll-ist";

/**
 * Gegenrechnungen der unbezahlten NK-Vorauszahlung (siehe `gegenrechnungenJeJahr`) für viele Verträge in
 * einer Abfrage — für Offene Posten und Dashboard. Es werden nur berechnete Positionen (`details` gesetzt)
 * versendeter Abrechnungen (Versanddatum bis zum Stichtag `bis`) geladen, und `details` selbst bleibt in der
 * Datenbank (nur der Filter läuft dort).
 */
export async function ladeNkGegenrechnungen(
  vertraege: {
    id: string;
    vertrag: Pick<MietvertragFuerSollIst, "kaltmiete" | "nebenkostenVorauszahlung" | "mieterhoehungen">;
    buchhaltungAb: Date | null;
  }[],
  bis: Date,
): Promise<Map<string, Gegenrechnung[]>> {
  const positionen = await prisma.nebenkostenabrechnungPosition.findMany({
    where: {
      mietvertragId: { in: vertraege.map((v) => v.id) },
      NOT: { details: { equals: Prisma.DbNull } },
      abrechnung: { versendetAm: { not: null, lte: bis } },
    },
    select: {
      mietvertragId: true,
      zeitraumVon: true,
      zeitraumBis: true,
      vorauszahlungGesamt: true,
      abrechnung: { select: { jahr: true, versendetAm: true } },
    },
  });
  const nachVertrag = new Map<string, typeof positionen>();
  for (const p of positionen) {
    if (!p.mietvertragId) continue;
    const l = nachVertrag.get(p.mietvertragId) ?? [];
    l.push(p);
    nachVertrag.set(p.mietvertragId, l);
  }
  const ergebnis = new Map<string, Gegenrechnung[]>();
  for (const v of vertraege) {
    const liste = gegenrechnungenJeJahr(
      v.vertrag,
      (nachVertrag.get(v.id) ?? []).map((p) => ({
        jahr: p.abrechnung.jahr,
        zeitraumVon: p.zeitraumVon,
        zeitraumBis: p.zeitraumBis,
        vorauszahlungGesamt: Number(p.vorauszahlungGesamt),
        versendetAm: p.abrechnung.versendetAm,
      })),
      v.buchhaltungAb,
    );
    if (liste.length > 0) ergebnis.set(v.id, liste);
  }
  return ergebnis;
}
