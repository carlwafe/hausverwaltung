"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

export async function deleteSonstigeBuchungen(ids: string[]) {
  await requireUser();
  if (ids.length === 0) return;
  await prisma.sonstigeBuchung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/sonstige-buchungen");
}
