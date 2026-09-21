"use server";

import { z } from "zod";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const kontrolleSchema = z.object({
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Bitte ein Datum angeben"),
  betrag: z.coerce.number({ message: "Bitte den Kontostand angeben" }),
  notiz: z.string().optional(),
});

// Kontostand laut Kontoauszug an einem Tag als Kontrollpunkt speichern; pro Tag ein Wert, ein
// erneutes Speichern überschreibt ihn.
export async function speichereKontostandKontrolle(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();
  const parsed = kontrolleSchema.safeParse({
    datum: formData.get("datum"),
    betrag: String(formData.get("betrag") ?? "").replace(",", "."),
    notiz: formData.get("notiz") || undefined,
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");

  const datum = parseStrengesDatum(parsed.data.datum);
  if (!datum) return "Ungültiges Datum (z.B. 31.02. gibt es nicht)";
  await prisma.kontostandKontrolle.upsert({
    where: { datum },
    update: { betrag: parsed.data.betrag, notiz: parsed.data.notiz ?? null },
    create: { datum, betrag: parsed.data.betrag, notiz: parsed.data.notiz ?? null },
  });
  revalidatePath("/kontostand");
  return null;
}

export async function loescheKontostandKontrolle(id: string) {
  await requireEditor();
  await prisma.kontostandKontrolle.delete({ where: { id } });
  revalidatePath("/kontostand");
}
