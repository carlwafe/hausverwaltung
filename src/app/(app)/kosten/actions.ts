"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
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
  const { gebaeudeId, hausId, kostengruppeId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");
  return { ...rest, gebaeudeId, hausId, kostengruppeId };
}

export async function createKostenposition(formData: FormData) {
  await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, ...rest } = parseForm(formData);

  await prisma.kostenposition.create({
    data: {
      ...rest,
      kostenart: { connect: { id: kostenartId } },
      ...(gebaeudeId ? { gebaeude: { connect: { id: gebaeudeId } } } : {}),
      ...(hausId ? { haus: { connect: { id: hausId } } } : {}),
      ...(kostengruppeId ? { kostengruppe: { connect: { id: kostengruppeId } } } : {}),
    },
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}

export async function updateKostenposition(id: string, formData: FormData) {
  await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, ...rest } = parseForm(formData);

  await prisma.kostenposition.update({
    where: { id },
    data: {
      ...rest,
      kostenart: { connect: { id: kostenartId } },
      gebaeude: gebaeudeId ? { connect: { id: gebaeudeId } } : { disconnect: true },
      haus: hausId ? { connect: { id: hausId } } : { disconnect: true },
      kostengruppe: kostengruppeId ? { connect: { id: kostengruppeId } } : { disconnect: true },
    },
  });

  revalidatePath("/kosten");
  revalidatePath(`/kosten/${id}`);
  redirect("/kosten");
}

export async function deleteKostenposition(id: string) {
  await requireEditor();
  await prisma.kostenposition.delete({ where: { id } });
  revalidatePath("/kosten");
  redirect("/kosten");
}

export async function deleteKostenpositionen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.kostenposition.deleteMany({ where: { id: { in: ids } } });
  revalidatePath("/kosten");
}

const aufteilungTeilSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  beschreibung: z.string().optional(),
});

/**
 * Teilt eine als eine Buchung importierte Kostenposition (z.B. eine Hausmeister-Rechnung mit
 * umlagefähigem Hausmeisterdienst + nicht umlagefähigem Winterdienst) in mehrere Positionen mit
 * je eigener Kostenart/Betrag auf. Die ursprüngliche Position wird durch die neuen ersetzt statt
 * daneben zu bestehen — dadurch bleiben alle bestehenden Summen (Nebenkostenabrechnung,
 * Jahresübersicht, Kosten-Übersicht) automatisch korrekt, ohne dass sie von der Aufteilung
 * wissen müssen. `aufteilungGruppeId` verknüpft die neuen Positionen als zusammengehörig, damit
 * die Kosten-Übersicht sie wieder als eine Zeile darstellen kann.
 */
export async function teileKostenpositionAuf(
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

  const parsed = z.array(aufteilungTeilSchema).min(2, "Mindestens zwei Positionen nötig").safeParse(teileRoh);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const teile = parsed.data;

  const original = await prisma.kostenposition.findUnique({ where: { id } });
  if (!original) return "Kostenposition nicht gefunden.";

  const summeTeile = teile.reduce((sum, t) => sum + t.betrag, 0);
  if (Math.abs(summeTeile - Number(original.betrag)) > 0.01) {
    return `Die Summe der Teile (${summeTeile.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  const gruppeId = original.aufteilungGruppeId ?? original.id;

  await prisma.$transaction(async (tx) => {
    const neuePositionen = [];
    for (const teil of teile) {
      const neu = await tx.kostenposition.create({
        data: {
          kostenartId: teil.kostenartId,
          betrag: teil.betrag,
          beschreibung: teil.beschreibung || original.beschreibung,
          empfaenger: original.empfaenger,
          gebaeudeId: original.gebaeudeId,
          hausId: original.hausId,
          kostengruppeId: original.kostengruppeId,
          jahr: original.jahr,
          datum: original.datum,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
      neuePositionen.push(neu);
    }
    // Belege hängen an der ursprünglichen Position — auf die erste neue Teil-Position umhängen,
    // statt sie beim Löschen der ursprünglichen Position durch die Cascade zu verlieren.
    await tx.dokument.updateMany({
      where: { kostenpositionId: id },
      data: { kostenpositionId: neuePositionen[0].id },
    });
    await tx.kostenposition.delete({ where: { id } });
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}
