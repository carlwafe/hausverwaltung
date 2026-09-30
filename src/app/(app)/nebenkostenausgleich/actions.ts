"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";

export async function deleteNebenkostenausgleichZahlungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id);
    }
  });
  revalidatePath("/nebenkostenausgleich");
}

const aufteilungTeilSchema = z.object({
  typ: z.literal("nebenkostenausgleich"),
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  // Bankvorzeichen wie die ursprüngliche Buchung (Auszahlung an den Mieter negativ).
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  jahr: z.coerce.number().int().min(2000).max(2100).nullable().optional(),
  beschreibung: z.string().optional(),
});

/**
 * Teilt eine Nebenkostenausgleich-Buchung (eine Überweisung) in mehrere Teile auf — z.B. eine Überweisung,
 * die zwei Abrechnungsjahre/Mietverträge auf einmal begleicht. Ein mit ausgezahltes Mietkonto-Guthaben
 * bzw. ein damit verrechneter Rückstand wird dagegen als NK-Verrechnung (MAHNGEBUEHR, siehe
 * nk-verrechnung.ts) gebucht, nicht durch Aufteilen. Alle Teile tragen das Bankvorzeichen und
 * summieren sich zum Originalbetrag. Das Original wird storniert; die gemeinsame
 * aufteilungGruppeId (= Id des Originals) hält die Teile zusammen und lässt die Zeile beim
 * Kontoauszug-Import weiter als "bereits importiert" erkennen. Analog zu teileZahlungAuf.
 */
export const teileNebenkostenausgleichAuf = mitMeldung(async function teileNebenkostenausgleichAuf(
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
  const parsed = z.array(aufteilungTeilSchema).min(2, "Mindestens zwei Teile nötig").safeParse(teileRoh);
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");
  const teile = parsed.data;

  const original = await prisma.buchung.findFirst({
    where: { id, buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...AKTIVE_BUCHUNG_FILTER },
  });
  if (!original) return "Nebenkostenausgleich nicht gefunden.";

  const summe = teile.reduce((s, t) => s + t.betrag, 0);
  if (Math.abs(summe - Number(original.betrag)) > 0.005) {
    return `Die Summe der Teile (${summe.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  // Ist die Buchung schon Teil einer Aufteilung (z.B. Kautionsauszahlung + BK-Nachzahlung einer
  // Überweisung), wird nur dieser Teil weiter aufgeteilt: die neuen Teile bleiben in derselben
  // Gruppe, deren Summe (= Bankbetrag) sich nicht ändert.
  const gruppeId = original.aufteilungGruppeId ?? original.id;

  const ausgleichArt = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "NEBENKOSTENAUSGLEICH" } });

  await prisma.$transaction(async (tx) => {
    for (const teil of teile) {
      const gemeinsam = {
        mietvertragId: teil.mietvertragId,
        datum: original.datum,
        betrag: teil.betrag,
        empfaenger: original.empfaenger,
        verwendungszweck: teil.beschreibung || original.verwendungszweck,
        rohdaten: original.rohdaten ?? undefined,
        importBatchId: original.importBatchId,
        aufteilungGruppeId: gruppeId,
      };
      await tx.buchung.create({
        data: { ...gemeinsam, buchungsartId: ausgleichArt.id, jahr: teil.jahr ?? null, bemerkung: original.bemerkung },
      });
    }
    await storniereBuchung(tx, id);
  });

  revalidateAusgleich(new Set([original.mietvertragId, ...teile.map((t) => t.mietvertragId)]));
  redirect("/nebenkostenausgleich");
});

/**
 * Macht die Aufteilung rückgängig: alle aktiven Teile werden storniert und zu einer einzigen
 * Nebenkostenausgleich-Buchung (Betrag = Summe) zusammengeführt — mit Mietvertrag/Jahr des
 * größten Ausgleich-Teils (bzw. des ursprünglichen Originals).
 */
export async function hebeNebenkostenausgleichAufteilungAuf(id: string) {
  await requireEditor();
  const teil = await prisma.buchung.findFirst({ where: { id, ...AKTIVE_BUCHUNG_FILTER } });
  if (!teil?.aufteilungGruppeId) throw new AktionsFehler("Diese Buchung ist nicht Teil einer Aufteilung.");

  const gruppe = await prisma.buchung.findMany({
    where: { aufteilungGruppeId: teil.aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER },
    include: { buchungsart: { select: { code: true } } },
  });
  if (gruppe.some((b) => !["NEBENKOSTENAUSGLEICH", "SONDERZAHLUNG"].includes(b.buchungsart.code))) {
    throw new AktionsFehler("Diese Aufteilung enthält andere Buchungsarten und lässt sich hier nicht zusammenführen.");
  }
  const original = await prisma.buchung.findUnique({ where: { id: teil.aufteilungGruppeId } });
  const ausgleichTeile = gruppe
    .filter((b) => b.buchungsart.code === "NEBENKOSTENAUSGLEICH")
    .sort((a, b) => Math.abs(Number(b.betrag)) - Math.abs(Number(a.betrag)));
  const vorlage = original ?? ausgleichTeile[0];
  if (!vorlage) throw new AktionsFehler("Keine Nebenkostenausgleich-Buchung in dieser Aufteilung gefunden.");

  const summe = Math.round(gruppe.reduce((s, b) => s + Number(b.betrag), 0) * 100) / 100;

  await prisma.$transaction(async (tx) => {
    await tx.buchung.create({
      data: {
        mietvertragId: vorlage.mietvertragId,
        buchungsartId: vorlage.buchungsartId,
        datum: vorlage.datum,
        betrag: summe,
        jahr: vorlage.jahr,
        empfaenger: vorlage.empfaenger,
        verwendungszweck: vorlage.verwendungszweck?.replace(/^Storno: /, "") ?? null,
        bemerkung: vorlage.bemerkung,
        rohdaten: vorlage.rohdaten ?? undefined,
        importBatchId: vorlage.importBatchId,
      },
    });
    for (const b of gruppe) await storniereBuchung(tx, b.id);
  });

  revalidateAusgleich(new Set([vorlage.mietvertragId, ...gruppe.map((b) => b.mietvertragId)]));
  redirect("/nebenkostenausgleich");
}

function revalidateAusgleich(mietvertragIds: Set<string | null>) {
  revalidatePath("/nebenkostenausgleich");
  revalidatePath("/nebenkostenabrechnungen");
  revalidatePath("/offene-posten");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/kontostand");
  revalidatePath("/zahlungen");
  for (const id of mietvertragIds) if (id) revalidatePath(`/mietvertraege/${id}`);
}
