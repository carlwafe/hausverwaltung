import Link from "next/link";
import { prisma } from "@/lib/prisma";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date | null) {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const statusLabel: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const statusColor: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

export default async function MietvertraegePage() {
  const vertraege = await prisma.mietvertrag.findMany({
    orderBy: [{ status: "asc" }, { beginn: "desc" }],
    include: { einheit: true, mieter: true },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mietverträge</h1>
          <p className="text-sm text-neutral-400">{vertraege.length} Verträge insgesamt</p>
        </div>
        <Link
          href="/mietvertraege/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neuer Mietvertrag
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Beginn</th>
              <th className="px-4 py-2">Ende</th>
              <th className="px-4 py-2">Kaltmiete</th>
              <th className="px-4 py-2">NK-Vorauszahlung</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {vertraege.map((v) => (
              <tr key={v.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2">
                  <Link href={`/mietvertraege/${v.id}`} className="font-medium hover:underline">
                    {v.einheit.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2">
                  {v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
                </td>
                <td className="px-4 py-2">{formatDate(v.beginn)}</td>
                <td className="px-4 py-2">{formatDate(v.ende)}</td>
                <td className="px-4 py-2">{formatEuro(Number(v.kaltmiete))}</td>
                <td className="px-4 py-2">{formatEuro(Number(v.nebenkostenVorauszahlung))}</td>
                <td className="px-4 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs ${statusColor[v.status]}`}>
                    {statusLabel[v.status]}
                  </span>
                </td>
              </tr>
            ))}
            {vertraege.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Mietverträge angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
