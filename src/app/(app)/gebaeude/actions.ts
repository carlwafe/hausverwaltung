"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const gebaeudeSchema = z.object({
  strasse: z.string().min(1, "Straße ist erforderlich"),
  hausnummer: z.string().min(1, "Hausnummer ist erforderlich"),
  // "__neu__" legt ein neues, noch leeres Haus an und verknüpft dieses Gebäude direkt damit.
  hausId: z.string().optional(),
  beschreibung: z.string().optional(),
});

async function getObjektId() {
  const objekt = await prisma.objekt.findFirst();
  if (!objekt) throw new Error("Kein Objekt angelegt. Bitte zuerst ein Objekt anlegen (Seed ausführen).");
  return objekt.id;
}

async function aufloeseHausAuswahl(hausId: string | undefined, objektId: string): Promise<string | undefined> {
  if (!hausId) return undefined;
  if (hausId !== "__neu__") return hausId;
  const haus = await prisma.haus.create({ data: { objektId } });
  return haus.id;
}

export async function createGebaeude(formData: FormData) {
  await requireUser();
  const objektId = await getObjektId();

  const parsed = gebaeudeSchema.safeParse({
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    hausId: formData.get("hausId") || undefined,
    beschreibung: formData.get("beschreibung") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const { hausId, ...rest } = parsed.data;
  const aufgeloesteHausId = await aufloeseHausAuswahl(hausId, objektId);

  await prisma.gebaeude.create({
    data: { ...rest, objektId, hausId: aufgeloesteHausId ?? null },
  });

  revalidatePath("/gebaeude");
  redirect("/gebaeude");
}

export async function updateGebaeude(id: string, formData: FormData) {
  await requireUser();
  const bestehend = await prisma.gebaeude.findUniqueOrThrow({ where: { id }, select: { objektId: true } });

  const parsed = gebaeudeSchema.safeParse({
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    hausId: formData.get("hausId") || undefined,
    beschreibung: formData.get("beschreibung") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const { hausId, ...rest } = parsed.data;
  const aufgeloesteHausId = await aufloeseHausAuswahl(hausId, bestehend.objektId);

  await prisma.gebaeude.update({
    where: { id },
    data: {
      ...rest,
      haus: aufgeloesteHausId ? { connect: { id: aufgeloesteHausId } } : { disconnect: true },
    },
  });

  revalidatePath("/gebaeude");
  revalidatePath(`/gebaeude/${id}`);
  redirect("/gebaeude");
}

export async function deleteGebaeude(id: string) {
  await requireUser();
  await prisma.gebaeude.delete({ where: { id } });
  revalidatePath("/gebaeude");
  redirect("/gebaeude");
}
