"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";

const kostenpositionSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  // Optional: manche Kosten (z.B. Bankgebühren, Verwaltungskosten) betreffen das ganze Objekt und
  // lassen sich keinem einzelnen Gebäude zuordnen. Trägt ein "gebaeude:"/"haus:"-Präfix, siehe
  // parseGebaeudeAuswahlWert.
  gebaeudeAuswahl: z.string().optional(),
  jahr: z.coerce.number().int().min(2000).max(2100),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  beschreibung: z.string().optional(),
  empfaenger: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = kostenpositionSchema.safeParse({
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeId") || undefined,
    jahr: formData.get("jahr"),
    betrag: formData.get("betrag"),
    beschreibung: formData.get("beschreibung") || undefined,
    empfaenger: formData.get("empfaenger") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  const { gebaeudeAuswahl, ...rest } = parsed.data;
  const { gebaeudeId, hausId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");
  return { ...rest, gebaeudeId, hausId };
}

export async function createKostenposition(formData: FormData) {
  await requireUser();
  const { kostenartId, gebaeudeId, hausId, ...rest } = parseForm(formData);

  await prisma.kostenposition.create({
    data: {
      ...rest,
      kostenart: { connect: { id: kostenartId } },
      ...(gebaeudeId ? { gebaeude: { connect: { id: gebaeudeId } } } : {}),
      ...(hausId ? { haus: { connect: { id: hausId } } } : {}),
    },
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}

export async function updateKostenposition(id: string, formData: FormData) {
  await requireUser();
  const { kostenartId, gebaeudeId, hausId, ...rest } = parseForm(formData);

  await prisma.kostenposition.update({
    where: { id },
    data: {
      ...rest,
      kostenart: { connect: { id: kostenartId } },
      gebaeude: gebaeudeId ? { connect: { id: gebaeudeId } } : { disconnect: true },
      haus: hausId ? { connect: { id: hausId } } : { disconnect: true },
    },
  });

  revalidatePath("/kosten");
  revalidatePath(`/kosten/${id}`);
  redirect("/kosten");
}

export async function deleteKostenposition(id: string) {
  await requireUser();
  await prisma.kostenposition.delete({ where: { id } });
  revalidatePath("/kosten");
  redirect("/kosten");
}
