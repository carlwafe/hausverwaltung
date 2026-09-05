import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ZahlungenTable, type ZahlungRow } from "./zahlungen-table";

async function ladeZahlungen(): Promise<ZahlungRow[]> {
  const zahlungen = await prisma.zahlung.findMany({
    orderBy: { datum: "desc" },
    include: { mietvertrag: { include: { einheit: true, mieter: true } }, importBatch: true },
  });

  return zahlungen.map((z) => ({
    id: z.id,
    mietvertragId: z.mietvertragId,
    datum: z.datum.toISOString(),
    einheitBezeichnung: z.mietvertrag.einheit.bezeichnung,
    mieterNamen: z.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    periodeMonat: z.periodeMonat,
    periodeJahr: z.periodeJahr,
    betrag: Number(z.betrag),
    verwendungszweck: z.verwendungszweck,
    rohdaten: (z.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: z.importBatchId,
    importDateiname: z.importBatch?.dateiname ?? null,
  }));
}

export default async function ZahlungenPage() {
  const zahlungen = await ladeZahlungen();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Zahlungen</h1>
          <p className="text-sm text-neutral-400">{zahlungen.length} Zahlungen erfasst</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/kontoauszug/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Kontoauszug importieren
          </Link>
          <Link
            href="/zahlungen/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neue Zahlung
          </Link>
        </div>
      </div>

      <ZahlungenTable rows={zahlungen} />
    </div>
  );
}
