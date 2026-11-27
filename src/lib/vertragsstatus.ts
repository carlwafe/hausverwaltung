// Status eines Mietvertrags (Aktiv/Geplant/Beendet): kein Feld in der DB, sondern aus Beginn und Mietende
// abgeleitet (docs/mietvertraege-mieter.md → „Vertragsstatus“). Ohne Prisma, damit auch Client-Komponenten
// es nutzen können; die passenden Abfrage-Bedingungen stehen in vertragsstatus-filter.ts.
// Datumswerte liegen als UTC-Mitternacht vor; `heute` ist das deutsche Datum (heuteDeutschland).
import { heuteDeutschland } from "@/lib/target-tage";

export type VertragStatus = "AKTIV" | "GEPLANT" | "BEENDET";

/** Beendet ab dem Tag nach dem Mietende, Geplant vor dem Mietbeginn, sonst Aktiv (auch bei unbekanntem Beginn). */
export function vertragStatus(
  v: { beginn: Date | null; ende: Date | null },
  heute: Date = heuteDeutschland(),
): VertragStatus {
  if (v.ende && v.ende < heute) return "BEENDET";
  if (v.beginn && v.beginn > heute) return "GEPLANT";
  return "AKTIV";
}
