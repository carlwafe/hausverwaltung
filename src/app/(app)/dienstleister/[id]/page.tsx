import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DienstleisterForm } from "../dienstleister-form";
import { updateDienstleister, deleteDienstleister } from "../actions";
import { ladeKostenartenOptionen } from "../lade-optionen";
import { uploadDokument } from "../../dokumente/actions";
import { BelegeSektion } from "@/components/belege-sektion";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { DeleteButton } from "@/components/delete-button";

export default async function DienstleisterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dienstleister, kostenarten] = await Promise.all([
    prisma.dienstleister.findUnique({
      where: { id },
      include: { kostenarten: { select: { id: true } }, dokumente: true },
    }),
    ladeKostenartenOptionen(),
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
        initial={{ ...dienstleister, kostenartIds: dienstleister.kostenarten.map((k) => k.id) }}
        kostenarten={kostenarten}
        action={updateDienstleister.bind(null, id)}
      />
      <div className="mt-8 max-w-3xl">
        <BelegeSektion
          titel="Verträge"
          maxBytes={MAX_DOKUMENT_GROESSE_BYTES}
          leerText="Noch kein Vertrag hochgeladen."
          dokumente={dienstleister.dokumente}
          uploadAction={uploadDokument.bind(null, {
            dienstleisterId: id,
            revalidatePath: `/dienstleister/${id}`,
          })}
          revalidatePath={`/dienstleister/${id}`}
        />
      </div>
    </div>
  );
}
