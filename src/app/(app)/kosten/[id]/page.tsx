import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KostenpositionForm } from "../kostenposition-form";
import { updateKostenposition, deleteKostenposition } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export default async function KostenpositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kostenposition, kostenarten, gebaeude] = await Promise.all([
    prisma.kostenposition.findUnique({ where: { id }, include: { kostenart: true, gebaeude: true } }),
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({ orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }] }),
  ]);
  if (!kostenposition) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {kostenposition.kostenart.name} — {kostenposition.gebaeude.strasse}{" "}
          {kostenposition.gebaeude.hausnummer} ({kostenposition.jahr})
        </h1>
        <DeleteButton
          action={deleteKostenposition.bind(null, id)}
          confirmText="Kostenposition wirklich löschen?"
        />
      </div>
      <KostenpositionForm
        kostenarten={kostenarten.map((k) => ({ id: k.id, label: k.name }))}
        gebaeude={gebaeude.map((g) => ({ id: g.id, label: `${g.strasse} ${g.hausnummer}` }))}
        initial={{
          kostenartId: kostenposition.kostenartId,
          gebaeudeId: kostenposition.gebaeudeId,
          jahr: kostenposition.jahr,
          betrag: kostenposition.betrag.toString(),
          beschreibung: kostenposition.beschreibung,
          empfaenger: kostenposition.empfaenger,
        }}
        action={updateKostenposition.bind(null, id)}
      />
    </div>
  );
}
