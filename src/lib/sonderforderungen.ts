// Sonderforderungen an Mieter (z.B. Rücklastschrift- oder Mahngebühren) — bewusst getrennt vom
// Miet-Soll/-Ist: MAHNGEBUEHR ist die Forderung (positiver Betrag = der Mieter schuldet uns das,
// kein Geldfluss), SONDERZAHLUNG der Zahlungseingang dazu (Bankvorzeichen). Der offene Betrag
// ist die Differenz, das Mieterkonto (Soll ./. Mietzahlungen) bleibt dadurch unberührt.
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";

// Mit der Kaution verrechnete Forderung aus dem Mieterkonto (Mietrückstand, Gebühren): eine
// KAUTION_EINBEHALT-Buchung (negativ, nicht zahlungswirksam) mit diesem bezugTyp zählt im Mietsaldo
// wie eine Zahlung des Mieters in derselben Höhe — analog zur Verrechnung mit der NK-Abrechnung.
export const MIETERKONTO_VERRECHNUNG_BEZUG = "KautionEinbehaltMieterkonto";

// where-Teil: alle Sonderbuchungen, die den Mietsaldo neben Soll/Mietzahlungen verändern.
export const SONDERBUCHUNGEN_FILTER: Prisma.BuchungWhereInput = {
  OR: [
    { buchungsart: { code: { in: ["MAHNGEBUEHR", "SONDERZAHLUNG"] } } },
    { buchungsart: { code: "KAUTION_EINBEHALT" }, bezugTyp: MIETERKONTO_VERRECHNUNG_BEZUG },
  ],
};

// Wirkung einer Sonderbuchung auf den Mietsaldo (positiv = zugunsten des Mieters): eine Gebühr
// (Forderung) mindert ihn, eine Zahlung darauf oder eine Verrechnung mit der Kaution erhöht ihn.
export function sonderWirkung(code: string, betrag: number): number {
  if (code === "MAHNGEBUEHR") return -betrag;
  if (code === "KAUTION_EINBEHALT") return -betrag; // negativ gebucht → Zahlung in Höhe des Betrags
  return betrag;
}

export type SonderforderungSaldo = { forderung: number; bezahlt: number; offen: number };

// Zeitraum wie bei Soll/Ist (buchhaltungAb/-Bis), damit die offene Sonderforderung im Mietsaldo
// denselben Zeitraum abdeckt wie die Mietzahlungen.
export async function ladeSonderforderungSalden(
  mietvertragIds?: string[],
  zeitraum: { ab?: Date | null; bis?: Date | null } = {},
): Promise<Map<string, SonderforderungSaldo>> {
  const buchungen = await prisma.buchung.findMany({
    where: {
      ...SONDERBUCHUNGEN_FILTER,
      mietvertragId: mietvertragIds ? { in: mietvertragIds } : { not: null },
      ...(zeitraum.ab || zeitraum.bis
        ? { datum: { ...(zeitraum.ab ? { gte: zeitraum.ab } : {}), ...(zeitraum.bis ? { lte: zeitraum.bis } : {}) } }
        : {}),
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { mietvertragId: true, betrag: true, buchungsart: { select: { code: true } } },
  });

  const salden = new Map<string, SonderforderungSaldo>();
  for (const b of buchungen) {
    const id = b.mietvertragId!;
    const s = salden.get(id) ?? { forderung: 0, bezahlt: 0, offen: 0 };
    if (b.buchungsart.code === "MAHNGEBUEHR") s.forderung += Number(b.betrag);
    else s.bezahlt += sonderWirkung(b.buchungsart.code, Number(b.betrag));
    s.offen = Math.round((s.forderung - s.bezahlt) * 100) / 100;
    salden.set(id, s);
  }
  return salden;
}
