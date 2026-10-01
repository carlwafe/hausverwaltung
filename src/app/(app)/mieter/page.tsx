import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findeDuplikate } from "@/lib/mieter-duplikate";
import { MieterTable, type MieterRow } from "./mieter-table";

async function ladeMieter(): Promise<MieterRow[]> {
  const mieter = await prisma.mieter.findMany({
    orderBy: { nachname: "asc" },
    include: {
      mietvertraege: {
        include: { einheit: true },
      },
    },
  });

  return mieter.map((m) => {
    const aktive = m.mietvertraege.filter((v) => v.status === "AKTIV");
    const status: MieterRow["status"] = aktive.length
      ? "AKTIV"
      : m.mietvertraege.some((v) => v.status === "GEPLANT")
        ? "GEPLANT"
        : "INAKTIV";
    return {
    id: m.id,
    vorname: m.vorname,
    nachname: m.nachname,
    email: m.email,
    handynummer: m.handynummer,
    festnetznummer: m.festnetznummer,
    buergergeldEmpfaenger: m.buergergeldEmpfaenger,
    einheiten: aktive.map((v) => v.einheit.bezeichnung),
    status,
  };
  });
}

export default async function MieterPage() {
  const mieter = await ladeMieter();
  const duplikatIds = [...new Set(findeDuplikate(mieter).flatMap((d) => [d.a.id, d.b.id]))];

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mieter</h1>
          <p className="text-sm text-neutral-400">{mieter.length} Mieter insgesamt, {mieter.filter((m) => m.status === "AKTIV").length} aktiv</p>
          <p className="text-xs text-neutral-500">
            Status: Aktiv = mindestens ein laufender Mietvertrag, Geplant = nur ein künftiger
            Vertrag, Inaktiv = kein laufender oder geplanter Vertrag mehr.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mieter/anrede"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Anrede erfassen
          </Link>
          <Link
            href="/mieter/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neuer Mieter
          </Link>
        </div>
      </div>

      <MieterTable rows={mieter} duplikatIds={duplikatIds} />
    </div>
  );
}
