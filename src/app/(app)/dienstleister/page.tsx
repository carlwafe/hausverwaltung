import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DienstleisterTable, type DienstleisterRow } from "./dienstleister-table";
import { ladeDienstleisterVorschlaege } from "@/lib/dienstleister-vorschlaege";
import { Vorschlaege } from "./vorschlaege";

export default async function DienstleisterPage() {
  const [dienstleister, vorschlaege] = await Promise.all([
    prisma.dienstleister.findMany({ orderBy: { name: "asc" }, include: { kostenarten: { orderBy: { name: "asc" } } } }),
    ladeDienstleisterVorschlaege(),
  ]);

  const rows: DienstleisterRow[] = dienstleister.map((d) => ({
    id: d.id,
    name: d.name,
    suchbegriffe: d.suchbegriffe,
    kostenarten: d.kostenarten.map((k) => k.name).join(", "),
    aktiv: d.aktiv,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Dienstleister</h1>
          <p className="text-sm text-neutral-400">
            {rows.length} Dienstleister — beim Kosten-Import werden Kontoauszugszeilen anhand der
            Suchbegriffe automatisch der Kostenart zugeordnet.
          </p>
        </div>
        <Link
          href="/dienstleister/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neuer Dienstleister
        </Link>
      </div>

      <Vorschlaege
        rows={vorschlaege.map((v) => ({
          name: v.name,
          kostenarten: v.kostenarten,
          anzahl: v.anzahl,
          summe: v.summe,
        }))}
      />

      <DienstleisterTable rows={rows} />
    </div>
  );
}
