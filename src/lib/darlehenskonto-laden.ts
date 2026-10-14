import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { DARLEHEN_BEZUG, DARLEHEN_BUCHUNGSART } from "@/lib/darlehen";
import type { IstRate } from "@/lib/darlehenskonto";

/** Gebuchte Darlehensraten je Darlehen (Ist), mit Zins- und Tilgungsanteil und dem zugeordneten Monat. */
export async function ladeDarlehenIst(): Promise<Map<string, IstRate[]>> {
  const zuordnungen = await prisma.darlehenZuordnung.findMany({
    where: { buchung: { ...AKTIVE_BUCHUNG_FILTER } },
    select: {
      buchungId: true,
      darlehenId: true,
      periodeJahr: true,
      periodeMonat: true,
      sonder: true,
      buchung: { select: { datum: true, betrag: true, verwendungszweck: true, empfaenger: true, buchungsart: { select: { code: true } } } },
    },
  });
  const tilgungIds = zuordnungen.filter((z) => z.buchung.buchungsart.code === DARLEHEN_BUCHUNGSART).map((z) => z.buchungId);
  const zinsen = tilgungIds.length
    ? await prisma.buchung.findMany({
        where: { bezugTyp: DARLEHEN_BEZUG, bezugId: { in: tilgungIds }, ...AKTIVE_BUCHUNG_FILTER },
        select: { id: true, bezugId: true, betrag: true },
      })
    : [];
  const zinsZuTilgung = new Map(zinsen.map((z) => [z.bezugId, z]));

  const result = new Map<string, IstRate[]>();
  for (const z of zuordnungen) {
    const datum = z.buchung.datum;
    if (!datum) continue;
    const istTilgung = z.buchung.buchungsart.code === DARLEHEN_BUCHUNGSART;
    const zinsBuchung = istTilgung ? zinsZuTilgung.get(z.buchungId) : null;
    const zins = istTilgung ? (zinsBuchung ? Number(zinsBuchung.betrag) : 0) : Number(z.buchung.betrag);
    const tilgung = istTilgung ? -Number(z.buchung.betrag) : 0;
    const eintrag: IstRate = {
      ankerId: z.buchungId,
      zinsId: istTilgung ? (zinsBuchung?.id ?? null) : z.buchungId,
      datum,
      periodeJahr: z.periodeJahr ?? datum.getUTCFullYear(),
      periodeMonat: z.periodeMonat ?? datum.getUTCMonth() + 1,
      zins,
      tilgung,
      sonder: z.sonder,
      text: z.buchung.verwendungszweck || z.buchung.empfaenger || "Darlehensrate",
    };
    const liste = result.get(z.darlehenId) ?? [];
    liste.push(eintrag);
    result.set(z.darlehenId, liste);
  }
  return result;
}
