import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { EinheitForm } from "../einheit-form";
import { updateEinheit, deleteEinheit, loescheWohnflaecheKorrektur } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { FotosSektion } from "@/components/fotos-sektion";
import { uploadDokument } from "../../dokumente/actions";
import { sortGebaeudeNachHaus } from "@/lib/sort-gebaeude";
import { KostenTable } from "../../kosten/kosten-table";
import { ladeKosten, REPARATUR_SANIERUNG_KOSTENART_NAMEN } from "../../kosten/kosten-liste";
import { WohnflaecheKorrekturForm } from "../wohnflaeche-korrektur-form";
import { mieterName } from "@/lib/mieter-name";
import { TicketsSektion } from "../../tickets/tickets-sektion";
import { vertragStatus } from "@/lib/vertragsstatus";

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
  const [einheit, gebaeudeRaw, mietvertraegeRoh, fotos, kosten, wohnflaecheKorrekturen] = await Promise.all([
    prisma.einheit.findUnique({
      where: { id },
      include: { gebaeude: { select: { strasse: true, hausnummer: true, objekt: { select: { plz: true, ort: true } } } } },
    }),
    prisma.gebaeude.findMany({ include: { haus: { include: { gebaeude: true } } } }),
    prisma.mietvertrag.findMany({
      where: { einheitId: id },
      include: { mieter: true },
      orderBy: { beginn: { sort: "desc", nulls: "last" } },
    }),
    prisma.dokument.findMany({
      // Kostenbelege (hängen an einer Kostenposition und tragen die Einheit nur als weiteren Bezug) sind keine Fotos.
      where: { einheitId: id, buchungId: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, dateiname: true },
    }),
    ladeKosten({ einheitId: id, kostenart: { name: { in: REPARATUR_SANIERUNG_KOSTENART_NAMEN } } }),
    prisma.wohnflaecheKorrektur.findMany({
      where: { einheitId: id },
      orderBy: { bisJahr: "desc" },
    }),
  ]);
  if (!einheit) notFound();
  const gebaeude = sortGebaeudeNachHaus(gebaeudeRaw);

  const mietvertraege = mietvertraegeRoh.map((v) => ({ ...v, status: vertragStatus(v) }));
  const aktuelle = mietvertraege.filter((v) => v.status !== "BEENDET");
  const flaeche = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(Number(einheit.wohnflaecheQm));

  return (
    <div>
      <div className="mb-6">
        <Link href="/einheiten" className="text-sm text-neutral-400 hover:text-white hover:underline">
          ← Alle Einheiten
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-white">{einheit.bezeichnung}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
          <span>{einheit.typ === "GARAGE" ? "Garage" : "Wohnung"}</span>
          <span aria-hidden="true">·</span>
          <span>
            {einheit.gebaeude.strasse} {einheit.gebaeude.hausnummer}, {einheit.gebaeude.objekt.plz} {einheit.gebaeude.objekt.ort}
          </span>
          {einheit.etage && (
            <>
              <span aria-hidden="true">·</span>
              <span>{einheit.etage}</span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>{flaeche} m²</span>
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {aktuelle.length === 0 ? (
            <span className="inline-flex h-10 items-center rounded-md border border-amber-500/40 bg-amber-500/5 px-3 text-sm text-amber-300">
              Leerstand — kein laufender Mietvertrag
            </span>
          ) : (
            aktuelle.map((v) => (
              <Link
                key={v.id}
                href={`/mietvertraege/${v.id}`}
                className="inline-flex h-10 max-w-full items-center gap-2 rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-900"
              >
                <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                <span className="truncate">{v.mieter.map((m) => mieterName(m)).join(" & ")}</span>
                <span className="shrink-0 text-xs text-neutral-400">seit {v.beginn ? formatDate(v.beginn) : "?"}</span>
              </Link>
            ))
          )}
        </div>
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
        abbrechenHref="/einheiten"
      />

      {/* Am breiten Bildschirm Mietverträge und Wohnfläche-Korrekturen nebeneinander. */}
      <div className="mt-10 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <section className="min-w-0">
          <h2 className="mb-4 text-lg font-medium text-white">Mietverträge ({mietvertraege.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
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
                            {mieterName(m)}
                          </Link>
                        </span>
                      ))}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-white">
                      {v.beginn ? formatDate(v.beginn) : "unbekannt"} – {v.ende ? formatDate(v.ende) : "laufend"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[v.status]}`}>{STATUS_LABEL[v.status]}</span>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Link
                        href={`/mietvertraege/${v.id}`}
                        className="inline-flex h-8 items-center whitespace-nowrap rounded-md border border-neutral-700 px-3 text-xs text-white hover:bg-neutral-900"
                      >
                        Öffnen
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
        </section>

        <section className="min-w-0">
          <h2 className="mb-1 text-lg font-medium text-white">Wohnfläche-Korrekturen</h2>
          <p className="mb-4 text-xs text-neutral-500">
            Für Betriebskostenabrechnungen bis einschließlich „Bis Jahr“ gilt die hier hinterlegte (historische) Fläche statt
            der aktuellen ({flaeche} m²).
          </p>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Bis Jahr</th>
                  <th className="px-4 py-2">Fläche (m²)</th>
                  <th className="px-4 py-2">Notizen</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {wohnflaecheKorrekturen.map((k) => (
                  <tr key={k.id} className="border-t border-neutral-800">
                    <td className="px-4 py-2 text-white">{k.bisJahr}</td>
                    <td className="px-4 py-2 text-white">{k.wohnflaecheQm.toString()}</td>
                    <td className="px-4 py-2 text-neutral-400">{k.notizen || "–"}</td>
                    <td className="px-4 py-2 text-right">
                      <DeleteButton size="sm" action={loescheWohnflaecheKorrektur.bind(null, id, k.id)} />
                    </td>
                  </tr>
                ))}
                {wohnflaecheKorrekturen.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-neutral-500">
                      Keine Korrekturen erfasst.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <WohnflaecheKorrekturForm einheitId={id} />
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-white">
          Reparaturen, Sanierung & Modernisierung dieser Einheit ({kosten.length})
        </h2>
        <KostenTable rows={kosten} />
      </section>

      {/* Am breiten Bildschirm Tickets und Fotos nebeneinander. */}
      <div className="mt-10 grid grid-cols-1 items-start gap-6 xl:grid-cols-2">
        <TicketsSektion where={{ einheitId: id }} neuQuery={{ einheitId: id }} />
        <FotosSektion
          fotos={fotos}
          uploadAction={uploadDokument.bind(null, {
            einheitId: id,
            revalidatePath: `/einheiten/${id}`,
          })}
          revalidatePath={`/einheiten/${id}`}
        />
      </div>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/60 p-4">
        <div>
          <h2 className="text-sm font-medium text-white">Einheit löschen</h2>
          <p className="text-xs text-neutral-400">
            {mietvertraege.length > 0
              ? "Nicht möglich, solange Mietverträge an der Einheit hängen."
              : "Gedacht für versehentlich angelegte Einheiten ohne Mietverträge."}
          </p>
        </div>
        {mietvertraege.length === 0 && (
          <DeleteButton
            action={deleteEinheit.bind(null, id)}
            confirmText={`Einheit „${einheit.bezeichnung}“ wirklich löschen?`}
            label="Einheit löschen"
          />
        )}
      </section>
    </div>
  );
}
