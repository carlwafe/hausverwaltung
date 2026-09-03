import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findeDuplikate } from "@/lib/mieter-duplikate";
import { MieterTable, type MieterRow } from "./mieter-table";

async function ladeMieter(): Promise<MieterRow[]> {
  const mieter = await prisma.mieter.findMany({
    orderBy: { nachname: "asc" },
    include: {
      mietvertraege: {
        where: { status: "AKTIV" },
        include: { einheit: true },
      },
    },
  });

  return mieter.map((m) => ({
    id: m.id,
    vorname: m.vorname,
    nachname: m.nachname,
    email: m.email,
    handynummer: m.handynummer,
    festnetznummer: m.festnetznummer,
    einheiten: m.mietvertraege.map((v) => v.einheit.bezeichnung),
  }));
}

export default async function MieterPage() {
  const mieter = await ladeMieter();
  const duplikatIds = [...new Set(findeDuplikate(mieter).flatMap((d) => [d.a.id, d.b.id]))];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mieter</h1>
          <p className="text-sm text-neutral-400">{mieter.length} Mieter insgesamt</p>
        </div>
        <Link
          href="/mieter/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neuer Mieter
        </Link>
      </div>

      <MieterTable rows={mieter} duplikatIds={duplikatIds} />
    </div>
  );
}
