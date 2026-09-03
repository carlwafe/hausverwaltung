import { prisma } from "@/lib/prisma";
import { berechneSoll, berechneIst } from "@/lib/soll-ist";
import { OffenePostenTable, type OffenePostenRow } from "./offene-posten-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function ladeZeilen(buchhaltungAb: Date | null): Promise<OffenePostenRow[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: {
      einheit: true,
      mieter: true,
      zahlungen: true,
    },
  });

  const heute = new Date();

  return vertraege
    .map((v) => {
      const soll = berechneSoll(
        {
          beginn: v.beginn,
          ende: v.ende,
          kaltmiete: Number(v.kaltmiete),
          nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        },
        heute,
        buchhaltungAb,
      );
      const ist = berechneIst(
        v.zahlungen.map((z) => ({ datum: z.datum, betrag: Number(z.betrag) })),
        buchhaltungAb,
      );
      const saldo = ist - soll;

      return {
        id: v.id,
        einheit: v.einheit.bezeichnung,
        mieter: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
        status: v.status as "AKTIV" | "BEENDET",
        soll,
        ist,
        saldo,
      };
    })
    .sort((a, b) => a.saldo - b.saldo);
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function OffenePostenPage() {
  const objekt = await prisma.objekt.findFirst({ select: { buchhaltungAb: true } });
  const zeilen = await ladeZeilen(objekt?.buchhaltungAb ?? null);
  const gesamtRueckstand = zeilen.filter((z) => z.saldo < 0).reduce((sum, z) => sum + z.saldo, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Offene Posten</h1>
        <p className="text-sm text-neutral-400">
          Soll (Kaltmiete + NK-Vorauszahlung seit{" "}
          {objekt?.buchhaltungAb
            ? `Buchhaltungs-Stichtag ${formatDatum(objekt.buchhaltungAb)} bzw. späterem Mietbeginn`
            : "Mietbeginn"}
          ) im Vergleich zu den{" "}
          {objekt?.buchhaltungAb ? "seitdem " : ""}erfassten Zahlungen. Rot = Rückstand, Grün =
          Guthaben/Vorauszahlung.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Gesamtrückstand über alle Verträge</p>
        <p
          className={`mt-1 text-xl font-semibold ${gesamtRueckstand < 0 ? "text-red-400" : "text-white"}`}
        >
          {formatEuro(gesamtRueckstand)}
        </p>
      </div>

      <OffenePostenTable rows={zeilen} />
    </div>
  );
}
