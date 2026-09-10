"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";

const zahlungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: z.coerce.date({ error: "Datum ist erforderlich" }),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  periodeMonat: z.coerce.number().int().min(1).max(12),
  periodeJahr: z.coerce.number().int().min(2000).max(2100),
  verwendungszweck: z.string().optional(),
});

export async function createZahlung(formData: FormData) {
  await requireEditor();

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;

  await prisma.zahlung.create({
    data: { ...rest, mietvertrag: { connect: { id: mietvertragId } } },
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect(`/mietvertraege/${mietvertragId}`);
}

export async function updateZahlung(id: string, formData: FormData) {
  await requireEditor();

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;
  const bisherige = await prisma.zahlung.findUniqueOrThrow({ where: { id }, select: { mietvertragId: true } });

  await prisma.zahlung.update({
    where: { id },
    data: { ...rest, mietvertrag: { connect: { id: mietvertragId } } },
  });

  revalidatePath("/zahlungen");
  revalidatePath(`/zahlungen/${id}`);
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  if (bisherige.mietvertragId !== mietvertragId) {
    revalidatePath(`/mietvertraege/${bisherige.mietvertragId}`);
  }
  redirect("/zahlungen");
}

export async function deleteZahlung(id: string) {
  await requireEditor();
  const zahlung = await prisma.zahlung.delete({ where: { id } });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${zahlung.mietvertragId}`);
  redirect("/zahlungen");
}

export async function deleteZahlungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.zahlung.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/mietvertraege");
  revalidatePath("/");
}

const aufteilungTeilSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  periodeMonat: z.coerce.number().int().min(1).max(12),
  periodeJahr: z.coerce.number().int().min(2000).max(2100),
  verwendungszweck: z.string().optional(),
});

/**
 * Teilt eine als eine Buchung importierte/erfasste Zahlung (z.B. eine Überweisung, die Miete für
 * Wohnung und Garage in einer Summe zahlt) in mehrere Zahlungen mit je eigenem Mietvertrag/
 * Betrag/Periode auf. Die ursprüngliche Zahlung wird durch die neuen ersetzt statt daneben zu
 * bestehen — dadurch bleiben Soll/Ist und offene Posten automatisch korrekt. Analog zu
 * teileKostenpositionAuf in kosten/actions.ts.
 */
export async function teileZahlungAuf(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("teile");
  if (typeof raw !== "string") return "Keine Aufteilung übermittelt.";

  let teileRoh: unknown;
  try {
    teileRoh = JSON.parse(raw);
  } catch {
    return "Aufteilung konnte nicht gelesen werden.";
  }

  const parsed = z.array(aufteilungTeilSchema).min(2, "Mindestens zwei Zahlungen nötig").safeParse(teileRoh);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const teile = parsed.data;

  const original = await prisma.zahlung.findUnique({ where: { id } });
  if (!original) return "Zahlung nicht gefunden.";

  const summeTeile = teile.reduce((sum, t) => sum + t.betrag, 0);
  if (Math.abs(summeTeile - Number(original.betrag)) > 0.01) {
    return `Die Summe der Teile (${summeTeile.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  const gruppeId = original.aufteilungGruppeId ?? original.id;
  const betroffeneMietvertraege = new Set([original.mietvertragId, ...teile.map((t) => t.mietvertragId)]);

  await prisma.$transaction(async (tx) => {
    for (const teil of teile) {
      await tx.zahlung.create({
        data: {
          mietvertragId: teil.mietvertragId,
          datum: original.datum,
          betrag: teil.betrag,
          periodeMonat: teil.periodeMonat,
          periodeJahr: teil.periodeJahr,
          verwendungszweck: teil.verwendungszweck || original.verwendungszweck,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
    }
    await tx.zahlung.delete({ where: { id } });
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  for (const mietvertragId of betroffeneMietvertraege) revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect("/zahlungen");
}

// Macht eine Aufteilung wieder rückgängig: alle Zahlungen derselben aufteilungGruppeId werden zu
// einer einzigen Zahlung zusammengeführt (Betrag = Summe), unter dem Mietvertrag/der Periode der
// Zahlung, von der aus die Aktion aufgerufen wurde.
export async function hebeZahlungAufteilungAuf(zahlungId: string) {
  await requireEditor();
  const zahlung = await prisma.zahlung.findUnique({ where: { id: zahlungId } });
  if (!zahlung) throw new Error("Zahlung nicht gefunden.");
  if (!zahlung.aufteilungGruppeId) throw new Error("Diese Zahlung ist nicht Teil einer Aufteilung.");

  const gruppe = await prisma.zahlung.findMany({ where: { aufteilungGruppeId: zahlung.aufteilungGruppeId } });
  const summe = gruppe.reduce((sum, z) => sum + Number(z.betrag), 0);
  const betroffeneMietvertraege = new Set(gruppe.map((z) => z.mietvertragId));

  await prisma.$transaction(async (tx) => {
    await tx.zahlung.create({
      data: {
        mietvertragId: zahlung.mietvertragId,
        datum: zahlung.datum,
        betrag: summe,
        periodeMonat: zahlung.periodeMonat,
        periodeJahr: zahlung.periodeJahr,
        verwendungszweck: zahlung.verwendungszweck,
        rohdaten: zahlung.rohdaten ?? undefined,
        importBatchId: zahlung.importBatchId,
      },
    });
    await tx.zahlung.deleteMany({ where: { aufteilungGruppeId: zahlung.aufteilungGruppeId } });
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  for (const mietvertragId of betroffeneMietvertraege) revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect("/zahlungen");
}
