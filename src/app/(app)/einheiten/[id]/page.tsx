import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EinheitForm } from "../einheit-form";
import { updateEinheit, deleteEinheit } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { FotosSektion } from "@/components/fotos-sektion";
import { uploadDokument } from "../../dokumente/actions";
import { sortByStrasseUndHausnummer } from "@/lib/sort-gebaeude";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const STATUS_LABEL: Record<string, string> = {
  AKTIV: "Aktiv",
  GEPLANT: "Geplant",
  BEENDET: "Beendet",
};

const STATUS_FARBE: Record<string, string> = {
  AKTIV: "bg-green-500/10 text-green-400",
  GEPLANT: "bg-amber-500/10 text-amber-400",
  BEENDET: "bg-neutral-800 text-neutral-300",
};

export default async function EinheitDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [einheit, gebaeudeRaw, mietvertraege, fotos] = await Promise.all([
    prisma.einheit.findUnique({ where: { id } }),
    prisma.gebaeude.findMany(),
    prisma.mietvertrag.findMany({
      where: { einheitId: id },
      include: { mieter: true },
      orderBy: { beginn: { sort: "desc", nulls: "last" } },
    }),
    prisma.dokument.findMany({
      where: { einheitId: id },
      orderBy: { createdAt: "desc" },
      select: { id: true, dateiname: true },
    }),
  ]);
  if (!einheit) notFound();
  const gebaeude = sortByStrasseUndHausnummer(gebaeudeRaw);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">{einheit.bezeichnung}</h1>
        <DeleteButton action={deleteEinheit.bind(null, id)} />
      </div>
      <EinheitForm
        gebaeudeOptionen={gebaeude.map((g) => ({
          id: g.id,
          label: `${g.strasse} ${g.hausnummer}`,
        }))}
        initial={{
          gebaeudeId: einheit.gebaeudeId,
          bezeichnung: einheit.bezeichnung,
          typ: einheit.typ,
          etage: einheit.etage,
          wohnflaecheQm: einheit.wohnflaecheQm.toString(),
          einbaukueche: einheit.einbaukueche,
          fotosVorhanden: einheit.fotosVorhanden,
          notizen: einheit.notizen,
        }}
        action={updateEinheit.bind(null, id)}
      />

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-white">
          Mietverträge ({mietvertraege.length})
        </h2>
        <div className="rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Mieter</th>
                <th className="px-4 py-2">Zeitraum</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mietvertraege.map((v) => (
                <tr key={v.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    {v.mieter.map((m, i) => (
                      <span key={m.id}>
                        {i > 0 && " & "}
                        <Link href={`/mieter/${m.id}`} className="hover:underline">
                          {m.vorname} {m.nachname}
                        </Link>
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2 text-white">
                    {v.beginn ? formatDate(v.beginn) : "unbekannt"} –{" "}
                    {v.ende ? formatDate(v.ende) : "laufend"}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>
                      {STATUS_LABEL[v.status]}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      href={`/mietvertraege/${v.id}`}
                      className="text-xs text-neutral-400 underline hover:text-white"
                    >
                      Mietvertrag
                    </Link>
                  </td>
                </tr>
              ))}
              {mietvertraege.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                    Noch keine Mietverträge für diese Einheit.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <FotosSektion
          fotos={fotos}
          uploadAction={uploadDokument.bind(null, {
            einheitId: id,
            revalidatePath: `/einheiten/${id}`,
          })}
          revalidatePath={`/einheiten/${id}`}
        />
      </div>
    </div>
  );
}
