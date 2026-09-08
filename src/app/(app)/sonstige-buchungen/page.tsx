import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { SonstigeBuchungenTable, type SonstigeBuchungRow } from "./sonstige-buchungen-table";

async function ladeSonstigeBuchungen(): Promise<SonstigeBuchungRow[]> {
  const buchungen = await prisma.sonstigeBuchung.findMany({
    orderBy: { datum: "desc" },
    include: {
      importBatch: true,
      mietvertrag: { include: { einheit: true, mieter: true } },
    },
  });

  return buchungen.map((b) => ({
    id: b.id,
    datum: b.datum.toISOString(),
    betrag: Number(b.betrag),
    empfaenger: b.empfaenger,
    verwendungszweck: b.verwendungszweck,
    mietvertragId: b.mietvertragId,
    einheitBezeichnung: b.mietvertrag?.einheit.bezeichnung ?? null,
    mieterNamen: b.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") ?? null,
    rohdaten: (b.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: b.importBatchId,
    importDateiname: b.importBatch?.dateiname ?? null,
  }));
}

export default async function SonstigeBuchungenPage() {
  const buchungen = await ladeSonstigeBuchungen();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Sonstige Buchungen</h1>
          <p className="text-sm text-neutral-400">
            {buchungen.length} Buchung{buchungen.length === 1 ? "" : "en"} — rein archivarisch, ohne
            Einfluss auf Soll/Ist oder die Nebenkostenabrechnung (z.B. Nebenkostenausgleiche aus
            Jahren ohne Abrechnung in dieser App)
          </p>
        </div>
        <Link
          href="/kontoauszug/import"
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Aus Kontoauszug importieren
        </Link>
      </div>

      <SonstigeBuchungenTable rows={buchungen} />
    </div>
  );
}
