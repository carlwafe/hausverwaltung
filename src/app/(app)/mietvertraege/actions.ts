"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

const optionalPositiveNumber = z
  .union([z.coerce.number().positive(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalNonNegativeNumber = z
  .union([z.coerce.number().min(0), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const mietvertragSchema = z.object({
  einheitId: z.string().min(1, "Einheit ist erforderlich"),
  mieterId: z.string().min(1, "Mieter ist erforderlich"),
  beginn: z.coerce.date({ error: "Mietbeginn ist erforderlich" }),
  ende: z
    .union([z.coerce.date(), z.literal("")])
    .optional()
    .transform((v) => (v === "" || v === undefined ? undefined : v)),
  kaltmiete: z.coerce.number().positive("Kaltmiete muss größer als 0 sein"),
  nebenkostenVorauszahlung: z.coerce.number().min(0),
  status: z.enum(["AKTIV", "BEENDET", "GEPLANT"]),
  kautionBetrag: optionalPositiveNumber,
  kautionAnlageform: z.enum(["SPARBUCH", "KAUTIONSKONTO", "BUERGSCHAFT", "BAR"]).optional(),
  kautionZinssatz: optionalNonNegativeNumber,
});

function parseForm(formData: FormData) {
  const parsed = mietvertragSchema.safeParse({
    einheitId: formData.get("einheitId"),
    mieterId: formData.get("mieterId"),
    beginn: formData.get("beginn"),
    ende: formData.get("ende") || "",
    kaltmiete: formData.get("kaltmiete"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    status: formData.get("status"),
    kautionBetrag: formData.get("kautionBetrag") || "",
    kautionAnlageform: formData.get("kautionAnlageform") || undefined,
    kautionZinssatz: formData.get("kautionZinssatz") || "",
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }
  return parsed.data;
}

export async function createMietvertrag(formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.mietvertrag.create({
    data: {
      einheitId: data.einheitId,
      mieterId: data.mieterId,
      beginn: data.beginn,
      ende: data.ende,
      kaltmiete: data.kaltmiete,
      nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
      status: data.status,
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
  revalidatePath("/");
  redirect("/mietvertraege");
}

export async function updateMietvertrag(id: string, formData: FormData) {
  await requireUser();
  const data = parseForm(formData);

  await prisma.$transaction(async (tx) => {
    await tx.mietvertrag.update({
      where: { id },
      data: {
        einheitId: data.einheitId,
        mieterId: data.mieterId,
        beginn: data.beginn,
        ende: data.ende,
        kaltmiete: data.kaltmiete,
        nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
        status: data.status,
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
  revalidatePath("/");
  redirect("/mietvertraege");
}

export async function deleteMietvertrag(id: string) {
  await requireUser();
  await prisma.mietvertrag.delete({ where: { id } });
  revalidatePath("/mietvertraege");
  revalidatePath("/");
  redirect("/mietvertraege");
}
