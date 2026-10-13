import Link from "next/link";
import { MandatSammel } from "@/components/mandat-seite";
import { ladeMandatZeilen } from "@/lib/mandat-laden";

export default async function MandateDruckenPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const idListe = (ids ?? "").split(",").map((i) => i.trim()).filter(Boolean);
  const vertraege = idListe.length > 0 ? await ladeMandatZeilen({ id: { in: idListe } }) : [];

  return (
    <div>
      <div className="mb-6 print:hidden">
        <Link href="/mietvertraege/lastschrift-mandate" className="text-sm text-neutral-400 hover:text-white">
          ← Lastschrift-Mandate
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Mandate drucken</h1>
      </div>
      <MandatSammel vertraege={vertraege} />
    </div>
  );
}
