import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MietweiterleitungenTable, type MietweiterleitungRow } from "./mietweiterleitungen-table";

async function ladeMietweiterleitungen(): Promise<MietweiterleitungRow[]> {
  const buchungen = await prisma.eigentuemerBuchung.findMany({
    orderBy: { datum: "desc" },
    include: { importBatch: true },
  });

  return buchungen.map((m) => ({
    id: m.id,
    datum: m.datum.toISOString(),
    betrag: Number(m.betrag),
    empfaenger: m.empfaenger,
    verwendungszweck: m.verwendungszweck,
    rohdaten: (m.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: m.importBatchId,
    importDateiname: m.importBatch?.dateiname ?? null,
  }));
}

export default async function MietweiterleitungenPage() {
  const buchungen = await ladeMietweiterleitungen();
  const summe = buchungen.reduce((s, m) => s + m.betrag, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Mietweiterleitungen</h1>
          <p className="text-sm text-neutral-400">
            {buchungen.length} Buchung{buchungen.length === 1 ? "" : "en"} zwischen Konto und
            Eigentümerin
          </p>
        </div>
        <Link
          href="/kontoauszug/import"
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Aus Kontoauszug importieren
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Saldo (negativ = mehr Weiterleitungen als Einlagen)</p>
        <p className={`mt-1 text-lg font-semibold ${summe < 0 ? "text-red-400" : "text-green-400"}`}>
          {new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(summe)}
        </p>
      </div>

      <MietweiterleitungenTable rows={buchungen} />
    </div>
  );
}
