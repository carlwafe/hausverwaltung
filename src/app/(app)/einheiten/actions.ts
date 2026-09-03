"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const einheitSchema = z.object({
  gebaeudeId: z.string().min(1, "Gebäude ist erforderlich"),
  bezeichnung: z.string().min(1, "Bezeichnung ist erforderlich"),
  typ: z.enum(["WOHNUNG", "GARAGE"]),
  etage: z.string().optional(),
  wohnflaecheQm: z.coerce.number().positive("Wohnfläche muss größer als 0 sein"),
  einbaukueche: z.coerce.boolean(),
  fotosVorhanden: z.coerce.boolean(),
  notizen: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = einheitSchema.safeParse({
    gebaeudeId: formData.get("gebaeudeId"),
    bezeichnung: formData.get("bezeichnung"),
    typ: formData.get("typ"),
    etage: formData.get("etage") || undefined,
    wohnflaecheQm: formData.get("wohnflaecheQm"),
    einbaukueche: formData.get("einbaukueche"),
    fotosVorhanden: formData.get("fotosVorhanden"),
    notizen: formData.get("notizen") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { gebaeudeId, ...rest } = parsed.data;
  return { gebaeudeId, rest };
}

export async function createEinheit(formData: FormData) {
  await requireUser();
  const { gebaeudeId, rest } = parseForm(formData);

  await prisma.einheit.create({
    data: { ...rest, gebaeude: { connect: { id: gebaeudeId } } },
  });

  revalidatePath("/einheiten");
  redirect("/einheiten");
}

export async function updateEinheit(id: string, formData: FormData) {
  await requireUser();
  const { gebaeudeId, rest } = parseForm(formData);

  await prisma.einheit.update({
    where: { id },
    data: { ...rest, gebaeude: { connect: { id: gebaeudeId } } },
  });

  revalidatePath("/einheiten");
  revalidatePath(`/einheiten/${id}`);
  redirect("/einheiten");
}

export async function deleteEinheit(id: string) {
  await requireUser();
  await prisma.einheit.delete({ where: { id } });
  revalidatePath("/einheiten");
  redirect("/einheiten");
}
