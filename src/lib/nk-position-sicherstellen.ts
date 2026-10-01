import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { NK_AUSGLEICH_ODER_VERRECHNUNG, nkBegleichung } from "@/lib/nk-verrechnung";

const PLATZHALTER_KOMMENTAR =
  "Automatisch angelegt, weil eine Verrechnung/Zahlung ohne Position erfasst wurde — Kostenanteil/Vorauszahlung sind nur aus der Begleichung abgeleitet, bitte prüfen.";

/**
 * Stellt sicher, dass eine bestehende Nebenkostenabrechnung für das Jahr eine Position für den
 * Mietvertrag hat, sobald dafür eine Begleichung (Ausgleich, Verrechnung aufs Mieterkonto oder mit
 * der Kaution) gebucht wurde — sonst bliebe sie auf der Abrechnungsseite unsichtbar (z.B. bei
 * manuell angelegten Abrechnungen, in denen die Position vergessen wurde). Die Platzhalter-Position
 * übernimmt die Begleichung als Saldo (Kostenanteil bzw. Vorauszahlung = Betrag) und trägt einen
 * Prüfkommentar. Existiert die Abrechnung oder die Position schon, passiert nichts.
 */
export async function stelleNkPositionSicher(
  db: PrismaClient | Prisma.TransactionClient,
  mietvertragId: string,
  jahr: number | null,
): Promise<void> {
  if (!jahr) return;
  const abrechnung = await db.nebenkostenabrechnung.findUnique({ where: { jahr }, select: { id: true } });
  if (!abrechnung) return;
  const vorhanden = await db.nebenkostenabrechnungPosition.findFirst({
    where: { abrechnungId: abrechnung.id, mietvertragId },
    select: { id: true },
  });
  if (vorhanden) return;

  const mietvertrag = await db.mietvertrag.findUnique({
    where: { id: mietvertragId },
    select: { einheitId: true, beginn: true, ende: true },
  });
  if (!mietvertrag) return;

  const buchungen = await db.buchung.findMany({
    where: { ...NK_AUSGLEICH_ODER_VERRECHNUNG, jahr, mietvertragId, ...AKTIVE_BUCHUNG_FILTER },
    select: { betrag: true, buchungsart: { select: { code: true } } },
  });
  const saldo =
    Math.round(buchungen.reduce((s, b) => s + nkBegleichung(b.buchungsart.code, Number(b.betrag)), 0) * 100) / 100;

  const jahresanfang = new Date(Date.UTC(jahr, 0, 1));
  const jahresende = new Date(Date.UTC(jahr, 11, 31));
  const zeitraumVon = mietvertrag.beginn && mietvertrag.beginn > jahresanfang ? mietvertrag.beginn : jahresanfang;
  const zeitraumBis = mietvertrag.ende && mietvertrag.ende < jahresende ? mietvertrag.ende : jahresende;

  await db.nebenkostenabrechnungPosition.create({
    data: {
      abrechnungId: abrechnung.id,
      einheitId: mietvertrag.einheitId,
      mietvertragId,
      zeitraumVon,
      zeitraumBis,
      kostenanteilGesamt: Math.max(0, -saldo),
      vorauszahlungGesamt: Math.max(0, saldo),
      saldo,
    },
  });
  await db.nebenkostenabrechnungPruefung.upsert({
    where: { abrechnungId_mietvertragId: { abrechnungId: abrechnung.id, mietvertragId } },
    create: { abrechnungId: abrechnung.id, mietvertragId, kommentar: PLATZHALTER_KOMMENTAR },
    update: {},
  });
}
