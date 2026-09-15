"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

/**
 * Markiert/entmarkiert, dass "Saldo neu" für diesen Mietvertrag/dieses Jahr mit dem vorhandenen
 * (externen, vom früheren Verwalter erstellten) Jahresbericht abgeglichen und für übereinstimmend
 * befunden wurde — reine Existenz der Zeile, siehe Schema-Kommentar auf JahresberichtVerifikation.
 */
export async function toggleJahresberichtVerifiziert(mietvertragId: string, jahr: number) {
  await requireEditor();

  const bestehend = await prisma.jahresberichtVerifikation.findUnique({
    where: { mietvertragId_jahr: { mietvertragId, jahr } },
  });

  if (bestehend) {
    await prisma.jahresberichtVerifikation.delete({ where: { id: bestehend.id } });
  } else {
    await prisma.jahresberichtVerifikation.create({ data: { mietvertragId, jahr } });
  }

  revalidatePath("/jahresuebersicht");
}
