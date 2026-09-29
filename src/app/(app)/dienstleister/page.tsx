import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DienstleisterTable, type DienstleisterRow } from "./dienstleister-table";
import { ladeFormularOptionen } from "./lade-optionen";

export default async function DienstleisterPage() {
  const [dienstleister, { gebaeude }] = await Promise.all([
    prisma.dienstleister.findMany({ orderBy: { name: "asc" }, include: { kostenart: true } }),
    ladeFormularOptionen(),
  ]);
  const gebaeudeLabel = new Map(gebaeude.flatMap((g) => g.optionen.map((o) => [o.value, o.label] as const)));

  const rows: DienstleisterRow[] = dienstleister.map((d) => ({
    id: d.id,
    name: d.name,
    suchbegriffe: d.suchbegriffe,
    kostenart: d.kostenart.name,
    gebaeude: d.gebaeudeAuswahl ? (gebaeudeLabel.get(d.gebaeudeAuswahl) ?? "–") : "–",
    aktiv: d.aktiv,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dienstleister</h1>
          <p className="text-sm text-neutral-400">
            {rows.length} Dienstleister — beim Kosten-Import werden Kontoauszugszeilen anhand der
            Suchbegriffe automatisch der Kostenart (und ggf. dem Gebäude) zugeordnet.
          </p>
        </div>
        <Link
          href="/dienstleister/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neuer Dienstleister
        </Link>
      </div>

      <DienstleisterTable rows={rows} />
    </div>
  );
}
