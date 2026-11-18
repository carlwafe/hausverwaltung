import { prisma } from "@/lib/prisma";
import { GebaeudeForm } from "../gebaeude-form";
import { createGebaeude } from "../actions";
import { hausLabel, vergleicheHaus } from "@/lib/gebaeude-gruppen";

export default async function NeuesGebaeudePage() {
  const haeuserRaw = await prisma.haus.findMany({ include: { gebaeude: true } });
  const haeuser = [...haeuserRaw].sort(vergleicheHaus).map((h) => ({ id: h.id, label: hausLabel(h.gebaeude) }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neues Gebäude</h1>
      <div className="max-w-2xl">
        <GebaeudeForm haeuser={haeuser} action={createGebaeude} abbrechenHref="/gebaeude" />
      </div>
    </div>
  );
}
