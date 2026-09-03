import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { GebaeudeTable, type GebaeudeRow } from "./gebaeude-table";

async function ladeGebaeude(): Promise<GebaeudeRow[]> {
  const gebaeudeRaw = await prisma.gebaeude.findMany({
    include: { _count: { select: { einheiten: true } } },
  });

  const sortiert = [...gebaeudeRaw].sort((a, b) => {
    const strasseCompare = a.strasse.localeCompare(b.strasse);
    if (strasseCompare !== 0) return strasseCompare;
    const hausCompare = (a.haus ?? "").localeCompare(b.haus ?? "");
    if (hausCompare !== 0) return hausCompare;
    return Number(a.hausnummer) - Number(b.hausnummer);
  });

  return sortiert.map((g) => ({
    id: g.id,
    strasse: g.strasse,
    haus: g.haus,
    hausnummer: g.hausnummer,
    einheitenCount: g._count.einheiten,
  }));
}

export default async function GebaeudePage() {
  const gebaeude = await ladeGebaeude();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gebäude</h1>
          <p className="text-sm text-neutral-400">
            {gebaeude.length} Gebäude (je eine Hausnummer) — Basis für die Nebenkostenabrechnung
          </p>
        </div>
        <Link
          href="/gebaeude/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neues Gebäude
        </Link>
      </div>

      <GebaeudeTable rows={gebaeude} />
    </div>
  );
}
