"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

export async function speichereVerbrauchswerte(formData: FormData) {
  await requireEditor();

  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }
  const kostenartId = String(formData.get("kostenartId") ?? "");
  if (!kostenartId) {
    throw new Error("Bitte eine Kostenart auswählen.");
  }

  const einheitIds = formData.getAll("einheitId").map(String);
  const eintraege: { einheitId: string; wert: number | null }[] = [];
  for (const einheitId of einheitIds) {
    const roh = formData.get(`wert_${einheitId}`);
    const text = typeof roh === "string" ? roh.trim().replace(",", ".") : "";
    if (text === "") {
      eintraege.push({ einheitId, wert: null });
      continue;
    }
    const wert = Number(text);
    if (!Number.isFinite(wert) || wert < 0) {
      throw new Error(`Ungültiger Wert für eine Einheit: "${text}".`);
    }
    eintraege.push({ einheitId, wert });
  }

  await prisma.$transaction(
    eintraege.map(({ einheitId, wert }) =>
      wert === null
        ? prisma.verbrauchswert.deleteMany({ where: { einheitId, kostenartId, jahr } })
        : prisma.verbrauchswert.upsert({
            where: { einheitId_kostenartId_jahr: { einheitId, kostenartId, jahr } },
            create: { einheitId, kostenartId, jahr, wert },
            update: { wert },
          }),
    ),
  );

  revalidatePath("/verbrauchswerte");
}
