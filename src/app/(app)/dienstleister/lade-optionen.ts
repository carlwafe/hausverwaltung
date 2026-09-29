import { prisma } from "@/lib/prisma";
import { gruppiereGebaeude } from "@/lib/gebaeude-gruppen";
import { ladeEinheitenFuerAuswahl } from "../kosten/einheiten-liste";

export async function ladeFormularOptionen() {
  const [kostenarten, gebaeude, einheiten] = await Promise.all([
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({
      orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
      include: {
        haus: { select: { id: true, reihenfolge: true } },
        kostengruppen: { select: { id: true, bezeichnung: true } },
      },
    }),
    ladeEinheitenFuerAuswahl(),
  ]);
  return {
    kostenarten: kostenarten.map((k) => ({ id: k.id, label: k.name })),
    gebaeude: gruppiereGebaeude(gebaeude, einheiten),
  };
}
