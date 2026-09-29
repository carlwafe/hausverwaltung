"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { parseSuchbegriffe } from "@/lib/import/dienstleister";

const dienstleisterSchema = z.object({
  name: z.string().trim().min(1, "Name ist erforderlich"),
  suchbegriffe: z.string(),
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  gebaeudeAuswahl: z.string().optional(),
  iban: z.string().trim().optional(),
  notiz: z.string().trim().optional(),
  aktiv: z.boolean(),
});

function parseForm(formData: FormData) {
  const parsed = dienstleisterSchema.safeParse({
    name: formData.get("name"),
    suchbegriffe: formData.get("suchbegriffe") ?? "",
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeAuswahl") || undefined,
    iban: formData.get("iban") || undefined,
    notiz: formData.get("notiz") || undefined,
    aktiv: formData.get("aktiv") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const d = parsed.data;
  const suchbegriffe = parseSuchbegriffe(d.suchbegriffe);
  if (suchbegriffe.length === 0) {
    throw new Error("Mindestens ein Suchbegriff (mind. 3 Zeichen) ist erforderlich");
  }
  return {
    name: d.name,
    suchbegriffe: suchbegriffe.join("\n"),
    kostenartId: d.kostenartId,
    gebaeudeAuswahl: d.gebaeudeAuswahl ?? null,
    iban: d.iban ?? null,
    notiz: d.notiz ?? null,
    aktiv: d.aktiv,
  };
}

export async function createDienstleister(formData: FormData) {
  await requireEditor();
  await prisma.dienstleister.create({ data: parseForm(formData) });
  revalidatePath("/dienstleister");
  redirect("/dienstleister");
}

export async function updateDienstleister(id: string, formData: FormData) {
  await requireEditor();
  await prisma.dienstleister.update({ where: { id }, data: parseForm(formData) });
  revalidatePath("/dienstleister");
  redirect("/dienstleister");
}

export async function deleteDienstleister(id: string) {
  await requireEditor();
  await prisma.dienstleister.delete({ where: { id } });
  revalidatePath("/dienstleister");
  redirect("/dienstleister");
}

// Übernimmt Vorschläge aus dem Import-Verlauf als Dienstleister (Suchbegriff = Empfängername).
export async function uebernehmeVorschlaege(
  vorschlaege: { name: string; kostenartId: string; gebaeudeAuswahl: string | null }[],
) {
  await requireEditor();
  const vorhanden = new Set((await prisma.dienstleister.findMany({ select: { name: true } })).map((d) => d.name));
  const neu = vorschlaege.filter((v) => v.name.trim().length >= 3 && !vorhanden.has(v.name));
  if (neu.length > 0) {
    await prisma.dienstleister.createMany({
      data: neu.map((v) => ({
        name: v.name,
        suchbegriffe: v.name,
        kostenartId: v.kostenartId,
        gebaeudeAuswahl: v.gebaeudeAuswahl,
      })),
    });
  }
  revalidatePath("/dienstleister");
}
