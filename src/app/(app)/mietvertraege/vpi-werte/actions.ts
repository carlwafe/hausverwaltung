"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { AktionsFehler, mitMeldung, zodFehler } from "@/lib/aktion";

const schema = z.object({
  jahr: z.coerce.number().int().min(1991, "Jahr ab 1991").max(2100, "Jahr ungültig"),
  monat: z.coerce.number().int().min(1, "Monat 1–12").max(12, "Monat 1–12"),
  wert: z.coerce.number().positive("Indexwert muss größer 0 sein").max(1000, "Indexwert unplausibel"),
});

export const speichereVpi = mitMeldung(async function speichereVpi(
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const parsed = schema.safeParse({
    jahr: formData.get("jahr"),
    monat: formData.get("monat"),
    // Dezimalkomma erlauben
    wert: String(formData.get("wert") ?? "").replace(",", "."),
  });
  if (!parsed.success) throw zodFehler(parsed.error);
  const { jahr, monat, wert } = parsed.data;
  if (jahr === new Date().getFullYear() && monat > new Date().getMonth() + 1) {
    throw new AktionsFehler("Dieser Monat liegt in der Zukunft.");
  }
  await prisma.verbraucherpreisindex.upsert({
    where: { jahr_monat: { jahr, monat } },
    create: { jahr, monat, wert },
    update: { wert },
  });
  revalidatePath("/mietvertraege/vpi-werte");
  return null;
});

export async function loescheVpi(formData: FormData): Promise<void> {
  await requireEditor();
  const id = String(formData.get("id") ?? "");
  await prisma.verbraucherpreisindex.delete({ where: { id } });
  revalidatePath("/mietvertraege/vpi-werte");
}
