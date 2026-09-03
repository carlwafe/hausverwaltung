import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { berechneSoll } from "@/lib/soll-ist";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function OffenePostenPage() {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: {
      einheit: true,
      mieter: true,
      zahlungen: true,
    },
  });

  const heute = new Date();

  const zeilen = vertraege
    .map((v) => {
      const soll = berechneSoll(
        {
          beginn: v.beginn,
          ende: v.ende,
          kaltmiete: Number(v.kaltmiete),
          nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        },
        heute,
      );
      const ist = v.zahlungen.reduce((sum, z) => sum + Number(z.betrag), 0);
      const saldo = ist - soll;

      return {
        id: v.id,
        einheit: v.einheit.bezeichnung,
        mieter: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
        status: v.status,
        soll,
        ist,
        saldo,
      };
    })
    .sort((a, b) => a.saldo - b.saldo);

  const gesamtRueckstand = zeilen.filter((z) => z.saldo < 0).reduce((sum, z) => sum + z.saldo, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Offene Posten</h1>
        <p className="text-sm text-neutral-400">
          Soll (Kaltmiete + NK-Vorauszahlung seit Mietbeginn) im Vergleich zu den erfassten
          Zahlungen. Rot = Rückstand, Grün = Guthaben/Vorauszahlung.
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

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Soll</th>
              <th className="px-4 py-2">Ist</th>
              <th className="px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/mietvertraege/${z.id}`} className="font-medium hover:underline">
                    {z.einheit}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{z.mieter}</td>
                <td className="px-4 py-2 text-neutral-400">
                  {z.status === "AKTIV" ? "Aktiv" : "Beendet"}
                </td>
                <td className="px-4 py-2 text-white">{formatEuro(z.soll)}</td>
                <td className="px-4 py-2 text-white">{formatEuro(z.ist)}</td>
                <td
                  className={`px-4 py-2 font-medium ${z.saldo < 0 ? "text-red-400" : z.saldo > 0 ? "text-green-400" : "text-white"}`}
                >
                  {formatEuro(z.saldo)}
                </td>
              </tr>
            ))}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Keine aktiven oder beendeten Mietverträge vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
