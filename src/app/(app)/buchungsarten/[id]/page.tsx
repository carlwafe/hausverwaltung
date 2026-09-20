import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { istSystemBuchungsart } from "@/lib/import/buchung-klassifizierung";
import { BuchungsartForm } from "../buchungsart-form";
import { updateBuchungsart } from "../actions";

export default async function BuchungsartDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const art = await prisma.buchungsart.findUnique({
    where: { id },
    include: { _count: { select: { buchungen: true } } },
  });
  if (!art) notFound();

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">{art.bezeichnung}</h1>
      <p className="mb-6 text-sm text-neutral-400">{art._count.buchungen} Buchungen mit dieser Art</p>
      <BuchungsartForm
        initial={art}
        action={updateBuchungsart.bind(null, id)}
        gesperrt={art._count.buchungen > 0}
        systemArt={istSystemBuchungsart(art.code)}
      />
    </div>
  );
}
