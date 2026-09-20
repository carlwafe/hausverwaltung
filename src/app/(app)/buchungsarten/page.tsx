import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { KONTOKREIS_LABEL } from "./buchungsart-form";

function Ja({ wert }: { wert: boolean }) {
  return wert ? (
    <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Ja</span>
  ) : (
    <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Nein</span>
  );
}

export default async function BuchungsartenPage() {
  const arten = await prisma.buchungsart.findMany({
    orderBy: [{ kontokreis: "asc" }, { code: "asc" }],
    include: { _count: { select: { buchungen: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Buchungsarten</h1>
          <p className="max-w-3xl text-sm text-neutral-400">
            Der Katalog des Buchungsjournals. <strong className="text-neutral-200">Zahlungswirksam</strong>: es fließt
            echtes Geld (zählt im Kontostand, importierbar aus dem Kontoauszug).{" "}
            <strong className="text-neutral-200">Eur-relevant</strong>: zählt für die steuerliche
            Einnahmen-Überschuss-Rechnung. Beide Flags sind unabhängig — z.B. sind Kautionen zahlungswirksam, aber nicht
            eur-relevant.
          </p>
        </div>
        <Link href="/buchungsarten/neu" className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200">
          + Neue Buchungsart
        </Link>
      </div>

      <div className="overflow-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Bezeichnung</th>
              <th className="px-4 py-2">Kontokreis</th>
              <th className="px-4 py-2">Zahlungswirksam</th>
              <th className="px-4 py-2">Eur-relevant</th>
              <th className="px-4 py-2">Buchungen</th>
              <th className="px-4 py-2">Aktiv</th>
            </tr>
          </thead>
          <tbody>
            {arten.map((a) => (
              <tr key={a.id} className="border-t border-neutral-800">
                <td className="px-4 py-2 font-mono text-xs">
                  <Link href={`/buchungsarten/${a.id}`} className="hover:underline">
                    {a.code}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{a.bezeichnung}</td>
                <td className="px-4 py-2 text-neutral-300">{KONTOKREIS_LABEL[a.kontokreis]}</td>
                <td className="px-4 py-2"><Ja wert={a.zahlungswirksam} /></td>
                <td className="px-4 py-2"><Ja wert={a.eurRelevant} /></td>
                <td className="px-4 py-2 text-neutral-300">{a._count.buchungen}</td>
                <td className="px-4 py-2"><Ja wert={a.aktiv} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
