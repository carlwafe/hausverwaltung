"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const optionalPositiveNumber = z
  .union([z.coerce.number().positive(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalNonNegativeNumber = z
  .union([z.coerce.number().min(0), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const mietvertragSchema = z
  .object({
    einheitId: z.string().min(1, "Einheit ist erforderlich"),
    mieterId1: z.string().min(1, "Mieter ist erforderlich"),
    mieterId2: z.string().optional(),
    beginnUnbekannt: z.coerce.boolean().optional(),
    beginn: z
      .union([z.coerce.date(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    ende: z
      .union([z.coerce.date(), z.literal("")])
      .optional()
      .transform((v) => (v === "" || v === undefined ? undefined : v)),
    kaltmiete: z.coerce.number().positive("Kaltmiete muss größer als 0 sein"),
    nebenkostenVorauszahlung: z.coerce.number().min(0),
    mehrwertsteuer: optionalNonNegativeNumber,
    status: z.enum(["AKTIV", "BEENDET", "GEPLANT"]),
    kautionBetrag: optionalPositiveNumber,
    kautionAnlageform: z.enum(["SPARBUCH", "KAUTIONSKONTO", "BUERGSCHAFT", "BAR"]).optional(),
    kautionZinssatz: optionalNonNegativeNumber,
    saldovortrag: z.coerce.number().optional().default(0),
  })
  .refine((d) => !d.mieterId2 || d.mieterId2 !== d.mieterId1, {
    message: "Der zweite Mieter darf nicht mit dem ersten identisch sein",
    path: ["mieterId2"],
  })
  .refine((d) => d.status !== "BEENDET" || d.ende !== undefined, {
    message: "Mietende ist erforderlich, wenn der Vertrag als beendet markiert wird",
    path: ["ende"],
  })
  .refine((d) => d.beginnUnbekannt || d.beginn !== undefined, {
    message: "Mietbeginn ist erforderlich (oder als unbekannt markieren)",
    path: ["beginn"],
  });

async function parseForm(formData: FormData) {
  const parsed = mietvertragSchema.safeParse({
    einheitId: formData.get("einheitId"),
    mieterId1: formData.get("mieterId1"),
    mieterId2: formData.get("mieterId2") || undefined,
    beginnUnbekannt: formData.get("beginnUnbekannt") === "on",
    beginn: formData.get("beginn") || "",
    ende: formData.get("ende") || "",
    kaltmiete: formData.get("kaltmiete"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    mehrwertsteuer: formData.get("mehrwertsteuer") || "",
    status: formData.get("status"),
    kautionBetrag: formData.get("kautionBetrag") || "",
    kautionAnlageform: formData.get("kautionAnlageform") || undefined,
    kautionZinssatz: formData.get("kautionZinssatz") || "",
    saldovortrag: formData.get("saldovortrag") || "0",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const einheit = await prisma.einheit.findUnique({
    where: { id: parsed.data.einheitId },
    select: { typ: true },
  });
  if (einheit?.typ === "GARAGE" && parsed.data.mehrwertsteuer === undefined) {
    throw new Error("Mehrwertsteuer ist bei Garagen/Stellplätzen erforderlich");
  }

  return parsed.data;
}

function mieterIds(data: { mieterId1: string; mieterId2?: string }) {
  return data.mieterId2 ? [data.mieterId1, data.mieterId2] : [data.mieterId1];
}

export async function createMietvertrag(formData: FormData) {
  await requireEditor();
  const data = await parseForm(formData);

  await prisma.mietvertrag.create({
    data: {
      einheit: { connect: { id: data.einheitId } },
      mieter: { connect: mieterIds(data).map((id) => ({ id })) },
      beginn: data.beginnUnbekannt ? null : data.beginn,
      ende: data.ende,
      kaltmiete: data.kaltmiete,
      nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
      mehrwertsteuer: data.mehrwertsteuer,
      status: data.status,
      saldovortrag: data.saldovortrag,
      ...(data.kautionBetrag !== undefined
        ? {
            kaution: {
              create: {
                betrag: data.kautionBetrag,
                anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
                zinssatz: data.kautionZinssatz,
              },
            },
          }
        : {}),
    },
  });

  revalidatePath("/mietvertraege");
  revalidatePath("/offene-posten");
  revalidatePath("/");
  redirect("/mietvertraege");
}

export async function updateMietvertrag(id: string, formData: FormData) {
  await requireEditor();
  const data = await parseForm(formData);

  await prisma.$transaction(async (tx) => {
    await tx.mietvertrag.update({
      where: { id },
      data: {
        einheit: { connect: { id: data.einheitId } },
        mieter: { set: mieterIds(data).map((mid) => ({ id: mid })) },
        beginn: data.beginnUnbekannt ? null : data.beginn,
        // Bewusst mit ?? null statt nur data.ende: Prisma behandelt ein undefined-Feld in
        // update() als "unverändert lassen", nicht als "auf null setzen" — ohne diesen Fallback
        // würde ein geleertes Mietende-Feld (z.B. beim Umstellen von Beendet auf Aktiv) beim
        // Speichern stillschweigend ignoriert und das alte Datum bliebe in der Datenbank stehen.
        ende: data.ende ?? null,
        kaltmiete: data.kaltmiete,
        nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
        mehrwertsteuer: data.mehrwertsteuer ?? null,
        status: data.status,
        saldovortrag: data.saldovortrag,
      },
    });

    if (data.kautionBetrag !== undefined) {
      await tx.kaution.upsert({
        where: { mietvertragId: id },
        create: {
          mietvertragId: id,
          betrag: data.kautionBetrag,
          anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
          zinssatz: data.kautionZinssatz,
        },
        update: {
          betrag: data.kautionBetrag,
          anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
          zinssatz: data.kautionZinssatz,
        },
      });
    }
  });

  revalidatePath("/mietvertraege");
  revalidatePath(`/mietvertraege/${id}`);
  revalidatePath("/offene-posten");
  revalidatePath("/");
  redirect("/mietvertraege");
}

export async function deleteMietvertrag(id: string) {
  await requireEditor();
  await prisma.mietvertrag.delete({ where: { id } });
  revalidatePath("/mietvertraege");
  revalidatePath("/");
  redirect("/mietvertraege");
}
