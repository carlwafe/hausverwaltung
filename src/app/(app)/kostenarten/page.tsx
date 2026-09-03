import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KostenartenTable, type KostenartRow } from "./kostenarten-table";

async function ladeKostenarten(): Promise<KostenartRow[]> {
  const kostenarten = await prisma.kostenart.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { kostenpositionen: true } } },
  });

  return kostenarten.map((k) => ({
    id: k.id,
    name: k.name,
    umlagefaehig: k.umlagefaehig,
    standardVerteilerschluessel: k.standardVerteilerschluessel,
    anzahlPositionen: k._count.kostenpositionen,
  }));
}

export default async function KostenartenPage() {
  const kostenarten = await ladeKostenarten();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Kostenarten</h1>
          <p className="text-sm text-neutral-400">
            {kostenarten.length} Kostenarten — legt fest, ob eine Kostenart auf Mieter umlagefähig
            ist und mit welchem Verteilerschlüssel.
          </p>
        </div>
        <Link
          href="/kostenarten/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neue Kostenart
        </Link>
      </div>

      <KostenartenTable rows={kostenarten} />
    </div>
  );
}
