import { prisma } from "@/lib/prisma";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

const ZAHLUNG_CODES = ["MIETZAHLUNG", "SONDERZAHLUNG"];

/** Ob die Aufteilungsgruppe neben Kostenpositionen auch Zahlungsteile enthält (Zahlung, die in
 * Miete und Kosten aufgeteilt wurde, siehe teileZahlungAuf). */
export async function istGemischteAufteilung(aufteilungGruppeId: string): Promise<boolean> {
  const anzahl = await prisma.buchung.count({
    where: {
      aufteilungGruppeId,
      buchungsart: { code: { in: ZAHLUNG_CODES } },
      ...AKTIVE_BUCHUNG_FILTER,
    },
  });
  return anzahl > 0;
}

/**
 * Macht die Aufteilung einer Zahlung rückgängig: alle noch aktiven Teile (Mietzahlungen,
 * Gebühren-Zahlungen UND Kostenpositionen) werden storniert und zur ursprünglichen Zahlung
 * zusammengeführt. Wichtig ist das Vorzeichen: ein Kosten-Teil ist als Kostenposition mit
 * umgekehrtem Vorzeichen des Bankbetrags gebucht (Rücklastschriftgebühr −10,44 € auf dem Konto =
 * Kostenposition +10,44 €) und geht deshalb mit −betrag in die Bank-Summe ein. Eine dem Mieter
 * berechnete Gebühren-Forderung, die an einem dieser Kosten-Teile hängt, wird mit storniert.
 *
 * Gibt die betroffenen Mietvertrag-IDs zurück (für revalidatePath).
 */
export async function hebeZahlungAufteilungAuf(aufteilungGruppeId: string, vorlageId: string) {
  const gruppe = await prisma.buchung.findMany({
    where: { aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER },
    include: { buchungsart: { select: { code: true } } },
  });

  const summe = gruppe.reduce(
    (sum, b) => sum + (b.buchungsart.code === "KOSTENPOSITION" ? -Number(b.betrag) : Number(b.betrag)),
    0,
  );

  // Vorlage der wiederhergestellten Zahlung: die ursprüngliche (stornierte) Buchung, sofern sie
  // eine Zahlung war — deren id ist die Gruppen-Id einer ersten Aufteilung. Sonst der Teil, von
  // dem aus die Aktion aufgerufen wurde.
  const original = await prisma.buchung.findUnique({
    where: { id: aufteilungGruppeId },
    include: { buchungsart: { select: { code: true } } },
  });
  const vorlage =
    original && original.mietvertragId && ZAHLUNG_CODES.includes(original.buchungsart.code)
      ? original
      : gruppe.find((b) => b.id === vorlageId) ?? gruppe.find((b) => ZAHLUNG_CODES.includes(b.buchungsart.code));
  if (!vorlage) throw new Error("Keine Zahlung in dieser Aufteilung gefunden.");

  const kostenIds = gruppe.filter((b) => b.buchungsart.code === "KOSTENPOSITION").map((b) => b.id);
  const forderungen = kostenIds.length
    ? await prisma.buchung.findMany({
        where: { bezugTyp: "Buchung", bezugId: { in: kostenIds }, ...AKTIVE_BUCHUNG_FILTER },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    await tx.buchung.create({
      data: {
        mietvertragId: vorlage.mietvertragId,
        buchungsartId: vorlage.buchungsartId,
        datum: vorlage.datum,
        betrag: Math.round(summe * 100) / 100,
        periodeMonat: vorlage.periodeMonat,
        periodeJahr: vorlage.periodeJahr,
        verwendungszweck: vorlage.verwendungszweck?.replace(/^Storno: /, "") ?? null,
        rohdaten: vorlage.rohdaten ?? undefined,
        importBatchId: vorlage.importBatchId,
      },
    });
    for (const teil of gruppe) {
      await storniereBuchung(tx, teil.id);
    }
    for (const forderung of forderungen) {
      await storniereBuchung(tx, forderung.id);
    }
  });

  return new Set([...gruppe.map((b) => b.mietvertragId), vorlage.mietvertragId].filter((id): id is string => !!id));
}
