import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";

// Welche Buchungen der Abfrage eine Bankzeile (rohdaten) haben — ohne die Zeilen selbst zu laden
// (siehe ladeBuchungRohdaten). `where` ist dieselbe Bedingung wie in der Hauptabfrage.
export async function idsMitRohdaten(where: Prisma.BuchungWhereInput): Promise<Set<string>> {
  const zeilen = await prisma.buchung.findMany({
    where: { AND: [where, { rohdaten: { not: Prisma.DbNull } }] },
    select: { id: true },
  });
  return new Set(zeilen.map((z) => z.id));
}
