import { prisma } from "@/lib/prisma";
import { GebaeudeForm } from "../gebaeude-form";
import { createGebaeude } from "../actions";
import { hausLabel } from "@/lib/gebaeude-gruppen";

export default async function NeuesGebaeudePage() {
  const haeuserRaw = await prisma.haus.findMany({ include: { gebaeude: true } });
  const haeuser = haeuserRaw.map((h) => ({ id: h.id, label: hausLabel(h.gebaeude) }));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neues Gebäude</h1>
      <GebaeudeForm haeuser={haeuser} action={createGebaeude} />
    </div>
  );
}
