import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DienstleisterTable, type DienstleisterRow } from "./dienstleister-table";
import { ladeDienstleisterVorschlaege } from "@/lib/dienstleister-vorschlaege";
import { Vorschlaege } from "./vorschlaege";

const ABSCHNITTE = [
  { typ: "DIENSTLEISTER", titel: "Dienstleister", neu: "+ Neuer Dienstleister" },
  { typ: "LIEFERANT", titel: "Lieferanten", neu: "+ Neuer Lieferant" },
] as const;

export default async function DienstleisterPage() {
  const [dienstleister, vorschlaege] = await Promise.all([
    prisma.dienstleister.findMany({ orderBy: { name: "asc" }, include: { kostenarten: { orderBy: { name: "asc" } } } }),
    ladeDienstleisterVorschlaege(),
  ]);

  const alle = dienstleister.map((d) => ({
    typ: d.typ,
    aktiv: d.aktiv,
    row: {
      id: d.id,
      name: d.name,
      beschreibung: d.beschreibung ?? "",
      ansprechpartner: d.ansprechpartner ?? "",
      telefon: d.telefon ?? "",
      email: d.email ?? "",
      adresse: d.adresse ?? "",
      suchbegriffe: d.suchbegriffe,
      kostenarten: d.kostenarten.map((k) => k.name).join(", "),
    } satisfies DienstleisterRow,
  }));

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Dienstleister &amp; Lieferanten</h1>
        <p className="text-sm text-neutral-400">
          Kontakte zum schnellen Finden und Anrufen. Optional hinterlegte Suchbegriffe ordnen
          Kontoauszugszeilen beim Kosten-Import automatisch zu.
        </p>
      </div>

      {ABSCHNITTE.map((a) => {
        const vonTyp = alle.filter((d) => d.typ === a.typ);
        const rows = vonTyp.filter((d) => d.aktiv).map((d) => d.row);
        const inaktiv = vonTyp.filter((d) => !d.aktiv).map((d) => d.row);
        return (
          <section key={a.typ} className="mb-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">
                {a.titel} <span className="text-sm font-normal text-neutral-500">({rows.length})</span>
              </h2>
              <Link
                href={`/dienstleister/neu?typ=${a.typ}`}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
              >
                {a.neu}
              </Link>
            </div>
            <DienstleisterTable rows={rows} />
            {inaktiv.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold text-neutral-400">
                  {a.titel} inaktiv <span className="font-normal text-neutral-500">({inaktiv.length})</span>
                </h3>
                <DienstleisterTable rows={inaktiv} />
              </div>
            )}
          </section>
        );
      })}

      <Vorschlaege
        rows={vorschlaege.map((v) => ({
          name: v.name,
          kostenarten: v.kostenarten,
          anzahl: v.anzahl,
          summe: v.summe,
        }))}
      />
    </div>
  );
}
