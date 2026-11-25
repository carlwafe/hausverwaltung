import { prisma } from "@/lib/prisma";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { AktionsFehler } from "@/lib/aktion";
import { uebernehmeBuchungKommentar } from "@/lib/buchung-kommentar";

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
export async function hebeZahlungAufteilungAuf(
  aufteilungGruppeId: string,
  vorlageId: string,
  erstelltVon: string | null,
) {
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
  if (!vorlage) throw new AktionsFehler("Keine Zahlung in dieser Aufteilung gefunden.");

  // Mietmonat der zusammengeführten Zahlung: der der Mietteile, wenn sie alle denselben haben (wurde ein Teil nach
  // dem Aufteilen z.B. auf den Monat der geplatzten Lastschrift umgestellt, bleibt dieser erhalten), sonst der der Vorlage.
  const mietMonate = new Set(
    gruppe.filter((b) => b.buchungsart.code === "MIETZAHLUNG" && b.periodeJahr && b.periodeMonat).map((b) => `${b.periodeJahr}-${b.periodeMonat}`),
  );
  const mietTeil = gruppe.find((b) => b.buchungsart.code === "MIETZAHLUNG" && b.periodeJahr && b.periodeMonat);
  const periode =
    mietMonate.size === 1 && mietTeil && vorlage.buchungsart.code === "MIETZAHLUNG"
      ? { periodeMonat: mietTeil.periodeMonat, periodeJahr: mietTeil.periodeJahr }
      : { periodeMonat: vorlage.periodeMonat, periodeJahr: vorlage.periodeJahr };

  const kostenIds = gruppe.filter((b) => b.buchungsart.code === "KOSTENPOSITION").map((b) => b.id);
  const forderungen = kostenIds.length
    ? await prisma.buchung.findMany({
        where: { bezugTyp: "Buchung", bezugId: { in: kostenIds }, ...AKTIVE_BUCHUNG_FILTER },
      })
    : [];

  await prisma.$transaction(async (tx) => {
    const zusammengefuehrt = await tx.buchung.create({
      data: {
        mietvertragId: vorlage.mietvertragId,
        buchungsartId: vorlage.buchungsartId,
        datum: vorlage.datum,
        betrag: Math.round(summe * 100) / 100,
        ...periode,
        verwendungszweck: vorlage.verwendungszweck?.replace(/^Storno: /, "") ?? null,
        rohdaten: vorlage.rohdaten ?? undefined,
        importBatchId: vorlage.importBatchId,
        erstelltVon,
      },
    });
    await uebernehmeBuchungKommentar(tx, vorlage.id, zusammengefuehrt.id);
    for (const teil of gruppe) {
      await storniereBuchung(tx, teil.id, erstelltVon);
    }
    for (const forderung of forderungen) {
      await storniereBuchung(tx, forderung.id, erstelltVon);
    }
  });

  return new Set([...gruppe.map((b) => b.mietvertragId), vorlage.mietvertragId].filter((id): id is string => !!id));
}

/** Buchungsarten, die neben genau einem Kautionsteil in einer Kautions-Aufteilung stehen dürfen. */
export const KAUTION_AUFTEILUNG_ANDERE_CODES = ["NEBENKOSTENAUSGLEICH", "SONDERZAHLUNG", "KOSTENPOSITION"];

/** Ob die Aufteilungsgruppe einen aktiven Kautionsteil enthält (Kautionsbuchung, aufgeteilt in Kaution +
 * BK-Ausgleich/Mahngebühr, siehe teileKautionsbuchungAuf). */
export async function istKautionAufteilung(aufteilungGruppeId: string): Promise<boolean> {
  const anzahl = await prisma.buchung.count({
    where: {
      aufteilungGruppeId,
      buchungsart: { kontokreis: "KAUTIONSKONTO", code: { not: "KAUTION_EINBEHALT" } },
      ...AKTIVE_BUCHUNG_FILTER,
    },
  });
  return anzahl > 0;
}

/**
 * Macht die Aufteilung einer Kautionsbuchung rückgängig: alle aktiven Teile (Kaution, Betriebskostenausgleich,
 * Gebühren-Zahlung, Mahngebühr als Kostenposition) werden storniert und zu einer einzigen Kautionsbuchung
 * (Betrag = Bankbetrag) zusammengeführt. Eine Kostenposition trägt das umgekehrte Vorzeichen des Bankbetrags
 * (Mahngebühr +5 € Eingang = Kostenposition −5 €) und geht deshalb mit −betrag in die Summe ein.
 *
 * Gibt den Mietvertrag der zusammengeführten Buchung zurück (für revalidatePath).
 */
export async function hebeKautionAufteilungAufKern(aufteilungGruppeId: string, erstelltVon: string | null) {
  const gruppe = await prisma.buchung.findMany({
    where: { aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER },
    include: { buchungsart: { select: { code: true, kontokreis: true } } },
  });
  const kautionsTeile = gruppe.filter((b) => b.buchungsart.kontokreis === "KAUTIONSKONTO");
  if (kautionsTeile.length !== 1)
    throw new AktionsFehler("Diese Aufteilung enthält nicht genau einen Kautionsteil und lässt sich hier nicht zusammenführen.");
  if (gruppe.some((b) => b.buchungsart.kontokreis !== "KAUTIONSKONTO" && !KAUTION_AUFTEILUNG_ANDERE_CODES.includes(b.buchungsart.code)))
    throw new AktionsFehler("Diese Aufteilung enthält andere Buchungsarten und lässt sich hier nicht zusammenführen.");

  const kostenIds = gruppe.filter((b) => b.buchungsart.code === "KOSTENPOSITION").map((b) => b.id);
  if (kostenIds.length > 0) {
    const [belege, mitbenutzt] = await Promise.all([
      prisma.dokument.count({ where: { buchungId: { in: kostenIds } } }),
      prisma.dokumentBuchung.count({ where: { buchungId: { in: kostenIds } } }),
    ]);
    if (belege + mitbenutzt > 0)
      throw new AktionsFehler("An der Kostenposition dieser Aufteilung hängt ein Beleg — erst den Beleg lösen, dann zusammenführen.");
  }
  // Eine dem Mieter berechnete Gebühren-Forderung an einem Kosten-Teil wird mit storniert (wie bei Zahlungen).
  const forderungen = kostenIds.length
    ? await prisma.buchung.findMany({ where: { bezugTyp: "Buchung", bezugId: { in: kostenIds }, ...AKTIVE_BUCHUNG_FILTER } })
    : [];

  const vorlage = kautionsTeile[0];
  const summe = gruppe.reduce(
    (s, b) => s + (b.buchungsart.code === "KOSTENPOSITION" ? -Number(b.betrag) : Number(b.betrag)),
    0,
  );

  await prisma.$transaction(async (tx) => {
    await tx.buchung.create({
      data: {
        mietvertragId: vorlage.mietvertragId,
        buchungsartId: vorlage.buchungsartId,
        datum: vorlage.datum,
        betrag: Math.round(summe * 100) / 100,
        empfaenger: vorlage.empfaenger,
        verwendungszweck: vorlage.verwendungszweck,
        bemerkung: vorlage.bemerkung,
        rohdaten: vorlage.rohdaten ?? undefined,
        importBatchId: vorlage.importBatchId,
        erstelltVon,
      },
    });
    for (const b of gruppe) await storniereBuchung(tx, b.id, erstelltVon);
    for (const f of forderungen) await storniereBuchung(tx, f.id, erstelltVon);
  });

  return vorlage.mietvertragId;
}
