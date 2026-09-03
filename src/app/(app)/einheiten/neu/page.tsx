import { prisma } from "@/lib/prisma";
import { EinheitForm } from "../einheit-form";
import { createEinheit } from "../actions";
import { sortByStrasseUndHausnummer } from "@/lib/sort-gebaeude";

export default async function NeueEinheitPage() {
  const gebaeude = sortByStrasseUndHausnummer(await prisma.gebaeude.findMany());

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neue Einheit</h1>
      <EinheitForm
        gebaeudeOptionen={gebaeude.map((g) => ({
          id: g.id,
          label: `${g.strasse} ${g.hausnummer}`,
        }))}
        action={createEinheit}
      />
    </div>
  );
}
