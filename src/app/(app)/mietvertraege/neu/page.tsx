import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../mietvertrag-form";
import { createMietvertrag } from "../actions";

export default async function NeuerMietvertragPage() {
  const [einheiten, mieter] = await Promise.all([
    prisma.einheit.findMany({ orderBy: { bezeichnung: "asc" } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
  ]);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neuer Mietvertrag</h1>
      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${m.vorname} ${m.nachname}` }))}
        action={createMietvertrag}
      />
    </div>
  );
}
