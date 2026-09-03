import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";

const typLabel: Record<string, string> = {
  WOHNUNG: "Wohnung",
  GARAGE: "Garage",
};

export default async function EinheitenPage() {
  const einheitenRaw = await prisma.einheit.findMany({
    include: {
      gebaeude: true,
      mietvertraege: {
        where: { status: "AKTIV" },
        include: { mieter: true },
      },
    },
  });

  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Einheiten</h1>
          <p className="text-sm text-neutral-400">{einheiten.length} Einheiten insgesamt</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/einheiten/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Datei importieren
          </Link>
          <Link
            href="/einheiten/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neue Einheit
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Gebäude</th>
              <th className="px-4 py-2">Bezeichnung</th>
              <th className="px-4 py-2">Typ</th>
              <th className="px-4 py-2">Etage</th>
              <th className="px-4 py-2">Wohnfläche</th>
              <th className="px-4 py-2">Mieter</th>
            </tr>
          </thead>
          <tbody>
            {einheiten.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/gebaeude/${e.gebaeude.id}`} className="hover:underline">
                    {e.gebaeude.strasse} {e.gebaeude.hausnummer}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">
                  <Link href={`/einheiten/${e.id}`} className="font-medium hover:underline">
                    {e.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{typLabel[e.typ]}</td>
                <td className="px-4 py-2 text-white">{e.etage || "–"}</td>
                <td className="px-4 py-2 text-white">{Number(e.wohnflaecheQm).toFixed(2)} m²</td>
                <td className="px-4 py-2 text-white">
                  {e.mietvertraege.length > 0 ? (
                    e.mietvertraege.map((v) => `${v.mieter.vorname} ${v.mieter.nachname}`).join(", ")
                  ) : (
                    <span className="text-neutral-500">leer</span>
                  )}
                </td>
              </tr>
            ))}
            {einheiten.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Einheiten angelegt.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
