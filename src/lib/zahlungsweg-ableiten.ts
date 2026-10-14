import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findColumn } from "@/lib/import/bank-csv";
import type { ZahlungswegArt } from "@/lib/zahlungsweg-anzeige";

/**
 * Zahlungsweg eines Mietvertrags aus den Bankzeilen (`Buchung.rohdaten`) der Mietzahlungen ableiten.
 *
 * Je Zahlung: Lastschrift = Buchungstext enthält LASTSCHRIFT (Einzug/Folge/Einmal; Rückbelastungen zählen nicht),
 * Behörde = Überweisung, deren Zahler das Jobcenter/die Bundesagentur oder der Kreis Ostholstein ist,
 * Überweisung = sonstige Überweisung/Dauerauftrag. Der Vertrag bekommt einen Zahlungsweg nur, wenn die jüngsten
 * Zahlungen (höchstens `FENSTER`, mindestens `MIN_ZAHLUNGEN`) alle dieselbe Art haben — gemischte Fälle bleiben offen
 * und werden von Hand entschieden (z.B. Einzug, Rücklastschrift, dann Dauerauftrag; Amt zahlt nur einen Teil).
 */
const FENSTER = 4;
const MIN_ZAHLUNGEN = 3;

export const AMT_BUNDESAGENTUR = /bundesagentur|jobcenter/i;
export const AMT_KREIS = /kreis\s*ostholstein/i;

function text(zeile: Record<string, unknown>, kandidaten: string[]): string {
  const spalte = findColumn(Object.keys(zeile), kandidaten);
  const v = spalte ? zeile[spalte] : undefined;
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}

/** Art einer einzelnen Bankzeile (Gutschrift einer Mietzahlung); null, wenn sie sich nicht eindeutig einordnen lässt. */
export function zahlungswegAusBankzeile(rohdaten: unknown): ZahlungswegArt | null {
  if (!rohdaten || typeof rohdaten !== "object" || Array.isArray(rohdaten)) return null;
  const zeile = rohdaten as Record<string, unknown>;
  const buchungstext = text(zeile, ["buchungstext"]).toUpperCase();
  if (!buchungstext || buchungstext.includes("RUECK") || buchungstext.includes("WIEDER")) return null;
  if (buchungstext.includes("LASTSCHRIFT")) return "LASTSCHRIFT";
  // Gutschrift per Überweisung, Dauerauftrag oder Echtzeit-Überweisung (Buchungstext „ECHTZEIT-GUTSCHRIFT“).
  if (!/UEBERWEISUNG|DAUERAUFTR|ECHTZEIT|GUTSCHR/.test(buchungstext)) return null;
  const zahler = text(zeile, ["beguenstigterzahlungspflichtiger"]);
  return AMT_BUNDESAGENTUR.test(zahler) || AMT_KREIS.test(zahler) ? "BEHOERDE" : "UEBERWEISUNG";
}

/** Zahlungsweg aus den Bankzeilen der jüngsten Zahlungen (neueste zuerst); null = nicht eindeutig. */
export function leiteZahlungswegAb(rohdatenNeuesteZuerst: unknown[]): ZahlungswegArt | null {
  const arten: ZahlungswegArt[] = [];
  for (const r of rohdatenNeuesteZuerst) {
    const art = zahlungswegAusBankzeile(r);
    if (art) arten.push(art);
    if (arten.length === FENSTER) break;
  }
  if (arten.length < MIN_ZAHLUNGEN) return null;
  return arten.every((a) => a === arten[0]) ? arten[0] : null;
}

/** Vorschlag für einen Vertrag aus dem Journal (null = nicht eindeutig oder zu wenige Zahlungen mit Bankzeile). */
export async function ermittleZahlungsweg(mietvertragId: string): Promise<ZahlungswegArt | null> {
  const zeilen = await prisma.buchung.findMany({
    where: {
      mietvertragId,
      ...AKTIVE_BUCHUNG_FILTER,
      buchungsart: { code: "MIETZAHLUNG" },
      betrag: { gt: 0 },
      rohdaten: { not: Prisma.DbNull },
    },
    orderBy: [{ datum: "desc" }, { erstelltAm: "desc" }],
    // Ein paar Reserven, weil Rückbelastungs-Wiedergutschriften und Sonstiges nicht zählen.
    take: FENSTER + 8,
    select: { rohdaten: true },
  });
  return leiteZahlungswegAb(zeilen.map((z) => z.rohdaten));
}

/**
 * Nach einem Import: bei den betroffenen Verträgen den Zahlungsweg eintragen, **nur wenn noch keiner erfasst ist**.
 * Eigene Einträge bleiben unangetastet (eine Abweichung zeigt das Formular „Mietvertrag bearbeiten“ als Vorschlag).
 * Fehler dürfen den Import nicht stören.
 */
export async function ergaenzeLeereZahlungswege(mietvertragIds: string[]): Promise<number> {
  try {
    const leer = await prisma.mietvertrag.findMany({
      where: { id: { in: [...new Set(mietvertragIds)] }, zahlungsweg: null },
      select: { id: true },
    });
    let gesetzt = 0;
    for (const v of leer) {
      const art = await ermittleZahlungsweg(v.id);
      if (!art) continue;
      const r = await prisma.mietvertrag.updateMany({ where: { id: v.id, zahlungsweg: null }, data: { zahlungsweg: art } });
      gesetzt += r.count;
    }
    return gesetzt;
  } catch (e) {
    console.error("Zahlungsweg konnte nicht ergänzt werden", e);
    return 0;
  }
}
