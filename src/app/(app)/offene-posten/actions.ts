"use server";

import { revalidatePath } from "next/cache";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

/** Parst "yyyy-mm-dd" und setzt die Uhrzeit auf das Ende des Tages (inklusive Stichtag). */
function parseBisWert(raw: FormDataEntryValue | null): Date | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, jahr, monat, tag] = match;
  if (!parseStrengesDatum(raw)) return null;
  return new Date(Number(jahr), Number(monat) - 1, Number(tag), 23, 59, 59, 999);
}

export async function setBuchhaltungBis(formData: FormData): Promise<void> {
  await requireEditor();
  const bis = parseBisWert(formData.get("bis"));
  if (!bis) return;

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return;

  await prisma.objekt.update({ where: { id: objekt.id }, data: { buchhaltungBis: bis } });
  revalidatePath("/offene-posten");
}

export async function resetBuchhaltungBis(): Promise<void> {
  await requireEditor();

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return;

  await prisma.objekt.update({ where: { id: objekt.id }, data: { buchhaltungBis: null } });
  revalidatePath("/offene-posten");
}
