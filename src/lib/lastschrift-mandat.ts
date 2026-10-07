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

/** Mandatsdaten der jüngsten Lastschrift-Mietzahlung des Vertrags (null = keine gefunden). */
export async function ladeLastschriftMandat(mietvertragId: string): Promise<LastschriftMandat | null> {
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
