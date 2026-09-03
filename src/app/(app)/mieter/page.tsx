import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function MieterPage() {
  const mieter = await prisma.mieter.findMany({
    orderBy: { nachname: "asc" },
    include: {
      mietvertraege: {
        where: { status: "AKTIV" },
        include: { einheit: true },
      },
    },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mieter</h1>
          <p className="text-sm text-neutral-400">{mieter.length} Mieter insgesamt</p>
        </div>
        <Link
          href="/mieter/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neuer Mieter
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Name</th>
              <th className="px-4 py-2">E-Mail</th>
              <th className="px-4 py-2">Telefon</th>
              <th className="px-4 py-2">Einheit(en)</th>
            </tr>
          </thead>
          <tbody>
            {mieter.map((m) => (
              <tr key={m.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2">
                  <Link href={`/mieter/${m.id}`} className="font-medium hover:underline">
                    {m.vorname} {m.nachname}
                  </Link>
                </td>
                <td className="px-4 py-2">{m.email ?? "–"}</td>
                <td className="px-4 py-2">{m.telefon ?? "–"}</td>
                <td className="px-4 py-2">
                  {m.mietvertraege.length > 0
                    ? m.mietvertraege.map((v) => v.einheit.bezeichnung).join(", ")
                    : "–"}
                </td>
              </tr>
            ))}
            {mieter.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Mieter angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
