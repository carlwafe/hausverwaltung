"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const VERTEILERSCHLUESSEL = [
  "WOHNFLAECHE",
  "EINHEITEN",
  "VORVERTEILT",
  "IN_ABRECHNUNG_ENTHALTEN",
] as const;

const kostenartSchema = z
  .object({
    name: z.string().min(1, "Name ist erforderlich"),
    umlagefaehig: z.coerce.boolean(),
    standardVerteilerschluessel: z.enum(VERTEILERSCHLUESSEL).optional(),
    masseinheit: z.string().optional(),
    betrKvNummer: z.coerce.number().int().min(1).max(16).optional(),
    istSonstigeBetriebskosten: z.coerce.boolean(),
    vertraglicheGrundlage: z.string().optional(),
  })
  .refine(
    (data) => !(data.umlagefaehig && data.istSonstigeBetriebskosten) || !!data.vertraglicheGrundlage?.trim(),
    {
      message:
        "Vertragliche Grundlage ist erforderlich für umlagefähige Kostenarten unter § 2 Nr. 17 BetrKV — ein pauschaler Verweis auf die Vorschrift reicht laut Rechtsprechung nicht aus, die Position muss konkret im Mietvertrag benannt sein",
      path: ["vertraglicheGrundlage"],
    },
  )
  .refine((data) => !(data.betrKvNummer && data.istSonstigeBetriebskosten), {
    message: "Eine Kostenart ist entweder einer der Nr. 1–16 zugeordnet oder \"sonstige\" (Nr. 17), nicht beides",
    path: ["betrKvNummer"],
  });

function parseForm(formData: FormData) {
  const parsed = kostenartSchema.safeParse({
    name: formData.get("name"),
    umlagefaehig: formData.get("umlagefaehig") === "on",
    standardVerteilerschluessel: formData.get("standardVerteilerschluessel") || undefined,
    masseinheit: formData.get("masseinheit") || undefined,
    betrKvNummer: formData.get("betrKvNummer") || undefined,
    istSonstigeBetriebskosten: formData.get("istSonstigeBetriebskosten") === "on",
    vertraglicheGrundlage: formData.get("vertraglicheGrundlage") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function createKostenart(formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  await prisma.kostenart.create({
    data: {
      ...data,
      standardVerteilerschluessel: data.standardVerteilerschluessel ?? null,
      masseinheit: data.masseinheit ?? null,
      betrKvNummer: data.betrKvNummer ?? null,
      vertraglicheGrundlage: data.vertraglicheGrundlage ?? null,
    },
  });

  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}

export async function updateKostenart(id: string, formData: FormData) {
  await requireEditor();
  const data = parseForm(formData);

  // Prisma behandelt `undefined` in `data` als "Feld unverändert lassen", nicht als "auf null
  // setzen" — ohne den expliziten Fallback würde ein deaktiviertes (also nicht mitgesendetes)
  // Verteilerschlüssel-Feld den alten Wert stillschweigend behalten, statt ihn zu löschen.
  await prisma.kostenart.update({
    where: { id },
    data: {
      ...data,
      standardVerteilerschluessel: data.standardVerteilerschluessel ?? null,
      masseinheit: data.masseinheit ?? null,
      betrKvNummer: data.betrKvNummer ?? null,
      vertraglicheGrundlage: data.vertraglicheGrundlage ?? null,
    },
  });

  revalidatePath("/kostenarten");
  revalidatePath(`/kostenarten/${id}`);
  redirect("/kostenarten");
}

export async function deleteKostenart(id: string) {
  await requireEditor();
  await prisma.kostenart.delete({ where: { id } });
  revalidatePath("/kostenarten");
  redirect("/kostenarten");
}
