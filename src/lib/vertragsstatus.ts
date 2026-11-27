// Status eines Mietvertrags folgt Beginn und Mietende (docs/mietvertraege-mieter.md → „Vertragsstatus“).
// Reine Datumsrechnung ohne Prisma, damit auch das Formular sie nutzen kann. Datumswerte liegen als
// UTC-Mitternacht vor; `heute` ist das deutsche Datum (heuteDeutschland in target-tage.ts).

export type VertragStatus = "AKTIV" | "GEPLANT" | "BEENDET";

/**
 * Status, auf den die App einen Vertrag von selbst nachzieht — nur vorwärts:
 * Aktiv/Geplant → Beendet ab dem Tag nach dem Mietende, Geplant → Aktiv ab dem Mietbeginn.
 * Rückwärts (z.B. Beendet → Aktiv bei verlängertem Mietende) nie automatisch.
 */
export function nachgezogenerStatus(
  status: VertragStatus,
  beginn: Date | null | undefined,
  ende: Date | null | undefined,
  heute: Date,
): VertragStatus {
  if (status === "BEENDET") return status;
  if (ende && ende < heute) return "BEENDET";
  if (status === "GEPLANT" && (!beginn || beginn <= heute)) return "AKTIV";
  return status;
}
