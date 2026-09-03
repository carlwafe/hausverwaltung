"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";

const objektSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  strasse: z.string().min(1, "Straße ist erforderlich"),
  hausnummer: z.string().min(1, "Hausnummer ist erforderlich"),
  plz: z.string().min(1, "PLZ ist erforderlich"),
  ort: z.string().min(1, "Ort ist erforderlich"),
  beschreibung: z.string().optional(),
  buchhaltungAb: z
    .union([z.coerce.date(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
});

export async function updateObjekt(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireAdmin();

  const parsed = objektSchema.safeParse({
    name: formData.get("name"),
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    plz: formData.get("plz"),
    ort: formData.get("ort"),
    beschreibung: formData.get("beschreibung") || undefined,
    buchhaltungAb: formData.get("buchhaltungAb") || "",
  });

  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return "Kein Objekt vorhanden.";

  await prisma.objekt.update({ where: { id: objekt.id }, data: parsed.data });

  revalidatePath("/objekt");
  revalidatePath("/");
  revalidatePath("/offene-posten");
  return null;
}
