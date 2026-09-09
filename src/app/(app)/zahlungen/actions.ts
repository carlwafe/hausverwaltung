"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const zahlungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: z.coerce.date({ error: "Datum ist erforderlich" }),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  periodeMonat: z.coerce.number().int().min(1).max(12),
  periodeJahr: z.coerce.number().int().min(2000).max(2100),
  verwendungszweck: z.string().optional(),
});

export async function createZahlung(formData: FormData) {
  await requireEditor();

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;

  await prisma.zahlung.create({
    data: { ...rest, mietvertrag: { connect: { id: mietvertragId } } },
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect(`/mietvertraege/${mietvertragId}`);
}

export async function updateZahlung(id: string, formData: FormData) {
  await requireEditor();

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;
  const bisherige = await prisma.zahlung.findUniqueOrThrow({ where: { id }, select: { mietvertragId: true } });

  await prisma.zahlung.update({
    where: { id },
    data: { ...rest, mietvertrag: { connect: { id: mietvertragId } } },
  });

  revalidatePath("/zahlungen");
  revalidatePath(`/zahlungen/${id}`);
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  if (bisherige.mietvertragId !== mietvertragId) {
    revalidatePath(`/mietvertraege/${bisherige.mietvertragId}`);
  }
  redirect("/zahlungen");
}

export async function deleteZahlung(id: string) {
  await requireEditor();
  const zahlung = await prisma.zahlung.delete({ where: { id } });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${zahlung.mietvertragId}`);
}

export async function deleteZahlungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.zahlung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/mietvertraege");
  revalidatePath("/");
}
