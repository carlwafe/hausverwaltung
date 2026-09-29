import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DienstleisterForm } from "../dienstleister-form";
import { updateDienstleister, deleteDienstleister } from "../actions";
import { ladeFormularOptionen } from "../lade-optionen";
import { DeleteButton } from "@/components/delete-button";

export default async function DienstleisterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dienstleister, { kostenarten, gebaeude }] = await Promise.all([
    prisma.dienstleister.findUnique({ where: { id } }),
    ladeFormularOptionen(),
  ]);
  if (!dienstleister) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{dienstleister.name}</h1>
        <DeleteButton
          action={deleteDienstleister.bind(null, id)}
          confirmText="Dienstleister wirklich löschen? Bereits importierte Buchungen bleiben unverändert."
        />
      </div>
      <DienstleisterForm
        initial={dienstleister}
        kostenarten={kostenarten}
        gebaeude={gebaeude}
        action={updateDienstleister.bind(null, id)}
      />
    </div>
  );
}
