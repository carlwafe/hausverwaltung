"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const VERTEILERSCHLUESSEL = [
  "WOHNFLAECHE",
  "MITEIGENTUMSANTEIL",
  "PERSONENZAHL",
  "EINHEITEN",
  "VERBRAUCH_MANUELL",
  "VORVERTEILT",
] as const;

const kostenartSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  umlagefaehig: z.coerce.boolean(),
  standardVerteilerschluessel: z.enum(VERTEILERSCHLUESSEL).optional(),
  masseinheit: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = kostenartSchema.safeParse({
    name: formData.get("name"),
    umlagefaehig: formData.get("umlagefaehig") === "on",
    standardVerteilerschluessel: formData.get("standardVerteilerschluessel") || undefined,
    masseinheit: formData.get("masseinheit") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function createKostenart(formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  await prisma.kostenart.create({
    data: {
      ...data,
      standardVerteilerschluessel: data.standardVerteilerschluessel ?? null,
      masseinheit: data.masseinheit ?? null,
    },
  });

  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}

export async function updateKostenart(id: string, formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  // Prisma behandelt `undefined` in `data` als "Feld unverändert lassen", nicht als "auf null
  // setzen" — ohne den expliziten Fallback würde ein deaktiviertes (also nicht mitgesendetes)
  // Verteilerschlüssel-Feld den alten Wert stillschweigend behalten, statt ihn zu löschen.
  await prisma.kostenart.update({
    where: { id },
    data: {
      ...data,
      standardVerteilerschluessel: data.standardVerteilerschluessel ?? null,
      masseinheit: data.masseinheit ?? null,
    },
  });

  revalidatePath("/kostenarten");
  revalidatePath(`/kostenarten/${id}`);
  redirect("/kostenarten");
}

export async function deleteKostenart(id: string) {
  await requireEditor();
  await prisma.kostenart.delete({ where: { id } });
  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}
