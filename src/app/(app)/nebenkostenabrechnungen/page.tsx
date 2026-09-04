import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { NeueAbrechnungForm } from "./neue-abrechnung-form";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const STATUS_LABEL: Record<string, string> = {
  ENTWURF: "Entwurf",
  FINAL: "Final",
};

export default async function NebenkostenabrechnungenPage() {
  const abrechnungen = await prisma.nebenkostenabrechnung.findMany({
    orderBy: { jahr: "desc" },
    include: { _count: { select: { positionen: true } } },
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Nebenkostenabrechnung</h1>
        <p className="text-sm text-neutral-400">
          Eine Abrechnung pro Jahr fürs ganze Objekt — verteilt die umlagefähigen Kosten nach
          Verteilerschlüssel auf alle Einheiten.
        </p>
      </div>

      <div className="mb-8 rounded-lg border border-neutral-800 p-4">
        <NeueAbrechnungForm />
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Jahr</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Positionen</th>
              <th className="px-4 py-2">Erstellt am</th>
            </tr>
          </thead>
          <tbody>
            {abrechnungen.map((a) => (
              <tr key={a.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/nebenkostenabrechnungen/${a.id}`} className="font-medium hover:underline">
                    {a.jahr}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{STATUS_LABEL[a.status] ?? a.status}</td>
                <td className="px-4 py-2 text-white">{a._count.positionen}</td>
                <td className="px-4 py-2 text-white">{formatDate(a.erstelltAm)}</td>
              </tr>
            ))}
            {abrechnungen.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Abrechnung erstellt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
