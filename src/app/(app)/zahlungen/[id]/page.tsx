import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ZahlungForm } from "../zahlung-form";
import { updateZahlung, deleteZahlung } from "../actions";
import { DeleteButton } from "@/components/delete-button";

export default async function ZahlungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [zahlung, vertraege] = await Promise.all([
    prisma.zahlung.findUnique({
      where: { id },
      include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      orderBy: { beginn: "desc" },
      include: { einheit: true, mieter: true },
    }),
  ]);
  if (!zahlung) notFound();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Zahlung — {zahlung.mietvertrag.einheit.bezeichnung} (
          {zahlung.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")})
        </h1>
        <DeleteButton action={deleteZahlung.bind(null, id)} confirmText="Zahlung wirklich löschen?" />
      </div>
      <ZahlungForm
        mietvertraege={vertraege.map((v) => ({
          id: v.id,
          label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
        }))}
        initial={{
          mietvertragId: zahlung.mietvertragId,
          datum: zahlung.datum.toISOString().slice(0, 10),
          betrag: zahlung.betrag.toString(),
          periodeMonat: zahlung.periodeMonat,
          periodeJahr: zahlung.periodeJahr,
          verwendungszweck: zahlung.verwendungszweck,
        }}
        action={updateZahlung.bind(null, id)}
      />
    </div>
  );
}
