import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MietvertraegeTable, type VertragRow } from "./mietvertraege-table";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";

async function ladeVertraege(): Promise<VertragRow[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    include: { einheit: true, mieter: true },
  });

  return vertraege
    .map((v) => ({
      id: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
      beginn: v.beginn.toISOString(),
      ende: v.ende ? v.ende.toISOString() : null,
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      status: v.status,
    }))
    .sort((a, b) => vergleicheEinheitBezeichnung(a.einheitBezeichnung, b.einheitBezeichnung));
}

export default async function MietvertraegePage() {
  const vertraege = await ladeVertraege();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mietverträge</h1>
          <p className="text-sm text-neutral-400">{vertraege.length} Verträge insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/mietvertraege/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Datei importieren
          </Link>
          <Link
            href="/mietvertraege/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neuer Mietvertrag
          </Link>
        </div>
      </div>

      <MietvertraegeTable rows={vertraege} />
    </div>
  );
}
