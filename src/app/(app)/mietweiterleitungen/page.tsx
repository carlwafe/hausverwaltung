import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { MietweiterleitungenTable, type MietweiterleitungRow } from "./mietweiterleitungen-table";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { idsMitRohdaten } from "@/lib/rohdaten-vorhanden";
import type { Prisma } from "@/generated/prisma/client";

async function ladeMietweiterleitungen(): Promise<MietweiterleitungRow[]> {
  const where: Prisma.BuchungWhereInput = { buchungsart: { code: "MIETWEITERLEITUNG" }, ...AKTIVE_BUCHUNG_FILTER };
  const [buchungen, mitRohdaten] = await Promise.all([
    prisma.buchung.findMany({
      where,
      // Die Bankzeile (rohdaten) wird erst beim Aufklappen nachgeladen (ladeBuchungRohdaten).
      omit: { rohdaten: true },
      orderBy: { datum: "desc" },
      include: { importBatch: true },
    }),
    idsMitRohdaten(where),
  ]);

  return buchungen.map((m) => ({
    id: m.id,
    datum: m.datum!.toISOString(),
    betrag: Number(m.betrag),
    empfaenger: m.empfaenger,
    verwendungszweck: m.verwendungszweck,
    hatRohdaten: mitRohdaten.has(m.id),
    importBatchId: m.importBatchId,
    importDateiname: m.importBatch?.dateiname ?? null,
  }));
}

export default async function MietweiterleitungenPage() {
  const buchungen = await ladeMietweiterleitungen();
  const summe = buchungen.reduce((s, m) => s + m.betrag, 0);

  return (
    <div>
      <div className="mb-6 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
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
