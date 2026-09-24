import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ZahlungenTable, type ZahlungRow } from "./zahlungen-table";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { NK_VERRECHNUNG_BEZUG } from "@/lib/nk-verrechnung";

async function ladeZahlungen(): Promise<ZahlungRow[]> {
  const zahlungen = await prisma.buchung.findMany({
    where: { buchungsart: { code: { in: ["MIETZAHLUNG", "SONDERZAHLUNG", "MAHNGEBUEHR"] } }, ...AKTIVE_BUCHUNG_FILTER },
    // Bei gleichem Datum (z.B. zwei durch Aufteilung entstandene Zahlungen, siehe
    // aufteilungGruppeId) sonst unbestimmte Reihenfolge — zusätzlich nach Periode absteigend
    // sortiert, damit z.B. "Nov 2025, Okt 2025" statt eines zufällig wirkenden "Okt 2025,
    // Nov 2025, Okt 2025" erscheint.
    orderBy: [{ datum: "desc" }, { periodeJahr: "desc" }, { periodeMonat: "desc" }],
    include: { mietvertrag: { include: { einheit: true, mieter: true } }, importBatch: true, buchungsart: { select: { code: true } } },
  });

  // mietvertragId/datum sind bei allen drei Arten immer gesetzt, die Periode nur bei MIETZAHLUNG
  // (siehe pflichtfeldErfuellt in commitBuchungen) — auf DB-Ebene bleiben sie nullable, weil
  // dasselbe Buchung-Modell auch andere Buchungsarten trägt.
  return zahlungen.map((z) => ({
    id: z.id,
    art: z.buchungsart.code as "MIETZAHLUNG" | "SONDERZAHLUNG" | "MAHNGEBUEHR",
    mietvertragId: z.mietvertragId!,
    datum: z.datum!.toISOString(),
    einheitBezeichnung: z.mietvertrag!.einheit.bezeichnung,
    mieterNamen: z.mietvertrag!.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    periodeMonat: z.periodeMonat,
    periodeJahr: z.periodeJahr,
    betrag: Number(z.betrag),
    verwendungszweck: z.verwendungszweck,
    rohdaten: (z.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: z.importBatchId,
    importDateiname: z.importBatch?.dateiname ?? null,
    aufteilungGruppeId: z.aufteilungGruppeId,
    nkJahr: z.buchungsart.code === "MAHNGEBUEHR" && z.bezugTyp === NK_VERRECHNUNG_BEZUG ? z.jahr : null,
  }));
}

export default async function ZahlungenPage() {
  const zahlungen = await ladeZahlungen();
  const anzahlGebuehrenZahlungen = zahlungen.filter((z) => z.art === "SONDERZAHLUNG").length;
  const anzahlNkVerrechnungen = zahlungen.filter((z) => z.nkJahr !== null).length;
  const anzahlGebuehrenForderungen = zahlungen.filter((z) => z.art === "MAHNGEBUEHR" && z.nkJahr === null).length;
  const zusatz = [
    anzahlGebuehrenZahlungen > 0 ? `${anzahlGebuehrenZahlungen} Gebühren-Zahlungen` : null,
    anzahlGebuehrenForderungen > 0 ? `${anzahlGebuehrenForderungen} Gebühren-Forderungen` : null,
    anzahlNkVerrechnungen > 0 ? `${anzahlNkVerrechnungen} NK-Verrechnungen` : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Zahlungen</h1>
          <p className="text-sm text-neutral-400">
            {zahlungen.length} Zahlungen erfasst
            {zusatz.length > 0 && ` (davon ${zusatz.join(", ")})`}
          </p>
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
