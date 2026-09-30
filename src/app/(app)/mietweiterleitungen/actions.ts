"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { storniereBuchung } from "@/lib/buchung-storno";

export async function deleteMietweiterleitungen(ids: string[]) {
  const user = await requireEditor();
  if (ids.length === 0) return;
  const erstelltVon = benutzerLabel(user);
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id, erstelltVon);
    }
  });
  revalidatePath("/mietweiterleitungen");
}
