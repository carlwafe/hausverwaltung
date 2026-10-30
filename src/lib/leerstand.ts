import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { mieterName } from "@/lib/mieter-name";

/** Einheiten, die nie als Leerstand zählen (Eigennutzung). Name = `Einheit.bezeichnung`. */
export const LEERSTAND_AUSGENOMMEN = ["Garage 10"];

/** Kostenart, unter der die Stromkosten leerstehender Wohnungen gebucht werden. */
export const LEERSTAND_STROM_KOSTENART = "Leerstandkosten Strom";

/** Die Seite reicht bis hierhin in die Vergangenheit (Leerstandszeiträume und Buchungen). */
export const LEERSTAND_AB = new Date("2025-01-01T00:00:00.000Z");

const TAG = 24 * 60 * 60 * 1000;
// Abschlags- und Schlussrechnungen werden teils vor dem Leerstand angelegt bzw. Wochen danach
// gutgeschrieben; so weit weg vom Zeitraum darf eine nur dem Gebäude zugeordnete Buchung liegen.
const TOLERANZ_VOR = 92 * TAG;
const TOLERANZ_NACH = 120 * TAG;

export type LeerstandAbbuchung = {
  id: string;
  datum: string;
  betrag: number; // Ausgabe positiv, Gutschrift negativ (Vorzeichen der Kostenposition)
  verwendungszweck: string;
  kundennummer: string | null;
  // Die Buchung hängt nur am Gebäude, nicht an der Wohnung; sie wurde dem einzigen passenden
  // Leerstandszeitraum des Gebäudes zugerechnet.
  nurGebaeude: boolean;
  // Die Buchung liegt vor dem Beginn des Leerstandszeitraums laut Mietvertrag (Wohnung war dann
  // noch vermietet) — Hinweis auf Widerspruch zwischen Buchungstext und Vertragsdaten.
  vorBeginn: boolean;
};

export type LeerstandPeriode = {
  key: string;
  einheitId: string;
  gebaeude: string;
  bezeichnung: string;
  von: string | null; // null = vor Beginn der erfassten Verträge
  bis: string | null; // null = offen
  status: "aktuell" | "frueher" | "kuenftig";
  vormieter: string | null;
  nachmieterAb: string | null;
  kundennummern: string[];
  abbuchungen: LeerstandAbbuchung[];
  summe: number;
};

export type NichtZugeordnet = {
  id: string;
  datum: string;
  betrag: number;
  verwendungszweck: string;
  ort: string | null; // Gebäude bzw. Wohnung, falls die Buchung eines hat
  kundennummer: string | null;
  grund: string;
  // true = Importzeile ohne Buchung („nicht kategorisiert“), false = bereits gebuchte Kostenposition.
  nichtKategorisiert: boolean;
};

export type LeerstandDaten = { perioden: LeerstandPeriode[]; nichtZugeordnet: NichtZugeordnet[] };

// Die Kundennummer steht nur im Verwendungszweck der Stadtwerke-Buchung, in wechselnder
// Schreibweise ("KD 232939", "KD NR. 231300", "Kd.Nr.230736", "KN 240036", "Kunden Nr. 242009",
// "Kunden N. 245807", "Kundennummer 244268", "Vertragskonto 243144"). Die Rechnungsnummer
// ("RN …", "Re.Nr. …", "Rechnung …") bleibt bewusst außen vor.
const KUNDENNUMMER = /\b(?:K[DN]|Kd|Kunden\s*(?:Nr|N|nummer)|Vertragskonto)\.?\s*(?:Nr\.?)?\s*:?\s*(\d{5,9})\b/i;

export function kundennummerAus(verwendungszweck: string | null): string | null {
  return verwendungszweck?.match(KUNDENNUMMER)?.[1] ?? null;
}

type Vertrag = { beginn: Date | null; ende: Date | null; status: string; mieter: { vorname: string; nachname: string }[] };
type Luecke = { von: Date | null; bis: Date | null; vormieter: string | null; nachmieterAb: Date | null };

const namen = (v: Vertrag) => v.mieter.map((m) => mieterName(m)).join(" & ") || null;

/**
 * Zeiten ohne Mietvertrag: Lücken zwischen zwei Verträgen und die offene Zeit nach dem letzten
 * beendeten Vertrag. Nur Lücken von mindestens einem Tag zählen (Ende 30.06., nächster Beginn
 * 01.07. ist kein Leerstand). Ein Vertrag ohne Ende, der nicht BEENDET ist, läuft unbegrenzt.
 */
export function leerstandsLuecken(vertraege: Vertrag[]): Luecke[] {
  const sortiert = vertraege
    .map((v) => ({ ...v, ende: v.ende ?? (v.status === "BEENDET" ? v.beginn : null) }))
    .sort((a, b) => (a.beginn?.getTime() ?? -Infinity) - (b.beginn?.getTime() ?? -Infinity));
  if (sortiert.length === 0) return [{ von: null, bis: null, vormieter: null, nachmieterAb: null }];

  const luecken: Luecke[] = [];
  let vorn: (typeof sortiert)[number] | null = null;
  for (const v of sortiert) {
    if (vorn && v.beginn && v.beginn.getTime() > vorn.ende!.getTime() + TAG) {
      luecken.push({
        von: new Date(vorn.ende!.getTime() + TAG),
        bis: new Date(v.beginn.getTime() - TAG),
        vormieter: namen(vorn),
        nachmieterAb: v.beginn,
      });
    }
    if (!v.ende) return luecken; // läuft unbegrenzt: danach kein Leerstand mehr
    if (!vorn || v.ende > vorn.ende!) vorn = v;
  }
  luecken.push({ von: new Date(vorn!.ende!.getTime() + TAG), bis: null, vormieter: namen(vorn!), nachmieterAb: null });
  return luecken;
}

type Zeile = {
  id: string;
  einheitId: string | null;
  gebaeudeId: string | null;
  datum: Date;
  betrag: number;
  verwendungszweck: string;
  ort: string | null;
};

/**
 * Leerstandszeiträume aller Einheiten seit Anfang 2025 mit den Strombuchungen der Kostenart
 * „Leerstandkosten Strom“ und den daraus gelesenen Kundennummern; dazu Buchungen, die sich keinem
 * Zeitraum zuordnen ließen, und noch nicht kategorisierte Importzeilen mit Strom-/Stadtwerke-Bezug.
 */
export async function ladeLeerstand(heute = new Date()): Promise<LeerstandDaten> {
  const einheiten = await prisma.einheit.findMany({
    where: { bezeichnung: { notIn: LEERSTAND_AUSGENOMMEN } },
    include: {
      gebaeude: { include: { haus: { include: { gebaeude: true } } } },
      mietvertraege: { include: { mieter: true } },
    },
  });

  const perioden: LeerstandPeriode[] = [];
  for (const e of sortEinheitenNachGebaeude(einheiten)) {
    const luecken = leerstandsLuecken(e.mietvertraege).filter((l) => !l.bis || l.bis >= LEERSTAND_AB);
    for (const l of luecken.reverse()) {
      const beginnt = !l.von || l.von <= heute;
      const vorbei = l.bis && l.bis < heute;
      perioden.push({
        key: `${e.id}-${l.von?.toISOString() ?? "anfang"}`,
        einheitId: e.id,
        gebaeude: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer}`,
        bezeichnung: e.bezeichnung,
        von: l.von?.toISOString() ?? null,
        bis: l.bis?.toISOString() ?? null,
        status: vorbei ? "frueher" : beginnt ? "aktuell" : "kuenftig",
        vormieter: l.vormieter,
        nachmieterAb: l.nachmieterAb?.toISOString() ?? null,
        kundennummern: [],
        abbuchungen: [],
        summe: 0,
      });
    }
  }

  const gebaeudeVon = new Map(einheiten.map((e) => [e.id, e.gebaeudeId]));
  const raw = await prisma.buchung.findMany({
    where: { ...AKTIVE_BUCHUNG_FILTER, kostenart: { name: LEERSTAND_STROM_KOSTENART }, datum: { gte: LEERSTAND_AB } },
    orderBy: { datum: "asc" },
    select: {
      id: true,
      einheitId: true,
      gebaeudeId: true,
      datum: true,
      betrag: true,
      verwendungszweck: true,
      einheit: { select: { bezeichnung: true, gebaeude: { select: { strasse: true, hausnummer: true } } } },
      gebaeude: { select: { strasse: true, hausnummer: true } },
    },
  });
  const zeilen: Zeile[] = raw.map((b) => ({
    id: b.id,
    einheitId: b.einheitId,
    gebaeudeId: b.gebaeudeId ?? (b.einheitId ? (gebaeudeVon.get(b.einheitId) ?? null) : null),
    datum: b.datum!,
    betrag: Number(b.betrag),
    verwendungszweck: b.verwendungszweck ?? "",
    ort: b.einheit
      ? `${b.einheit.gebaeude.strasse} ${b.einheit.gebaeude.hausnummer} · ${b.einheit.bezeichnung}`
      : b.gebaeude
        ? `${b.gebaeude.strasse} ${b.gebaeude.hausnummer} (nur Gebäude)`
        : null,
  }));

  const nichtZugeordnet: NichtZugeordnet[] = [];
  const zuordnen = (z: Zeile, p: LeerstandPeriode, nurGebaeude: boolean) => {
    p.abbuchungen.push({
      id: z.id,
      datum: z.datum.toISOString(),
      betrag: z.betrag,
      verwendungszweck: z.verwendungszweck,
      kundennummer: kundennummerAus(z.verwendungszweck),
      nurGebaeude,
      vorBeginn: !!p.von && z.datum < new Date(p.von),
    });
  };

  // Zeitraum einer Buchung der Wohnung: der zuletzt begonnene, sonst der nächste (Abschläge werden
  // teils schon vor dem formalen Mietende gebucht).
  const periodeFuer = (einheitId: string, datum: Date): LeerstandPeriode | null => {
    const ps = perioden.filter((p) => p.einheitId === einheitId).sort((a, b) => (a.von ?? "").localeCompare(b.von ?? ""));
    const davor = ps.filter((p) => !p.von || new Date(p.von) <= datum).pop();
    return davor ?? ps[0] ?? null;
  };

  // 1. Buchungen mit Wohnung. Alle Buchungen einer Kundennummer gehören zu einem Zeitraum: dem der
  //    frühesten Buchung dieser Nummer (z.B. die Gutschrift der Schlussrechnung Wochen später).
  const jeKundennummer = new Map<string, LeerstandPeriode>();
  const mitWohnung = zeilen.filter((z) => z.einheitId);
  for (const z of mitWohnung) {
    const kn = kundennummerAus(z.verwendungszweck);
    const schluessel = kn ? `${z.einheitId}|${kn}` : null;
    const p = (schluessel && jeKundennummer.get(schluessel)) || periodeFuer(z.einheitId!, z.datum);
    if (!p) {
      nichtZugeordnet.push({ ...rest(z), kundennummer: kn, grund: "Die Wohnung hatte seit 2025 keinen Leerstand laut Mietverträgen", nichtKategorisiert: false });
      continue;
    }
    if (schluessel) jeKundennummer.set(schluessel, p);
    zuordnen(z, p, false);
  }

  // 2. Buchungen nur mit Gebäude: gleiche Kundennummer wie eine Wohnung des Gebäudes, sonst der
  //    einzige Leerstandszeitraum des Gebäudes, in dessen Zeitfenster die Buchung liegt.
  for (const z of zeilen.filter((x) => !x.einheitId)) {
    const kn = kundennummerAus(z.verwendungszweck);
    const ausGebaeude = perioden.filter((p) => gebaeudeVon.get(p.einheitId) === z.gebaeudeId);
    const perKn = kn ? ausGebaeude.find((p) => p.abbuchungen.some((a) => a.kundennummer === kn)) : undefined;
    const kandidaten = ausGebaeude.filter(
      (p) =>
        (!p.von || new Date(p.von).getTime() - TOLERANZ_VOR <= z.datum.getTime()) &&
        (!p.bis || z.datum.getTime() <= new Date(p.bis).getTime() + TOLERANZ_NACH),
    );
    const p = perKn ?? (kandidaten.length === 1 ? kandidaten[0] : null);
    if (!p) {
      nichtZugeordnet.push({
        ...rest(z),
        kundennummer: kn,
        grund: z.gebaeudeId
          ? kandidaten.length === 0
            ? "Im Gebäude steht zu diesem Datum keine Wohnung leer"
            : "Mehrere leere Wohnungen im Gebäude kommen in Frage"
          : "Weder Wohnung noch Gebäude angegeben",
        nichtKategorisiert: false,
      });
      continue;
    }
    zuordnen(z, p, true);
  }

  for (const p of perioden) {
    p.abbuchungen.sort((a, b) => b.datum.localeCompare(a.datum));
    p.kundennummern = [...new Set(p.abbuchungen.map((a) => a.kundennummer).filter((k): k is string => !!k))];
    p.summe = p.abbuchungen.reduce((s, a) => s + a.betrag, 0);
  }

  // Importzeilen, die noch keiner Buchungsart zugeordnet sind, aber nach Strom/Leerstand aussehen.
  const importiert = await prisma.nichtZugeordneteBuchung.findMany({
    where: {
      datum: { gte: LEERSTAND_AB },
      OR: ["strom", "leerstand", "stadtwerke"].flatMap((w) => [
        { verwendungszweck: { contains: w, mode: "insensitive" as const } },
        { empfaenger: { contains: w, mode: "insensitive" as const } },
      ]),
    },
    orderBy: { datum: "desc" },
  });
  for (const i of importiert) {
    nichtZugeordnet.push({
      id: i.id,
      datum: i.datum.toISOString(),
      betrag: -Number(i.betrag), // wie Kostenposition: Ausgabe positiv
      verwendungszweck: [i.empfaenger, i.verwendungszweck].filter(Boolean).join(" · "),
      ort: null,
      kundennummer: kundennummerAus(i.verwendungszweck),
      grund: "Noch nicht kategorisiert (Kontoauszug-Import)",
      nichtKategorisiert: true,
    });
  }
  nichtZugeordnet.sort((a, b) => b.datum.localeCompare(a.datum));

  return { perioden, nichtZugeordnet };
}

function rest(z: Zeile) {
  return { id: z.id, datum: z.datum.toISOString(), betrag: z.betrag, verwendungszweck: z.verwendungszweck, ort: z.ort };
}
