import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ladeKontostandVerlauf } from "@/lib/buchungsjournal";
import { KontostandTable, type KontostandRow } from "./kontostand-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function KontostandPage() {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });

  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
        <p className="max-w-xl text-sm text-neutral-400">
          Um den Kontostand-Verlauf zu simulieren, brauche ich einen Referenzpunkt — den echten
          Kontostand an einem bestimmten Tag (z.B. von einem Kontoauszug abgelesen). Trag ihn unter{" "}
          <Link href="/objekt" className="underline hover:text-white">
            Objekt-Einstellungen
          </Link>{" "}
          ein.
        </p>
      </div>
    );
  }

  const anker = {
    datum: objekt.kontostandAnkerDatum,
    betrag: Number(objekt.kontostandAnkerBetrag),
  };

  const verlauf = await ladeKontostandVerlauf(anker);

  const rows: KontostandRow[] = verlauf
    .slice()
    .reverse()
    .map((z) => ({
      id: z.id,
      datum: z.datum.toISOString(),
      betrag: z.betrag,
      kategorie: z.kategorie,
      beschreibung: z.beschreibung,
      kontostand: z.kontostand,
    }));

  const aktuellerStand = rows[0]?.kontostand ?? anker.betrag;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        Simulierter Verlauf, aus allen erfassten Buchungen (Zahlungen, Kosten, Mietweiterleitungen,
        Kautionsbuchungen, sonstige Buchungen) relativ zum Anker am {formatDate(anker.datum)} (
        {formatEuro(anker.betrag)}) berechnet. Die Genauigkeit hängt davon ab, dass alle Kontoauszüge
        vollständig importiert sind —{" "}
        <Link href="/kontoauszug/importe" className="underline hover:text-white">
          dort lässt sich das je Importdatei prüfen
        </Link>
        .
      </p>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Aktueller simulierter Kontostand</p>
        <p className="mt-1 text-lg font-semibold text-white">{formatEuro(aktuellerStand)}</p>
      </div>

      <KontostandTable rows={rows} />
    </div>
  );
}
