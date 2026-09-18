import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import {
  NebenkostenausgleichZahlungenTable,
  type NebenkostenausgleichZahlungRow,
} from "./nebenkostenausgleich-zahlungen-table";

async function ladeNebenkostenausgleichZahlungen(): Promise<NebenkostenausgleichZahlungRow[]> {
  const zahlungen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: { datum: "desc" },
    include: {
      importBatch: true,
      mietvertrag: { include: { einheit: true, mieter: true } },
    },
  });

  return zahlungen.map((b) => ({
    id: b.id,
    datum: b.datum!.toISOString(),
    betrag: Number(b.betrag),
    jahr: b.jahr,
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

export default async function NebenkostenausgleichPage() {
  const zahlungen = await ladeNebenkostenausgleichZahlungen();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Nebenkostenausgleich</h1>
          <p className="text-sm text-neutral-400">
            {zahlungen.length} Zahlung{zahlungen.length === 1 ? "" : "en"} — Rückzahlungen/
            Nachzahlungen aus der Nebenkostenabrechnung, ohne Einfluss auf Soll/Ist. Mit
            Abrechnungsjahr wird eine Zahlung automatisch mit der passenden Position verknüpft,
            sobald eine Abrechnung für dieses Jahr erstellt oder neu berechnet wird; ohne Jahr
            bleibt sie rein archivarisch.
          </p>
        </div>
        <Link
          href="/kontoauszug/import"
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Aus Kontoauszug importieren
        </Link>
      </div>

      <NebenkostenausgleichZahlungenTable rows={zahlungen} />
    </div>
  );
}
