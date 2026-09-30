import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AnredeListe } from "./anrede-liste";

/**
 * Anrede (Frau/Herr) für viele Mieter auf einmal erfassen — statt jeden Mieter einzeln zu
 * bearbeiten. Mieter mit aktivem Vertrag stehen oben, weil nur sie Schreiben bekommen.
 */
export default async function MieterAnredePage() {
  const mieter = await prisma.mieter.findMany({
    orderBy: [{ nachname: "asc" }, { vorname: "asc" }],
    select: {
      id: true,
      anrede: true,
      vorname: true,
      nachname: true,
      mietvertraege: { where: { status: "AKTIV" }, select: { einheit: { select: { bezeichnung: true } } } },
    },
  });
  const zeilen = mieter
    .map((m) => ({
      id: m.id,
      anrede: m.anrede,
      vorname: m.vorname,
      nachname: m.nachname,
      einheiten: m.mietvertraege.map((v) => v.einheit.bezeichnung),
    }))
    .sort((a, b) => Number(b.einheiten.length > 0) - Number(a.einheiten.length > 0));

  return (
    <div>
      <div className="mb-6">
        <Link href="/mieter" className="text-xs text-neutral-400 hover:text-white">
          ← Mieter
        </Link>
        <h1 className="text-2xl font-semibold">Anrede erfassen</h1>
        <p className="text-sm text-neutral-400">
          {zeilen.filter((z) => z.anrede === null).length} von {zeilen.length} Mietern ohne Anrede. Ohne Anrede beginnen
          Schreiben neutral mit „Guten Tag Vorname Nachname“ (bei mehreren Mietern für alle, sobald einem die Anrede
          fehlt). Nicht nach dem Vornamen raten — im Zweifel „keine“; Firmen bekommen keine Anrede.
        </p>
      </div>
      <AnredeListe zeilen={zeilen} />
    </div>
  );
}
