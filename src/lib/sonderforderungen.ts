// Sonderforderungen an Mieter (z.B. Rücklastschrift- oder Mahngebühren) — bewusst getrennt vom
// Miet-Soll/-Ist: MAHNGEBUEHR ist die Forderung (positiver Betrag = der Mieter schuldet uns das,
// kein Geldfluss), SONDERZAHLUNG der Zahlungseingang dazu (Bankvorzeichen). Der offene Betrag
// ist die Differenz, das Mieterkonto (Soll ./. Mietzahlungen) bleibt dadurch unberührt.
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

export type SonderforderungSaldo = { forderung: number; bezahlt: number; offen: number };

export async function ladeSonderforderungSalden(mietvertragIds?: string[]): Promise<Map<string, SonderforderungSaldo>> {
  const buchungen = await prisma.buchung.findMany({
    where: {
      buchungsart: { code: { in: ["MAHNGEBUEHR", "SONDERZAHLUNG"] } },
      mietvertragId: mietvertragIds ? { in: mietvertragIds } : { not: null },
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { mietvertragId: true, betrag: true, buchungsart: { select: { code: true } } },
  });

  const salden = new Map<string, SonderforderungSaldo>();
  for (const b of buchungen) {
    const id = b.mietvertragId!;
    const s = salden.get(id) ?? { forderung: 0, bezahlt: 0, offen: 0 };
    if (b.buchungsart.code === "MAHNGEBUEHR") s.forderung += Number(b.betrag);
    else s.bezahlt += Number(b.betrag);
    s.offen = Math.round((s.forderung - s.bezahlt) * 100) / 100;
    salden.set(id, s);
  }
  return salden;
}
