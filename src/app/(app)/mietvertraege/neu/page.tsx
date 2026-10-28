import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../mietvertrag-form";
import { createMietvertrag } from "../actions";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { mieterNameNachnameZuerst } from "@/lib/mieter-name";
import { toDateInputValue } from "@/lib/date-utils";

export default async function NeuerMietvertragPage() {
  const [einheitenRaw, mieter, objekt] = await Promise.all([
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true } }),
  ]);
  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Neuer Mietvertrag</h1>
      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung, typ: e.typ }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${mieterNameNachnameZuerst(m)}` }))}
        objektStichtag={toDateInputValue(objekt?.buchhaltungAb)}
        action={createMietvertrag}
      />
    </div>
  );
}
