import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { gebaeudeGruppeAnzeige } from "@/lib/gebaeude-gruppen";
import { EinheitenTable, type EinheitRow } from "./einheiten-table";

async function ladeEinheiten(): Promise<EinheitRow[]> {
  const einheitenRaw = await prisma.einheit.findMany({
    include: {
      gebaeude: { include: { haus: { include: { gebaeude: true } } } },
      mietvertraege: {
        where: { status: "AKTIV" },
        include: { mieter: true },
      },
    },
  });

  return sortEinheitenNachGebaeude(einheitenRaw).map((e) => {
    const gebaeudeGruppe = gebaeudeGruppeAnzeige(e.gebaeude);
    return {
      id: e.id,
      gebaeudeLabel: gebaeudeGruppe.label,
      gebaeudeHref: gebaeudeGruppe.href,
      bezeichnung: e.bezeichnung,
      typ: e.typ,
      etage: e.etage ?? "",
      wohnflaecheQm: Number(e.wohnflaecheQm),
      mietvertraege: e.mietvertraege.map((v) => ({
        id: v.id,
        mieter: v.mieter.map((m) => ({
          id: m.id,
          vorname: m.vorname,
          nachname: m.nachname,
          buergergeldEmpfaenger: m.buergergeldEmpfaenger,
        })),
      })),
    };
  });
}

export default async function EinheitenPage() {
  const einheiten = await ladeEinheiten();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Einheiten</h1>
          <p className="text-sm text-neutral-400">{einheiten.length} Einheiten insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/einheiten/zeitachse"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Zeitachse anzeigen
          </Link>
          <Link
            href="/einheiten/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Datei importieren
          </Link>
          <Link
            href="/einheiten/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neue Einheit
          </Link>
        </div>
      </div>

      <EinheitenTable rows={einheiten} />
    </div>
  );
}
