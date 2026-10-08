import Link from "next/link";
import { notFound } from "next/navigation";
import { Anpassungsschreiben } from "@/components/anpassungsschreiben";
import { ladeAnpassungsschreiben } from "../anpassung-laden";

export default async function NkAnpassungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mitIndex?: string }>;
}) {
  const { id } = await params;
  const { mitIndex } = await searchParams;
  const daten = await ladeAnpassungsschreiben(id, `/mietvertraege/${id}/nk-anpassung`, { index: mitIndex === "1", nk: true });
  if (!daten) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/mietvertraege/nk-anpassung" className="text-sm text-neutral-400 hover:text-white">
          ← NK-Anpassung
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">NK-Vorauszahlung anpassen</h1>
        <p className="text-sm text-neutral-400">
          {daten.kopf.einheit} · {daten.kopf.mieter}
          {" · "}
          <Link prefetch={false} href={`/mietvertraege/${id}`} className="underline hover:text-white">
            Mietvertrag
          </Link>
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Soll zugleich die Kaltmiete per Indexmiete erhöht werden, den Abschnitt „Indexerhöhung der Kaltmiete“ anhaken —
          dann entsteht ein gemeinsames Schreiben.
        </p>
      </div>
      <Anpassungsschreiben {...daten.props} />
    </div>
  );
}
