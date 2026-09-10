"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

export async function deleteKautionsbuchungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.kautionBuchung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/kautionen");
}

const KATEGORIE_WERTE = [
  "EINZAHLUNG_MIETER",
  "ANLAGE",
  "AUFLOESUNG",
  "AUSZAHLUNG_MIETER",
  "SONSTIGES",
] as const;
type KautionBuchungKategorie = (typeof KATEGORIE_WERTE)[number];

export async function aktualisiereKautionsbuchungKategorie(id: string, kategorie: KautionBuchungKategorie) {
  await requireEditor();
  if (!KATEGORIE_WERTE.includes(kategorie)) return;
  await prisma.kautionBuchung.update({ where: { id }, data: { kategorie } });
  revalidatePath("/kautionen");
}
