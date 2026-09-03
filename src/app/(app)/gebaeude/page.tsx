import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function GebaeudePage() {
  const gebaeudeRaw = await prisma.gebaeude.findMany({
    include: { _count: { select: { einheiten: true } } },
  });

  const gebaeude = [...gebaeudeRaw].sort((a, b) => {
    const strasseCompare = a.strasse.localeCompare(b.strasse);
    if (strasseCompare !== 0) return strasseCompare;
    const hausCompare = (a.haus ?? "").localeCompare(b.haus ?? "");
    if (hausCompare !== 0) return hausCompare;
    return Number(a.hausnummer) - Number(b.hausnummer);
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gebäude</h1>
          <p className="text-sm text-neutral-400">
            {gebaeude.length} Gebäude (je eine Hausnummer) — Basis für die Nebenkostenabrechnung
          </p>
        </div>
        <Link
          href="/gebaeude/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neues Gebäude
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Straße</th>
              <th className="px-4 py-2">Haus</th>
              <th className="px-4 py-2">Hausnummer</th>
              <th className="px-4 py-2">Einheiten</th>
            </tr>
          </thead>
          <tbody>
            {gebaeude.map((g) => (
              <tr key={g.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/gebaeude/${g.id}`} className="font-medium hover:underline">
                    {g.strasse}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{g.haus || "–"}</td>
                <td className="px-4 py-2 text-white">{g.hausnummer}</td>
                <td className="px-4 py-2 text-white">{g._count.einheiten}</td>
              </tr>
            ))}
            {gebaeude.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Gebäude angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
