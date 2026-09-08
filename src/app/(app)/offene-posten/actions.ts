"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

/** Parst "yyyy-mm-dd" und setzt die Uhrzeit auf das Ende des Tages (inklusive Stichtag). */
function parseBisWert(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, jahr, monat, tag] = match;
  const datum = new Date(Number(jahr), Number(monat) - 1, Number(tag), 23, 59, 59, 999);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

export async function setBuchhaltungBis(formData: FormData): Promise<void> {
  await requireUser();
  const bis = parseBisWert(formData.get("bis"));
  if (!bis) return;

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return;

  await prisma.objekt.update({ where: { id: objekt.id }, data: { buchhaltungBis: bis } });
  revalidatePath("/offene-posten");
}

export async function resetBuchhaltungBis(): Promise<void> {
  await requireUser();

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return;

  await prisma.objekt.update({ where: { id: objekt.id }, data: { buchhaltungBis: null } });
  revalidatePath("/offene-posten");
}
