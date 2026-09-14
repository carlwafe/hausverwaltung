import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { hausLabel } from "@/lib/gebaeude-gruppen";
import { KostenTable } from "../../kosten/kosten-table";
import { ladeKosten, REPARATUR_SANIERUNG_KOSTENART_NAMEN } from "../../kosten/kosten-liste";

export default async function HausDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [haus, kosten] = await Promise.all([
    prisma.haus.findUnique({
      where: { id },
      include: { gebaeude: { include: { _count: { select: { einheiten: true } } } } },
    }),
    ladeKosten({ hausId: id, kostenart: { name: { in: REPARATUR_SANIERUNG_KOSTENART_NAMEN } } }),
  ]);
  if (!haus) notFound();

  const gebaeudeSortiert = [...haus.gebaeude].sort(
    (a, b) => Number(a.hausnummer) - Number(b.hausnummer),
  );

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">{hausLabel(haus.gebaeude)}</h1>

      <h2 className="mb-3 text-lg font-medium text-white">
        Gebäude in diesem Haus ({gebaeudeSortiert.length})
      </h2>
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Adresse</th>
              <th className="px-4 py-2">Einheiten</th>
            </tr>
          </thead>
          <tbody>
            {gebaeudeSortiert.map((g) => (
              <tr key={g.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/gebaeude/${g.id}`} className="font-medium hover:underline">
                    {g.strasse} {g.hausnummer}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{g._count.einheiten}</td>
              </tr>
            ))}
            {gebaeudeSortiert.length === 0 && (
              <tr>
                <td colSpan={2} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Gebäude diesem Haus zugeordnet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-medium text-white">
          Reparaturen, Sanierung & Modernisierung dieses Hauses ({kosten.length})
        </h2>
        <KostenTable rows={kosten} />
      </div>
    </div>
  );
}
