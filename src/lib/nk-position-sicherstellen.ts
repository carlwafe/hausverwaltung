import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { NK_AUSGLEICH_ODER_VERRECHNUNG } from "@/lib/nk-verrechnung";

export const PLATZHALTER_KOMMENTAR_PRAEFIX = "Automatisch angelegt";
const PLATZHALTER_KOMMENTAR = `${PLATZHALTER_KOMMENTAR_PRAEFIX}, weil eine Verrechnung/Zahlung ohne Position erfasst wurde — ohne Beträge, bitte Kostenanteil/Vorauszahlung von Hand eintragen oder die Zuordnung prüfen.`;

/**
 * Stellt sicher, dass eine bestehende Nebenkostenabrechnung für das Jahr eine Position für den
 * Mietvertrag hat, sobald dafür eine Begleichung (Ausgleich, Verrechnung aufs Mieterkonto oder mit
 * der Kaution) gebucht wurde — sonst bliebe sie auf der Abrechnungsseite unsichtbar (z.B. bei
 * manuell angelegten Abrechnungen, in denen die Position vergessen wurde). Die Platzhalter-Position
 * trägt keine Beträge (alles 0), nur einen Prüfkommentar — die Begleichung erscheint dann auf der
 * Abrechnungsseite als offen. Existiert die Abrechnung oder die Position schon, passiert nichts.
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
      // Bewusst keine Beträge: ein Platzhalter markiert nur "hier wurde gezahlt/verrechnet, aber die
      // Abrechnung hat keine Position" — Kostenanteil/Vorauszahlung trägt der Nutzer von Hand ein.
      kostenanteilGesamt: 0,
      vorauszahlungGesamt: 0,
      saldo: 0,
    },
  });
  await db.nebenkostenabrechnungPruefung.upsert({
    where: { abrechnungId_mietvertragId: { abrechnungId: abrechnung.id, mietvertragId } },
    create: { abrechnungId: abrechnung.id, mietvertragId, kommentar: PLATZHALTER_KOMMENTAR },
    update: {},
  });
}

/**
 * Wie stelleNkPositionSicher für alle Mietverträge mit einer Begleichung im Jahr — nötig nach dem
 * (Neu-)Berechnen einer Abrechnung, weil dabei alle Positionen (auch Platzhalter) ersetzt werden.
 */
export async function stelleNkPositionenFuerJahrSicher(db: PrismaClient | Prisma.TransactionClient, jahr: number) {
  const abrechnung = await db.nebenkostenabrechnung.findUnique({ where: { jahr }, select: { id: true } });
  if (!abrechnung) return;
  const [buchungen, positionen] = await Promise.all([
    db.buchung.findMany({
      where: { ...NK_AUSGLEICH_ODER_VERRECHNUNG, jahr, mietvertragId: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { mietvertragId: true },
      distinct: ["mietvertragId"],
    }),
    db.nebenkostenabrechnungPosition.findMany({ where: { abrechnungId: abrechnung.id }, select: { mietvertragId: true } }),
  ]);
  const vorhanden = new Set(positionen.map((p) => p.mietvertragId));
  for (const b of buchungen) {
    if (b.mietvertragId && !vorhanden.has(b.mietvertragId)) await stelleNkPositionSicher(db, b.mietvertragId, jahr);
  }
}

/**
 * Eine Abrechnung gilt als manuell geführt, wenn sie keine berechnete Position (mit `details`)
 * enthält — also leer angelegt (erstelleLeereAbrechnung) und nur von Hand befüllt ist. "Neu
 * berechnen" ist dort gesperrt, weil die Berechnung auf unvollständigen Kostendaten beruht.
 */
export function istManuelleAbrechnung(positionen: { details: unknown }[]): boolean {
  return positionen.every((p) => p.details === null || p.details === undefined);
}
