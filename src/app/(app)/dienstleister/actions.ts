"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { parseSuchbegriffe } from "@/lib/import/dienstleister";

const TYPEN = ["HANDWERKER", "SONSTIGE"] as const;

const dienstleisterSchema = z.object({
  typ: z.enum(TYPEN),
  name: z.string().trim().min(1, "Name ist erforderlich"),
  beschreibung: z.string().trim().optional(),
  ansprechpartner: z.string().trim().optional(),
  telefon: z.string().trim().optional(),
  email: z.string().trim().optional(),
  adresse: z.string().trim().optional(),
  suchbegriffe: z.string(),
  kostenartIds: z.array(z.string()),
  iban: z.string().trim().optional(),
  notiz: z.string().trim().optional(),
  aktiv: z.boolean(),
});

function parseForm(formData: FormData) {
  const parsed = dienstleisterSchema.safeParse({
    typ: formData.get("typ"),
    name: formData.get("name"),
    beschreibung: formData.get("beschreibung") || undefined,
    ansprechpartner: formData.get("ansprechpartner") || undefined,
    telefon: formData.get("telefon") || undefined,
    email: formData.get("email") || undefined,
    adresse: formData.get("adresse") || undefined,
    suchbegriffe: formData.get("suchbegriffe") ?? "",
    kostenartIds: formData.getAll("kostenartIds").map(String),
    iban: formData.get("iban") || undefined,
    notiz: formData.get("notiz") || undefined,
    aktiv: formData.get("aktiv") === "on",
  });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const d = parsed.data;
  const suchbegriffe = parseSuchbegriffe(d.suchbegriffe);
  return {
    typ: d.typ,
    name: d.name,
    beschreibung: d.beschreibung ?? null,
    ansprechpartner: d.ansprechpartner ?? null,
    telefon: d.telefon ?? null,
    email: d.email ?? null,
    adresse: d.adresse ?? null,
    suchbegriffe: suchbegriffe.join("\n"),
    kostenartIds: d.kostenartIds,
    iban: d.iban ?? null,
    notiz: d.notiz ?? null,
    aktiv: d.aktiv,
  };
}

export async function createDienstleister(formData: FormData) {
  await requireEditor();
  const { kostenartIds, ...data } = parseForm(formData);
  const neu = await prisma.dienstleister.create({
    data: { ...data, kostenarten: { connect: kostenartIds.map((id) => ({ id })) } },
  });
  revalidatePath("/dienstleister");
  // Weiter zur Detailseite, damit direkt ein Vertrag hochgeladen werden kann.
  redirect(`/dienstleister/${neu.id}`);
}

export async function updateDienstleister(id: string, formData: FormData) {
  await requireEditor();
  const { kostenartIds, ...data } = parseForm(formData);
  await prisma.dienstleister.update({
    where: { id },
    data: { ...data, kostenarten: { set: kostenartIds.map((k) => ({ id: k })) } },
  });
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
  vorschlaege: { name: string; typ: (typeof TYPEN)[number]; kostenartIds: string[] }[],
) {
  await requireEditor();
  const vorhanden = new Set((await prisma.dienstleister.findMany({ select: { name: true } })).map((d) => d.name));
  const neu = vorschlaege.filter((v) => v.name.trim().length >= 3 && !vorhanden.has(v.name));
  for (const v of neu) {
    await prisma.dienstleister.create({
      data: {
        typ: v.typ,
        name: v.name,
        suchbegriffe: v.name,
        kostenarten: { connect: v.kostenartIds.map((id) => ({ id })) },
      },
    });
  }
  revalidatePath("/dienstleister");
}
