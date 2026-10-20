"use server";

import { z } from "zod";
import { optionalesDatum } from "@/lib/zod-datum";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { mitMeldung } from "@/lib/aktion";
import { glaeubigerIdGueltig } from "@/lib/sepa-mandat";
import { istGueltigeIban } from "@/lib/dokument-erkennung";

const objektSchema = z
  .object({
    name: z.string().min(1, "Name ist erforderlich"),
    strasse: z.string().min(1, "Straße ist erforderlich"),
    hausnummer: z.string().min(1, "Hausnummer ist erforderlich"),
    plz: z.string().min(1, "PLZ ist erforderlich"),
    ort: z.string().min(1, "Ort ist erforderlich"),
    beschreibung: z.string().optional(),
    telefonMieter: z.string().trim().transform((v) => v || null),
    emailVerwaltung: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "E-Mail Verwaltung ist ungültig"),
    emailMieter: z
      .string()
      .trim()
      .transform((v) => v || null)
      .refine((v) => v === null || z.email().safeParse(v).success, "E-Mail Mieter ist ungültig"),
    sepaGlaeubigerName: z.string().trim().transform((v) => v || null),
    sepaGlaeubigerAnschrift: z.string().trim().transform((v) => v || null),
    sepaGlaeubigerId: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase() || null)
      .refine((v) => v === null || glaeubigerIdGueltig(v), "Gläubiger-ID ist ungültig (Aufbau oder Prüfziffer stimmt nicht)"),
    mietkontoInhaber: z.string().trim().transform((v) => v || null),
    mietkontoIban: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase() || null)
      .refine((v) => v === null || istGueltigeIban(v), "IBAN des Mietkontos ist ungültig (Aufbau oder Prüfziffer stimmt nicht)"),
    mietkontoBic: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, "").toUpperCase() || null)
      .refine((v) => v === null || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), "BIC des Mietkontos ist ungültig"),
    mietkontoBank: z.string().trim().transform((v) => v || null),
    buchhaltungAb: optionalesDatum().transform((v) => v ?? null),
    kontostandAnkerDatum: optionalesDatum().transform((v) => v ?? null),
    kontostandAnkerBetrag: z
      .union([z.coerce.number(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? null : v)),
  })
  .refine((d) => (d.kontostandAnkerDatum === null) === (d.kontostandAnkerBetrag === null), {
    message: "Kontostand-Anker: Datum und Betrag müssen beide gesetzt sein (oder beide leer bleiben)",
    path: ["kontostandAnkerBetrag"],
  });

export const updateObjekt = mitMeldung(async function updateObjekt(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireAdmin();

  const parsed = objektSchema.safeParse({
    name: formData.get("name"),
    strasse: formData.get("strasse"),
    hausnummer: formData.get("hausnummer"),
    plz: formData.get("plz"),
    ort: formData.get("ort"),
    beschreibung: formData.get("beschreibung") || undefined,
    telefonMieter: formData.get("telefonMieter") ?? "",
    emailVerwaltung: formData.get("emailVerwaltung") ?? "",
    emailMieter: formData.get("emailMieter") ?? "",
    sepaGlaeubigerName: formData.get("sepaGlaeubigerName") ?? "",
    sepaGlaeubigerAnschrift: formData.get("sepaGlaeubigerAnschrift") ?? "",
    sepaGlaeubigerId: formData.get("sepaGlaeubigerId") ?? "",
    mietkontoInhaber: formData.get("mietkontoInhaber") ?? "",
    mietkontoIban: formData.get("mietkontoIban") ?? "",
    mietkontoBic: formData.get("mietkontoBic") ?? "",
    mietkontoBank: formData.get("mietkontoBank") ?? "",
    buchhaltungAb: formData.get("buchhaltungAb") || "",
    kontostandAnkerDatum: formData.get("kontostandAnkerDatum") || "",
    kontostandAnkerBetrag: formData.get("kontostandAnkerBetrag") || "",
  });

  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }

  const objekt = await prisma.objekt.findFirst();
  if (!objekt) return "Kein Objekt vorhanden.";

  await prisma.objekt.update({ where: { id: objekt.id }, data: parsed.data });

  revalidatePath("/objekt");
  revalidatePath("/");
  revalidatePath("/offene-posten");
  revalidatePath("/kontostand");
  revalidatePath("/mietvertraege/lastschrift-mandate", "layout");
  return null;
});
