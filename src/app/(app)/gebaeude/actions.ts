"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const gebaeudeSchema = z.object({
  strasse: z.string().min(1, "Straße ist erforderlich"),
  hausnummer: z.string().min(1, "Hausnummer ist erforderlich"),
  haus: z.string().optional(),
  beschreibung: z.string().optional(),
});

async function getObjektId() {
  const objekt = await prisma.objekt.findFirst();
  if (!objekt) throw new Error("Kein Objekt angelegt. Bitte zuerst ein Objekt anlegen (Seed ausführen).");
  return objekt.id;
}

export async function createGebaeude(formData: FormData) {
  await requireUser();
  const objektId = await getObjektId();

  const parsed = gebaeudeSchema.safeParse({
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    haus: formData.get("haus") || undefined,
    beschreibung: formData.get("beschreibung") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await prisma.gebaeude.create({ data: { ...parsed.data, objektId } });

  revalidatePath("/gebaeude");
  redirect("/gebaeude");
}

export async function updateGebaeude(id: string, formData: FormData) {
  await requireUser();

  const parsed = gebaeudeSchema.safeParse({
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    haus: formData.get("haus") || undefined,
    beschreibung: formData.get("beschreibung") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  await prisma.gebaeude.update({ where: { id }, data: parsed.data });

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
