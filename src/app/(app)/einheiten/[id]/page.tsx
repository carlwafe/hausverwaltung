import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EinheitForm } from "../einheit-form";
import { updateEinheit, deleteEinheit } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { sortByStrasseUndHausnummer } from "@/lib/sort-gebaeude";

export default async function EinheitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [einheit, gebaeudeRaw] = await Promise.all([
    prisma.einheit.findUnique({ where: { id } }),
    prisma.gebaeude.findMany(),
  ]);
  if (!einheit) notFound();
  const gebaeude = sortByStrasseUndHausnummer(gebaeudeRaw);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">{einheit.bezeichnung}</h1>
        <DeleteButton action={deleteEinheit.bind(null, id)} />
      </div>
      <EinheitForm
        gebaeudeOptionen={gebaeude.map((g) => ({
          id: g.id,
          label: `${g.strasse} ${g.hausnummer}`,
        }))}
        initial={{
          gebaeudeId: einheit.gebaeudeId,
          bezeichnung: einheit.bezeichnung,
          typ: einheit.typ,
          etage: einheit.etage,
          wohnflaecheQm: einheit.wohnflaecheQm.toString(),
          einbaukueche: einheit.einbaukueche,
          fotosVorhanden: einheit.fotosVorhanden,
          notizen: einheit.notizen,
        }}
        action={updateEinheit.bind(null, id)}
      />
    </div>
  );
}
