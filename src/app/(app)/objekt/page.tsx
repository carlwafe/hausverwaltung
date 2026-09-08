import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ObjektForm } from "./objekt-form";

export default async function ObjektPage() {
  await requireAdmin();
  const objekt = await prisma.objekt.findFirst();
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
    </div>
  );
}
