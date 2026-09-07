import { prisma } from "@/lib/prisma";
import { ZahlungForm } from "../zahlung-form";
import { createZahlung } from "../actions";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";

export default async function NeueZahlungPage({
  searchParams,
}: {
  searchParams: Promise<{ mietvertragId?: string }>;
}) {
  const { mietvertragId } = await searchParams;

  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: { einheit: true, mieter: true },
  });
  vertraege.sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung));

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold text-white">Neue Zahlung</h1>
      <ZahlungForm
        mietvertraege={vertraege.map((v) => ({
          id: v.id,
          label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
        }))}
        defaultMietvertragId={mietvertragId}
        action={createZahlung}
      />
    </div>
  );
}
