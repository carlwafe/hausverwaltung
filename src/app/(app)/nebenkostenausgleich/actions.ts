"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

export async function deleteNebenkostenausgleichZahlungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.nebenkostenausgleichZahlung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/nebenkostenausgleich");
}
