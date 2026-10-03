import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KostenartenTable, type KostenartRow } from "./kostenarten-table";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

async function ladeKostenarten(): Promise<KostenartRow[]> {
  const kostenarten = await prisma.kostenart.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { buchungen: { where: AKTIVE_BUCHUNG_FILTER } } } },
  });

  return kostenarten.map((k) => ({
    id: k.id,
    name: k.name,
    umlagefaehig: k.umlagefaehig,
    standardVerteilerschluessel: k.standardVerteilerschluessel,
    betrKvNummer: k.betrKvNummer,
    istSonstigeBetriebskosten: k.istSonstigeBetriebskosten,
    vertraglicheGrundlage: k.vertraglicheGrundlage,
    anzahlPositionen: k._count.buchungen,
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
          <p className="mt-1 max-w-2xl text-xs text-neutral-500">
            Umlagefähig ohne Verteilerschlüssel heißt: die Kosten werden erfasst, aber nicht in die
            Nebenkostenabrechnung umgelegt (z.B. &bdquo;Wartungsarbeiten Heizung (über Techem
            verrechnet)&ldquo;, weil Techem sie in der Heizkostenabrechnung berechnet). Die Warnung
            &bdquo;kein Verteilerschlüssel&ldquo; in der Abrechnung ist dann erwartet.
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
