import Link from "next/link";
import { notFound } from "next/navigation";
import { Anpassungsschreiben } from "@/components/anpassungsschreiben";
import { ladeAnpassungsschreiben } from "../anpassung-laden";

export default async function IndexerhoehungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mitNk?: string }>;
}) {
  const { id } = await params;
  const { mitNk } = await searchParams;
  const daten = await ladeAnpassungsschreiben(id, `/mietvertraege/${id}/indexerhoehung`, { index: true, nk: mitNk === "1" });
  if (!daten) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/mietvertraege/moegliche-erhoehungen" className="text-sm text-neutral-400 hover:text-white">
          ← Mieterhöhung
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Indexmieten-Schreiben</h1>
        <p className="text-sm text-neutral-400">
          {daten.kopf.einheit} · {daten.kopf.mieter}
        </p>
        <p className="mt-1 text-xs text-neutral-500">
          Soll zugleich die NK-Vorauszahlung angepasst werden, den Abschnitt „NK-Vorauszahlung anpassen“ anhaken — dann
          entsteht ein gemeinsames Schreiben.
        </p>
      </div>
      <Anpassungsschreiben {...daten.props} />
    </div>
  );
}
