"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { AktionsFehler, zodFehler, mitMeldung } from "@/lib/aktion";

const mieterSchema = z.object({
  anrede: z.enum(["FRAU", "HERR"]).nullable(),
  // Leer bei Firmen/Genossenschaften/Behörden — dann steht der ganze Name im Nachnamen.
  vorname: z.string().trim(),
  nachname: z.string().trim().min(1, "Nachname ist erforderlich"),
  email: z.string().email("Ungültige E-Mail").optional().or(z.literal("").transform(() => undefined)),
  handynummer: z.string().optional(),
  festnetznummer: z.string().optional(),
  buergergeldEmpfaenger: z.boolean(),
  notizen: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = mieterSchema.safeParse({
    anrede: formData.get("anrede") || null,
    vorname: formData.get("vorname") ?? "",
    nachname: formData.get("nachname"),
    email: formData.get("email") ?? "",
    handynummer: formData.get("handynummer") || undefined,
    festnetznummer: formData.get("festnetznummer") || undefined,
    buergergeldEmpfaenger: formData.get("buergergeldEmpfaenger") === "on",
    notizen: formData.get("notizen") || undefined,
  });

  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }
  return parsed.data;
}

export const createMieter = mitMeldung(async function createMieter(formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  await prisma.mieter.create({ data });

  revalidatePath("/mieter");
  redirect("/mieter");
});

export const updateMieter = mitMeldung(async function updateMieter(id: string, formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  await prisma.mieter.update({ where: { id }, data });

  revalidatePath("/mieter");
  revalidatePath(`/mieter/${id}`);
  redirect("/mieter");
});

/** Anrede vieler Mieter auf einmal setzen (Seite /mieter/anrede) — Felder "anrede_<mieterId>". */
export async function speichereAnreden(formData: FormData): Promise<string> {
  await requireEditor();
  const wunsch = new Map<string, "FRAU" | "HERR" | null>();
  for (const [key, wert] of formData.entries()) {
    if (!key.startsWith("anrede_")) continue;
    if (wert !== "" && wert !== "FRAU" && wert !== "HERR") throw new AktionsFehler("Ungültige Anrede");
    wunsch.set(key.slice("anrede_".length), wert === "" ? null : wert);
  }
  const bestehend = await prisma.mieter.findMany({ where: { id: { in: [...wunsch.keys()] } }, select: { id: true, anrede: true } });
  const aenderungen = bestehend.filter((m) => m.anrede !== wunsch.get(m.id));
  // Je Zielwert ein updateMany statt eines Updates pro Mieter — ~100 Einzel-Updates über Neon
  // überschritten das 5-s-Limit der Transaktion (P2028) und wurden komplett zurückgerollt.
  const nachWert = (wert: "FRAU" | "HERR" | null) => aenderungen.filter((m) => wunsch.get(m.id) === wert).map((m) => m.id);
  await prisma.$transaction(
    (["FRAU", "HERR", null] as const)
      .map((wert) => ({ wert, ids: nachWert(wert) }))
      .filter(({ ids }) => ids.length > 0)
      .map(({ wert, ids }) => prisma.mieter.updateMany({ where: { id: { in: ids } }, data: { anrede: wert } })),
  );

  revalidatePath("/mieter");
  revalidatePath("/mieter/anrede");
  revalidatePath("/mietvertraege", "layout");
  return `${aenderungen.length} Anrede${aenderungen.length === 1 ? "" : "n"} gespeichert.`;
}

export async function deleteMieter(id: string) {
  await requireEditor();
  await prisma.mieter.delete({ where: { id } });
  revalidatePath("/mieter");
  redirect("/mieter");
}
