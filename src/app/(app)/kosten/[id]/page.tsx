import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KostenpositionForm } from "../kostenposition-form";
import { updateKostenposition, deleteKostenposition } from "../actions";
import { uploadDokument } from "../../dokumente/actions";
import { DeleteButton } from "@/components/delete-button";
import { BelegeSektion } from "@/components/belege-sektion";
import { gruppiereGebaeude, gebaeudeOderHausLabel, gebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";

export default async function KostenpositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kostenposition, kostenarten, gebaeude] = await Promise.all([
    prisma.kostenposition.findUnique({
      where: { id },
      include: {
        kostenart: true,
        gebaeude: true,
        haus: { include: { gebaeude: true } },
        kostengruppe: true,
        dokumente: { orderBy: { createdAt: "desc" } },
      },
    }),
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({
      orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
      include: {
        haus: { select: { id: true } },
        kostengruppen: { select: { id: true, bezeichnung: true } },
      },
    }),
  ]);
  if (!kostenposition) notFound();

  const gebaeudeGruppen = gruppiereGebaeude(gebaeude);
  const gebaeudeLabel = gebaeudeOderHausLabel(
    kostenposition.gebaeude,
    kostenposition.haus,
    kostenposition.kostengruppe,
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {kostenposition.kostenart.name} — {gebaeudeLabel} ({kostenposition.jahr})
        </h1>
        <DeleteButton
          action={deleteKostenposition.bind(null, id)}
          confirmText="Kostenposition wirklich löschen?"
        />
      </div>
      <KostenpositionForm
        kostenarten={kostenarten.map((k) => ({ id: k.id, label: k.name }))}
        gebaeude={gebaeudeGruppen}
        initial={{
          kostenartId: kostenposition.kostenartId,
          gebaeudeAuswahl: gebaeudeAuswahlWert(
            kostenposition.gebaeudeId,
            kostenposition.hausId,
            kostenposition.kostengruppeId,
          ),
          jahr: kostenposition.jahr,
          betrag: kostenposition.betrag.toString(),
          beschreibung: kostenposition.beschreibung,
          empfaenger: kostenposition.empfaenger,
        }}
        action={updateKostenposition.bind(null, id)}
      />

      <div className="mt-6">
        <BelegeSektion
          dokumente={kostenposition.dokumente}
          uploadAction={uploadDokument.bind(null, {
            kostenpositionId: id,
            revalidatePath: `/kosten/${id}`,
          })}
          revalidatePath={`/kosten/${id}`}
        />
      </div>
    </div>
  );
}
