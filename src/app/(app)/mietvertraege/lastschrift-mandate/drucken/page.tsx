import Link from "next/link";
import { MandatSammel } from "@/components/mandat-seite";
import { ladeGlaeubiger, ladeMandatZeilen } from "@/lib/mandat-laden";

export default async function MandateDruckenPage({ searchParams }: { searchParams: Promise<{ ids?: string }> }) {
  const { ids } = await searchParams;
  const idListe = (ids ?? "").split(",").map((i) => i.trim()).filter(Boolean);
  const [vertraege, glaeubiger] = await Promise.all([idListe.length > 0 ? ladeMandatZeilen({ id: { in: idListe } }) : Promise.resolve([]), ladeGlaeubiger()]);

  return (
    <div>
      <div className="mb-6 print:hidden">
        <Link href="/mietvertraege/lastschrift-mandate" className="text-sm text-neutral-400 hover:text-white">
          ← Lastschrift-Mandate
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Mandate drucken</h1>
      </div>
      <MandatSammel vertraege={vertraege} glaeubiger={glaeubiger} />
    </div>
  );
}
