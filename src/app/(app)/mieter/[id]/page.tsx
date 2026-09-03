import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MieterForm } from "../mieter-form";
import { updateMieter, deleteMieter } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export default async function MieterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const mieter = await prisma.mieter.findUnique({ where: { id } });
  if (!mieter) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {mieter.vorname} {mieter.nachname}
        </h1>
        <DeleteButton action={deleteMieter.bind(null, id)} />
      </div>
      <MieterForm initial={mieter} action={updateMieter.bind(null, id)} />
    </div>
  );
}
