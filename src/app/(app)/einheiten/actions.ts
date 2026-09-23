"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const einheitSchema = z.object({
  gebaeudeId: z.string().min(1, "Gebäude ist erforderlich"),
  bezeichnung: z.string().min(1, "Bezeichnung ist erforderlich"),
  typ: z.enum(["WOHNUNG", "GARAGE"]),
  etage: z.string().optional(),
  wohnflaecheQm: z.coerce.number().positive("Wohnfläche muss größer als 0 sein"),
  einbaukueche: z.coerce.boolean(),
  fotosVorhanden: z.coerce.boolean(),
  notizen: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = einheitSchema.safeParse({
    gebaeudeId: formData.get("gebaeudeId"),
    bezeichnung: formData.get("bezeichnung"),
    typ: formData.get("typ"),
    etage: formData.get("etage") || undefined,
    wohnflaecheQm: formData.get("wohnflaecheQm"),
    einbaukueche: formData.get("einbaukueche"),
    fotosVorhanden: formData.get("fotosVorhanden"),
    notizen: formData.get("notizen") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { gebaeudeId, ...rest } = parsed.data;
  return { gebaeudeId, rest };
}

export async function createEinheit(formData: FormData) {
  await requireEditor();
  const { gebaeudeId, rest } = parseForm(formData);

  await prisma.einheit.create({
    data: { ...rest, gebaeude: { connect: { id: gebaeudeId } } },
  });

  revalidatePath("/einheiten");
  redirect("/einheiten");
}

export async function updateEinheit(id: string, formData: FormData) {
  await requireEditor();
  const { gebaeudeId, rest } = parseForm(formData);

  await prisma.einheit.update({
    where: { id },
    data: { ...rest, gebaeude: { connect: { id: gebaeudeId } } },
  });

  revalidatePath("/einheiten");
  revalidatePath(`/einheiten/${id}`);
  redirect("/einheiten");
}

export async function deleteEinheit(id: string) {
  await requireEditor();
  await prisma.einheit.delete({ where: { id } });
  revalidatePath("/einheiten");
  redirect("/einheiten");
}

const wohnflaecheKorrekturSchema = z.object({
  bisJahr: z.coerce.number().int().min(2000).max(2100),
  wohnflaecheQm: z.coerce.number().positive("Wohnfläche muss größer als 0 sein"),
  notizen: z.string().optional(),
});

// Rückwirkende Korrektur für Jahre, in denen die Nebenkostenabrechnung mit einer anderen (z.B.
// historisch falsch eingetragenen) Wohnfläche gerechnet wurde als der heute in Einheit.wohnflaecheQm
// hinterlegte, korrekte Wert — siehe WohnflaecheKorrektur und ladeBerechnungsdaten in
// nebenkostenabrechnungen/actions.ts.
export async function erfasseWohnflaecheKorrektur(
  einheitId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const parsed = wohnflaecheKorrekturSchema.safeParse({
    bisJahr: formData.get("bisJahr"),
    wohnflaecheQm: formData.get("wohnflaecheQm"),
    notizen: formData.get("notizen") || undefined,
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");

  try {
    await prisma.wohnflaecheKorrektur.create({ data: { einheitId, ...parsed.data } });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return "Für dieses Jahr existiert bereits eine Korrektur.";
    }
    throw err;
  }
  revalidatePath(`/einheiten/${einheitId}`);
  return null;
}

export async function loescheWohnflaecheKorrektur(einheitId: string, id: string) {
  await requireEditor();
  await prisma.wohnflaecheKorrektur.delete({ where: { id } });
  revalidatePath(`/einheiten/${einheitId}`);
}
