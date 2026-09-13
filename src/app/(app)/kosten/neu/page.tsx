import { prisma } from "@/lib/prisma";
import { KostenpositionForm } from "../kostenposition-form";
import { createKostenposition } from "../actions";
import { gruppiereGebaeude } from "@/lib/gebaeude-gruppen";
import { ladeVirtuelleAuszahlungen } from "../virtuelle-auszahlungen";

export default async function NeueKostenpositionPage() {
  const [kostenarten, gebaeude, virtuelleAuszahlungen] = await Promise.all([
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({
      orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
      include: {
        haus: { select: { id: true } },
        kostengruppen: { select: { id: true, bezeichnung: true } },
      },
    }),
    ladeVirtuelleAuszahlungen(),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neue Kostenposition</h1>
      <KostenpositionForm
        kostenarten={kostenarten.map((k) => ({ id: k.id, label: k.name }))}
        gebaeude={gruppiereGebaeude(gebaeude)}
        virtuelleAuszahlungen={virtuelleAuszahlungen}
        action={createKostenposition}
      />
    </div>
  );
}
