import { vertragStatus } from "@/lib/vertragsstatus";

// „Amt zahlt“ (früher von Hand gepflegtes Häkchen „Bürgergeld-Empfänger“): kein eigenes Feld, sondern aus dem
// Zahlungsweg der laufenden bzw. geplanten Mietverträge abgeleitet — der Mieter zahlt, wenn mindestens ein solcher
// Vertrag den Zahlungsweg „Amt zahlt“ (Jobcenter/Kreis) hat. Beendete Verträge zählen nicht.
export function istAmtZahler(vertraege: { beginn: Date | null; ende: Date | null; zahlungsweg: string | null }[]): boolean {
  return vertraege.some((v) => vertragStatus(v) !== "BEENDET" && v.zahlungsweg === "BEHOERDE");
}
