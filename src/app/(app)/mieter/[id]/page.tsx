import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MieterForm } from "../mieter-form";
import { updateMieter, deleteMieter } from "../actions";
import { DeleteButton } from "@/components/delete-button";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const STATUS_FARBE: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

export default async function MieterDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [mieter, mietvertraege] = await Promise.all([
    prisma.mieter.findUnique({ where: { id } }),
    prisma.mietvertrag.findMany({
      where: { mieter: { some: { id } } },
      include: { einheit: true },
      orderBy: { beginn: { sort: "desc", nulls: "last" } },
    }),
  ]);
  if (!mieter) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {mieter.vorname} {mieter.nachname}
        </h1>
        <DeleteButton action={deleteMieter.bind(null, id)} />
      </div>
      <MieterForm initial={mieter} action={updateMieter.bind(null, id)} />

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-white">
          Mietverträge ({mietvertraege.length})
        </h2>
        <div className="rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Einheit</th>
                <th className="px-4 py-2">Zeitraum</th>
                <th className="px-4 py-2">Miete gesamt</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mietvertraege.map((v) => (
                <tr key={v.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    <Link href={`/einheiten/${v.einheitId}`} className="hover:underline">
                      {v.einheit.bezeichnung}
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-white">
                    {v.beginn ? formatDate(v.beginn) : "unbekannt"} –{" "}
                    {v.ende ? formatDate(v.ende) : "laufend"}
                  </td>
                  <td className="px-4 py-2 text-white">
                    {formatEuro(
                      Number(v.kaltmiete) +
                        Number(v.nebenkostenVorauszahlung) +
                        (v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0),
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/mietvertraege/${v.id}`}
                      className="text-xs text-neutral-400 underline hover:text-white"
                    >
                      Mietvertrag
                    </Link>
                  </td>
                </tr>
              ))}
              {mietvertraege.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    Noch keine Mietverträge für diesen Mieter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
