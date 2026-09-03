import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../mietvertrag-form";
import { toDateInputValue } from "@/lib/date-utils";
import { updateMietvertrag, deleteMietvertrag } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";

export default async function MietvertragDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vertrag, einheitenRaw, mieter] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: { einheit: true, mieter: true, kaution: true },
    }),
    prisma.einheit.findMany({ include: { gebaeude: true } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
  ]);

  if (!vertrag) notFound();
  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {vertrag.einheit.bezeichnung} — {vertrag.mieter.vorname} {vertrag.mieter.nachname}
        </h1>
        <DeleteButton
          action={deleteMietvertrag.bind(null, id)}
          confirmText="Mietvertrag wirklich löschen? Zahlungen und Kaution werden mitgelöscht."
        />
      </div>
      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${m.vorname} ${m.nachname}` }))}
        initial={{
          einheitId: vertrag.einheitId,
          mieterId: vertrag.mieterId,
          beginn: toDateInputValue(vertrag.beginn),
          ende: toDateInputValue(vertrag.ende),
          kaltmiete: vertrag.kaltmiete.toString(),
          nebenkostenVorauszahlung: vertrag.nebenkostenVorauszahlung.toString(),
          status: vertrag.status,
          kautionBetrag: vertrag.kaution?.betrag.toString() ?? "",
          kautionAnlageform: vertrag.kaution?.anlageform ?? "KAUTIONSKONTO",
          kautionZinssatz: vertrag.kaution?.zinssatz?.toString() ?? "",
        }}
        action={updateMietvertrag.bind(null, id)}
      />
    </div>
  );
}
