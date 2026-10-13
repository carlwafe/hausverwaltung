import Link from "next/link";
import { notFound } from "next/navigation";
import { MandatEinzel } from "@/components/mandat-seite";
import { ladeGlaeubiger, ladeMandatZeilen } from "@/lib/mandat-laden";

export default async function LastschriftMandatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [[vertrag], glaeubiger] = await Promise.all([ladeMandatZeilen({ id }), ladeGlaeubiger()]);
  if (!vertrag) notFound();

  return (
    <div>
      <div className="mb-6 print:hidden">
        <Link href="/mietvertraege/lastschrift-mandate" className="text-sm text-neutral-400 hover:text-white">
          ← Lastschrift-Mandate
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">SEPA-Lastschriftmandat</h1>
        <p className="text-sm text-neutral-400">
          {vertrag.einheit} · {vertrag.mieterNamen || "ohne Mieter"}
          {" · "}
          <Link prefetch={false} href={`/mietvertraege/${id}`} className="underline hover:text-white">
            Mietvertrag
          </Link>
        </p>
        {vertrag.mandatReferenz && (
          <p className="mt-3 rounded-md border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-300">
            Für diesen Vertrag besteht bereits ein Mandat (Referenz <span className="font-mono">{vertrag.mandatReferenz}</span>
            ). Ein neues ist nur bei geänderter Kontoverbindung des Mieters oder neuem Gläubiger nötig — dann eine
            andere Referenz wählen.
          </p>
        )}
        <p className="mt-1 text-xs text-neutral-500">
          Nur zum Ausdrucken, nichts wird gespeichert. Das unterschriebene Mandat als Scan in der Mieterakte (Dokumente) ablegen.
        </p>
      </div>
      <MandatEinzel vertrag={vertrag} glaeubiger={glaeubiger} />
    </div>
  );
}
