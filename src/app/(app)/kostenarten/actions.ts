"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const VERTEILERSCHLUESSEL = [
  "WOHNFLAECHE",
  "MITEIGENTUMSANTEIL",
  "PERSONENZAHL",
  "EINHEITEN",
  "VERBRAUCH_MANUELL",
] as const;

const kostenartSchema = z.object({
  name: z.string().min(1, "Name ist erforderlich"),
  umlagefaehig: z.coerce.boolean(),
  standardVerteilerschluessel: z.enum(VERTEILERSCHLUESSEL).optional(),
});

function parseForm(formData: FormData) {
  const parsed = kostenartSchema.safeParse({
    name: formData.get("name"),
    umlagefaehig: formData.get("umlagefaehig") === "on",
    standardVerteilerschluessel: formData.get("standardVerteilerschluessel") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function createKostenart(formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.kostenart.create({ data });

  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}

export async function updateKostenart(id: string, formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.kostenart.update({ where: { id }, data });

  revalidatePath("/kostenarten");
  revalidatePath(`/kostenarten/${id}`);
  redirect("/kostenarten");
}

export async function deleteKostenart(id: string) {
  await requireUser();
  await prisma.kostenart.delete({ where: { id } });
  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}
