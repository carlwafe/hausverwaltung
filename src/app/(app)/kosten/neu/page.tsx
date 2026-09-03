import { prisma } from "@/lib/prisma";
import { KostenpositionForm } from "../kostenposition-form";
import { createKostenposition } from "../actions";

export default async function NeueKostenpositionPage() {
  const [kostenarten, gebaeude] = await Promise.all([
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({ orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }] }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neue Kostenposition</h1>
      <KostenpositionForm
        kostenarten={kostenarten.map((k) => ({ id: k.id, label: k.name }))}
        gebaeude={gebaeude.map((g) => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}` }))}
        action={createKostenposition}
      />
    </div>
  );
}
