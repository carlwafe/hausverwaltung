import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findColumn } from "@/lib/import/bank-csv";

/**
 * SEPA-Mandatsdaten einer laufenden Lastschrift für die Vorabankündigung in Anpassungsschreiben.
 * Mandatsreferenz und Gläubiger-ID stehen nicht in den Stammdaten, sondern in der Bankzeile
 * (`Buchung.rohdaten`) der Lastschrift-Gutschriften.
 */
export type LastschriftMandat = { referenz: string | null; glaeubigerId: string | null };

// Überweisungen tragen kein Mandat; manche Banken füllen die Spalte dann mit einem Platzhalter.
const KEIN_WERT = /^(notprovided|-+)$/i;

function spaltenwert(zeile: Record<string, unknown>, spalte: string | undefined): string | null {
  if (!spalte) return null;
  const v = zeile[spalte];
  const text = typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
  return text && !KEIN_WERT.test(text) ? text : null;
}

/** Mandatsdaten aus einer Bankzeile; null, wenn die Zeile keine Mandatsreferenz hat (z.B. ein Dauerauftrag). */
export function mandatAusRohdaten(rohdaten: unknown): LastschriftMandat | null {
  if (!rohdaten || typeof rohdaten !== "object" || Array.isArray(rohdaten)) return null;
  const zeile = rohdaten as Record<string, unknown>;
  const spalten = Object.keys(zeile);
  const referenz = spaltenwert(zeile, findColumn(spalten, ["mandatsreferenz"]));
  if (!referenz) return null;
  return { referenz, glaeubigerId: spaltenwert(zeile, findColumn(spalten, ["glaeubigerid"])) };
}

/** Alle Mandatsangaben einer Lastschrift-Gutschrift (Einzug), wie sie am Mietvertrag gespeichert werden. */
export type MandatAusBankzeile = {
  referenz: string;
  glaeubigerId: string | null;
  iban: string | null;
  kontoinhaber: string | null;
};

/**
 * Mandatsangaben aus der Bankzeile eines Lastschrift-Einzugs (Buchungstext enthält LASTSCHRIFT, ohne Rückbelastung/
 * Wiedergutschrift): Referenz, Gläubiger-ID, Zahler-IBAN („Kontonummer/IBAN“) und Zahlername. Bei Rückbelastungen
 * steht in der IBAN-Spalte das eigene Konto — deshalb nur echte Einzüge. null, wenn die Zeile kein Einzug mit Mandat ist.
 */
export function mandatDetailsAusEinzug(rohdaten: unknown): MandatAusBankzeile | null {
  const mandat = mandatAusRohdaten(rohdaten);
  if (!mandat?.referenz) return null;
  const zeile = rohdaten as Record<string, unknown>;
  const spalten = Object.keys(zeile);
  const text = (spaltenwert(zeile, findColumn(spalten, ["buchungstext"])) ?? "").toUpperCase();
  if (!text.includes("LASTSCHRIFT") || text.includes("RUECK") || text.includes("WIEDER")) return null;
  const iban = (spaltenwert(zeile, findColumn(spalten, ["kontonummeriban", "iban"])) ?? "").replace(/\s+/g, "").toUpperCase();
  return {
    referenz: mandat.referenz,
    glaeubigerId: mandat.glaeubigerId,
    iban: iban || null,
    kontoinhaber: spaltenwert(zeile, findColumn(spalten, ["beguenstigterzahlungspflichtiger"])),
  };
}

/**
 * Mandatsdaten des Vertrags für die Vorabankündigung: die am Vertrag erfassten Angaben (Seite „Mietvertrag“), sonst die
 * der jüngsten Lastschrift-Mietzahlung im Journal (null = keine gefunden).
 */
export async function ladeLastschriftMandat(mietvertragId: string): Promise<LastschriftMandat | null> {
  const gespeichert = await prisma.mietvertrag.findUnique({
    where: { id: mietvertragId },
    select: { mandatReferenz: true, mandatGlaeubigerId: true },
  });
  if (gespeichert?.mandatReferenz) {
    return { referenz: gespeichert.mandatReferenz, glaeubigerId: gespeichert.mandatGlaeubigerId };
  }
  const zeilen = await prisma.buchung.findMany({
    where: {
      mietvertragId,
      ...AKTIVE_BUCHUNG_FILTER,
      buchungsart: { code: "MIETZAHLUNG" },
      rohdaten: { not: Prisma.DbNull },
    },
    orderBy: { datum: "desc" },
    take: 12,
    select: { rohdaten: true },
  });
  for (const z of zeilen) {
    const mandat = mandatAusRohdaten(z.rohdaten);
    if (mandat) return mandat;
  }
  return null;
}
