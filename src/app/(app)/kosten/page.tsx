import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KostenTable, type KostenpositionRow } from "./kosten-table";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function ladeKosten(): Promise<KostenpositionRow[]> {
  const positionen = await prisma.kostenposition.findMany({
    orderBy: [{ jahr: "desc" }, { createdAt: "desc" }],
    include: { kostenart: true, gebaeude: true, haus: { include: { gebaeude: true } } },
  });

  return positionen.map((k) => ({
    id: k.id,
    jahr: k.jahr,
    gebaeudeLabel: gebaeudeOderHausLabel(k.gebaeude, k.haus),
    kostenartName: k.kostenart.name,
    umlagefaehig: k.kostenart.umlagefaehig,
    betrag: Number(k.betrag),
    empfaenger: k.empfaenger,
    beschreibung: k.beschreibung,
  }));
}

export default async function KostenPage() {
  const kosten = await ladeKosten();
  const summe = kosten.reduce((s, k) => s + k.betrag, 0);
  const summeUmlagefaehig = kosten.filter((k) => k.umlagefaehig).reduce((s, k) => s + k.betrag, 0);
  const summeNichtUmlagefaehig = summe - summeUmlagefaehig;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Kosten</h1>
          <p className="text-sm text-neutral-400">{kosten.length} Kostenpositionen erfasst</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/kostenarten"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Kostenarten verwalten
          </Link>
          <Link
            href="/kontoauszug/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Kontoauszug importieren
          </Link>
          <Link
            href="/kosten/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neue Kostenposition
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Gesamtkosten</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summe)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Davon umlagefähig</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeUmlagefaehig)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Davon nicht umlagefähig</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeNichtUmlagefaehig)}</p>
        </div>
      </div>

      <KostenTable rows={kosten} />
    </div>
  );
}
