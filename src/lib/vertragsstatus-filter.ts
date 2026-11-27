// Abfrage-Bedingungen zum abgeleiteten Vertragsstatus (Regel: vertragStatus in vertragsstatus.ts).
// Jede Bedingung steckt in einem eigenen `AND`, damit sie sich per Spread mit anderen Bedingungen
// (auch einem eigenen `OR`) kombinieren lässt — nur nicht mit einem eigenen `AND` im selben Objekt.
import type { Prisma } from "@/generated/prisma/client";
import { heuteDeutschland } from "@/lib/target-tage";

type Bedingung = { AND: Prisma.MietvertragWhereInput[] };

/** Schon begonnen (Aktiv oder Beendet) — ersetzt den früheren Filter „nicht Geplant“. */
export function vertragBegonnen(heute: Date = heuteDeutschland()): Bedingung {
  return { AND: [{ OR: [{ beginn: null }, { beginn: { lte: heute } }] }] };
}

/** Noch nicht beendet (Aktiv oder Geplant): Mietende fehlt oder ist frühestens heute. */
export function vertragNichtBeendet(heute: Date = heuteDeutschland()): Bedingung {
  return { AND: [{ OR: [{ ende: null }, { ende: { gte: heute } }] }] };
}

/** Aktiv: begonnen und nicht beendet. */
export function vertragAktiv(heute: Date = heuteDeutschland()): Bedingung {
  return { AND: [...vertragBegonnen(heute).AND, ...vertragNichtBeendet(heute).AND] };
}

/** Beendet: Mietende vor heute. */
export function vertragBeendet(heute: Date = heuteDeutschland()): Bedingung {
  return { AND: [{ ende: { lt: heute } }] };
}

/** Geplant: Beginn nach heute. */
export function vertragGeplant(heute: Date = heuteDeutschland()): Bedingung {
  return { AND: [{ beginn: { gt: heute } }] };
}
