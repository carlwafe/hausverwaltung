import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { mieterName } from "@/lib/mieter-name";

/** Einheiten, die nie als Leerstand zählen (Eigennutzung). Name = `Einheit.bezeichnung`. */
export const LEERSTAND_AUSGENOMMEN = ["Garage 10"];

/** Kostenart, unter der die Stromkosten leerstehender Wohnungen gebucht werden. */
export const LEERSTAND_STROM_KOSTENART = "Leerstandkosten Strom";

export type LeerstandAbbuchung = {
  id: string;
  datum: string;
  betrag: number; // Ausgabe positiv, Gutschrift negativ (Vorzeichen der Kostenposition)
  verwendungszweck: string;
  kundennummer: string | null;
  // Die Buchung hängt nur am Gebäude, nicht an der Wohnung; sie wird der einzigen leeren Einheit
  // des Gebäudes zugerechnet.
  nurGebaeude: boolean;
};

export type LeerstandEinheit = {
  id: string;
  gebaeude: string;
  bezeichnung: string;
  leerSeit: string | null;
  letzteMieter: string | null;
  geplantAb: string | null;
  kundennummern: string[];
  abbuchungen: LeerstandAbbuchung[];
  summe: number;
};

// Die Kundennummer steht nur im Verwendungszweck der Stadtwerke-Buchung, in wechselnder
// Schreibweise ("KD 232939", "KN 240036", "Kunden Nr. 242009", "Kunden N. 245807",
// "Kundennummer 244268", "Vertragskonto 243144"). Die Rechnungsnummer ("RN …", "Rechnung …")
// bleibt bewusst außen vor.
const KUNDENNUMMER = /\b(?:KD|KN|Kunden\s*(?:Nr|N|nummer)\.?|Vertragskonto)\s*:?\s*(\d{5,9})\b/i;

export function kundennummerAus(verwendungszweck: string | null): string | null {
  return verwendungszweck?.match(KUNDENNUMMER)?.[1] ?? null;
}

function tagNach(datum: Date): Date {
  const d = new Date(datum);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

/**
 * Wohnungen (und Garagen) ohne laufenden Mietvertrag zum Stichtag, samt den Strombuchungen der
 * Kostenart „Leerstandkosten Strom“ ab Leerstandsbeginn und den daraus gelesenen Kundennummern.
 */
export async function ladeLeerstand(heute = new Date()): Promise<LeerstandEinheit[]> {
  const einheiten = await prisma.einheit.findMany({
    where: { bezeichnung: { notIn: LEERSTAND_AUSGENOMMEN } },
    include: {
      gebaeude: { include: { haus: { include: { gebaeude: true } } } },
      mietvertraege: { include: { mieter: true }, orderBy: { beginn: "asc" } },
    },
  });

  const leer = einheiten.filter(
    (e) =>
      !e.mietvertraege.some(
        (v) => v.status === "AKTIV" && (!v.beginn || v.beginn <= heute) && (!v.ende || v.ende >= heute),
      ),
  );

  const buchungen = await prisma.buchung.findMany({
    where: {
      ...AKTIVE_BUCHUNG_FILTER,
      kostenart: { name: LEERSTAND_STROM_KOSTENART },
      OR: [
        { einheitId: { in: leer.map((e) => e.id) } },
        { einheitId: null, gebaeudeId: { in: leer.map((e) => e.gebaeudeId) } },
      ],
    },
    orderBy: { datum: "desc" },
    select: { id: true, einheitId: true, gebaeudeId: true, datum: true, betrag: true, verwendungszweck: true },
  });

  return sortEinheitenNachGebaeude(leer).map((e) => {
    const beendete = e.mietvertraege.filter((v) => v.status === "BEENDET" && v.ende);
    const letzter = beendete.sort((a, b) => b.ende!.getTime() - a.ende!.getTime())[0];
    const leerSeit = letzter ? tagNach(letzter.ende!) : null;
    const geplant = e.mietvertraege.find((v) => v.status === "GEPLANT" && v.beginn && v.beginn > heute);

    // Bewusst alle Buchungen dieser Kostenart der Einheit, auch vor dem Leerstandsbeginn: Die
    // Abschläge laufen teils schon vor dem formalen Mietende bzw. werden nachgebucht.
    const einzigeLeereImGebaeude = leer.filter((x) => x.gebaeudeId === e.gebaeudeId).length === 1;
    const abbuchungen: LeerstandAbbuchung[] = buchungen
      .filter((b) => b.einheitId === e.id || (!b.einheitId && b.gebaeudeId === e.gebaeudeId && einzigeLeereImGebaeude))
      .map((b) => ({
        id: b.id,
        datum: (b.datum ?? new Date(0)).toISOString(),
        betrag: Number(b.betrag),
        verwendungszweck: b.verwendungszweck ?? "",
        kundennummer: kundennummerAus(b.verwendungszweck),
        nurGebaeude: !b.einheitId,
      }));

    return {
      id: e.id,
      gebaeude: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer}`,
      bezeichnung: e.bezeichnung,
      leerSeit: leerSeit ? leerSeit.toISOString() : null,
      letzteMieter: letzter ? letzter.mieter.map((m) => mieterName(m)).join(" & ") || null : null,
      geplantAb: geplant?.beginn ? geplant.beginn.toISOString() : null,
      kundennummern: [...new Set(abbuchungen.map((a) => a.kundennummer).filter((k): k is string => !!k))],
      abbuchungen,
      summe: abbuchungen.reduce((s, a) => s + a.betrag, 0),
    };
  });
}
