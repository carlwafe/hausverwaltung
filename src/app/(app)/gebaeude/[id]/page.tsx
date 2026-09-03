import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GebaeudeForm } from "../gebaeude-form";
import { updateGebaeude, deleteGebaeude } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export default async function GebaeudeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const gebaeude = await prisma.gebaeude.findUnique({
    where: { id },
    include: { einheiten: { orderBy: { bezeichnung: "asc" } } },
  });
  if (!gebaeude) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">
          {gebaeude.strasse} {gebaeude.hausnummer}
        </h1>
        <DeleteButton
          action={deleteGebaeude.bind(null, id)}
          confirmText="Gebäude wirklich löschen? Das geht nur, wenn keine Einheiten mehr zugeordnet sind."
        />
      </div>
      <GebaeudeForm
        initial={{
          strasse: gebaeude.strasse,
          hausnummer: gebaeude.hausnummer,
          haus: gebaeude.haus,
          beschreibung: gebaeude.beschreibung,
        }}
        action={updateGebaeude.bind(null, id)}
      />

      <h2 className="mb-3 mt-10 text-lg font-medium text-white">
        Einheiten in diesem Gebäude ({gebaeude.einheiten.length})
      </h2>
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Bezeichnung</th>
              <th className="px-4 py-2">Etage</th>
              <th className="px-4 py-2">Wohnfläche</th>
            </tr>
          </thead>
          <tbody>
            {gebaeude.einheiten.map((e) => (
              <tr key={e.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/einheiten/${e.id}`} className="font-medium hover:underline">
                    {e.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">{e.etage || "–"}</td>
                <td className="px-4 py-2 text-white">{Number(e.wohnflaecheQm).toFixed(2)} m²</td>
              </tr>
            ))}
            {gebaeude.einheiten.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Einheiten in diesem Gebäude.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
