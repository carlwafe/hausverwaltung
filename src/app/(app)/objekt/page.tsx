import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ObjektForm } from "./objekt-form";
import { KostenTable } from "../kosten/kosten-table";
import { ladeKosten, REPARATUR_SANIERUNG_KOSTENART_NAMEN } from "../kosten/kosten-liste";

export default async function ObjektPage() {
  await requireAdmin();
  const [objekt, kosten] = await Promise.all([
    prisma.objekt.findFirst(),
    ladeKosten({
      gebaeudeId: null,
      hausId: null,
      kostengruppeId: null,
      einheitId: null,
      kostenart: { name: { in: REPARATUR_SANIERUNG_KOSTENART_NAMEN } },
    }),
  ]);
  if (!objekt) notFound();

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Objekt</h1>
      <ObjektForm
        initial={{
          ...objekt,
          kontostandAnkerBetrag: objekt.kontostandAnkerBetrag?.toString() ?? null,
        }}
      />

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-white">
          Reparaturen, Sanierung & Modernisierung für das gesamte Objekt ({kosten.length})
        </h2>
        <KostenTable rows={kosten} />
      </div>
    </div>
  );
}
