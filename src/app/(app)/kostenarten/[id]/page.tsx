import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { KostenartForm } from "../kostenart-form";
import { updateKostenart, deleteKostenart } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export default async function KostenartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const kostenart = await prisma.kostenart.findUnique({ where: { id } });
  if (!kostenart) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{kostenart.name}</h1>
        <DeleteButton
          action={deleteKostenart.bind(null, id)}
          confirmText="Kostenart wirklich löschen? Das geht nur, wenn keine Kostenpositionen mehr darauf verweisen."
        />
      </div>
      <KostenartForm initial={kostenart} action={updateKostenart.bind(null, id)} />
    </div>
  );
}
