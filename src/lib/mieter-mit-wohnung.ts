import { prisma } from "@/lib/prisma";

// IDs der Mieter, die (auch) eine laufende oder geplante Wohnung gemietet haben. Grundlage für den
// Umsatzsteuer-Hinweis im Garagen-Mietvertrag: Eine Garage zur Wohnung ist Nebenleistung (steuerfrei),
// eine allein vermietete Garage umsatzsteuerpflichtig.
export async function ladeMieterIdsMitWohnung(): Promise<string[]> {
  const mieter = await prisma.mieter.findMany({
    where: {
      mietvertraege: {
        some: { status: { not: "BEENDET" }, einheit: { typ: "WOHNUNG" } },
      },
    },
    select: { id: true },
  });
  return mieter.map((m) => m.id);
}
