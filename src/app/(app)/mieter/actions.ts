"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const mieterSchema = z.object({
  vorname: z.string().min(1, "Vorname ist erforderlich"),
  nachname: z.string().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("").transform(() => undefined)),
  handynummer: z.string().optional(),
  festnetznummer: z.string().optional(),
  notizen: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = mieterSchema.safeParse({
    vorname: formData.get("vorname"),
    nachname: formData.get("nachname"),
    email: formData.get("email") ?? "",
    handynummer: formData.get("handynummer") || undefined,
    festnetznummer: formData.get("festnetznummer") || undefined,
    notizen: formData.get("notizen") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function createMieter(formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.mieter.create({ data });

  revalidatePath("/mieter");
  redirect("/mieter");
}

export async function updateMieter(id: string, formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.mieter.update({ where: { id }, data });

  revalidatePath("/mieter");
  revalidatePath(`/mieter/${id}`);
  redirect("/mieter");
}

export async function deleteMieter(id: string) {
  await requireUser();
  await prisma.mieter.delete({ where: { id } });
  revalidatePath("/mieter");
  redirect("/mieter");
}
