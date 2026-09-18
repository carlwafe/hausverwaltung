"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";

export async function deleteMietweiterleitungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id);
    }
  });
  revalidatePath("/mietweiterleitungen");
}
