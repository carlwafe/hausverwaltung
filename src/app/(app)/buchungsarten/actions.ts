"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { istSystemBuchungsart } from "@/lib/import/buchung-klassifizierung";

const KONTOKREISE = ["MIETKONTO", "KAUTIONSKONTO", "OBJEKTKONTO"] as const;

const anlegenSchema = z.object({
  code: z
    .string()
    .min(2, "Code ist erforderlich")
    .regex(/^[A-Z][A-Z0-9_]*$/, "Code nur mit Großbuchstaben, Ziffern und _ (z.B. VERZUGSZINSEN)"),
  bezeichnung: z.string().min(1, "Bezeichnung ist erforderlich"),
  kontokreis: z.enum(KONTOKREISE),
  zahlungswirksam: z.coerce.boolean(),
  eurRelevant: z.coerce.boolean(),
});

export async function createBuchungsart(formData: FormData) {
  await requireEditor();
  const parsed = anlegenSchema.safeParse({
    code: String(formData.get("code") ?? "").trim().toUpperCase(),
    bezeichnung: formData.get("bezeichnung"),
    kontokreis: formData.get("kontokreis"),
    zahlungswirksam: formData.get("zahlungswirksam") === "on",
    eurRelevant: formData.get("eurRelevant") === "on",
  });
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join(", "));

  if (await prisma.buchungsart.findUnique({ where: { code: parsed.data.code } })) {
    throw new Error(`Code ${parsed.data.code} existiert bereits`);
  }
  await prisma.buchungsart.create({ data: parsed.data });

  revalidatePath("/buchungsarten");
  redirect("/buchungsarten");
}

// Kontokreis und die beiden Flags sind nach der ersten Buchung gesperrt: eine Änderung würde
// Kontostand, Jahresübersicht und Kontenabgleich rückwirkend für alle bestehenden Buchungen
// dieser Art verändern.
export async function updateBuchungsart(id: string, formData: FormData) {
  await requireEditor();
  const art = await prisma.buchungsart.findUniqueOrThrow({
    where: { id },
    include: { _count: { select: { buchungen: true } } },
  });

  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  if (!bezeichnung) throw new Error("Bezeichnung ist erforderlich");
  const aktiv = formData.get("aktiv") === "on";
  if (!aktiv && istSystemBuchungsart(art.code)) {
    throw new Error("Diese Buchungsart wird vom System benötigt und kann nicht deaktiviert werden");
  }

  const data: {
    bezeichnung: string;
    aktiv: boolean;
    kontokreis?: (typeof KONTOKREISE)[number];
    zahlungswirksam?: boolean;
    eurRelevant?: boolean;
  } = { bezeichnung, aktiv };

  if (art._count.buchungen === 0) {
    const kontokreis = z.enum(KONTOKREISE).parse(formData.get("kontokreis"));
    data.kontokreis = kontokreis;
    data.zahlungswirksam = formData.get("zahlungswirksam") === "on";
    data.eurRelevant = formData.get("eurRelevant") === "on";
  }
  await prisma.buchungsart.update({ where: { id }, data });

  revalidatePath("/buchungsarten");
  redirect("/buchungsarten");
}
