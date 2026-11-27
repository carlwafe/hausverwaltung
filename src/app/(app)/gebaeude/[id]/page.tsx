import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { GebaeudeForm } from "../gebaeude-form";
import { updateGebaeude, deleteGebaeude } from "../actions";
import { DeleteButton } from "@/components/delete-button";
import { hausLabel, vergleicheHaus } from "@/lib/gebaeude-gruppen";
import { KostenTable } from "../../kosten/kosten-table";
import { ladeKosten, REPARATUR_SANIERUNG_KOSTENART_NAMEN } from "../../kosten/kosten-liste";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { mieterName } from "@/lib/mieter-name";
import { vertragNichtBeendet } from "@/lib/vertragsstatus-filter";
import { vertragStatus } from "@/lib/vertragsstatus";

export default async function GebaeudeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [gebaeude, haeuserRaw, kosten] = await Promise.all([
    prisma.gebaeude.findUnique({
      where: { id },
      include: {
        einheiten: {
          include: {
            // Laufende/geplante Verträge für die Spalte „Mieter“ und die Leerstand-Zählung.
            mietvertraege: {
              where: vertragNichtBeendet(),
              select: { id: true, beginn: true, ende: true, mieter: true },
            },
          },
        },
        haus: { include: { gebaeude: true } },
      },
    }),
    prisma.haus.findMany({ include: { gebaeude: true } }),
    ladeKosten({ gebaeudeId: id, kostenart: { name: { in: REPARATUR_SANIERUNG_KOSTENART_NAMEN } } }),
  ]);
  if (!gebaeude) notFound();
  const haeuser = [...haeuserRaw].sort(vergleicheHaus).map((h) => ({ id: h.id, label: hausLabel(h.gebaeude) }));

  const einheiten = [...gebaeude.einheiten].sort((a, b) => vergleicheEinheitBezeichnung(a.bezeichnung, b.bezeichnung));
  const wohnungen = einheiten.filter((e) => e.typ !== "GARAGE");
  const garagen = einheiten.length - wohnungen.length;
  const flaeche = wohnungen.reduce((sum, e) => sum + Number(e.wohnflaecheQm), 0);
  const leer = einheiten.filter((e) => e.mietvertraege.length === 0);
  const formatQm = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

  return (
    <div>
      <div className="mb-6">
        <Link href="/gebaeude" className="text-sm text-neutral-400 hover:text-white hover:underline">
          ← Alle Gebäude
        </Link>
        <h1 className="mt-1 text-2xl font-semibold text-white">
          {gebaeude.strasse} {gebaeude.hausnummer}
        </h1>
        <p className="mt-1 text-sm text-neutral-400">
          {gebaeude.haus ? (
            <Link href={`/haeuser/${gebaeude.haus.id}`} className="hover:text-white hover:underline">
              Teil von {hausLabel(gebaeude.haus.gebaeude)} →
            </Link>
          ) : (
            "Eigenständiges Gebäude (keinem Haus zugeordnet)"
          )}
          {gebaeude.beschreibung && ` · ${gebaeude.beschreibung}`}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kennzahl titel="Einheiten" wert={String(einheiten.length)}>
          {wohnungen.length} {wohnungen.length === 1 ? "Wohnung" : "Wohnungen"}
          {garagen > 0 && `, ${garagen} ${garagen === 1 ? "Garage" : "Garagen"}`}
        </Kennzahl>
        <Kennzahl titel="Wohnfläche" wert={`${formatQm(flaeche)} m²`}>
          Summe der Wohnungen
        </Kennzahl>
        <Kennzahl titel="Vermietet" wert={`${einheiten.length - leer.length} von ${einheiten.length}`}>
          laufende oder geplante Verträge
        </Kennzahl>
        <Kennzahl titel="Leerstand" wert={String(leer.length)} wertKlasse={leer.length > 0 ? "text-amber-400" : "text-white"}>
          {leer.length > 0 ? leer.map((e) => e.bezeichnung).join(", ") : "alle Einheiten vermietet"}
        </Kennzahl>
      </div>

      {/* Am breiten Bildschirm Adresse links, Einheiten rechts. */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <div className="min-w-0 lg:col-span-2">
          <GebaeudeForm
            haeuser={haeuser}
            initial={{
              strasse: gebaeude.strasse,
              hausnummer: gebaeude.hausnummer,
              hausId: gebaeude.hausId,
              beschreibung: gebaeude.beschreibung,
            }}
            action={updateGebaeude.bind(null, id)}
            abbrechenHref="/gebaeude"
          />
        </div>

        <section className="min-w-0 lg:col-span-3">
          <h2 className="mb-3 text-lg font-medium text-white">Einheiten in diesem Gebäude ({einheiten.length})</h2>
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Bezeichnung</th>
                  <th className="px-4 py-2">Etage</th>
                  <th className="px-4 py-2 text-right">Fläche</th>
                  <th className="px-4 py-2">Mieter</th>
                </tr>
              </thead>
              <tbody>
                {einheiten.map((e) => (
                  <tr key={e.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                    <td className="px-4 py-2 text-white">
                      <Link href={`/einheiten/${e.id}`} className="font-medium hover:underline">
                        {e.bezeichnung}
                      </Link>
                      {e.typ === "GARAGE" && <span className="ml-2 text-xs text-neutral-500">Garage</span>}
                    </td>
                    <td className="px-4 py-2 text-neutral-200">{e.etage || "–"}</td>
                    <td className="whitespace-nowrap px-4 py-2 text-right tabular-nums text-neutral-200">
                      {formatQm(Number(e.wohnflaecheQm))} m²
                    </td>
                    <td className="px-4 py-2">
                      {e.mietvertraege.length === 0 ? (
                        <span className="text-amber-400">Leerstand</span>
                      ) : (
                        e.mietvertraege.map((v) => (
                          <Link key={v.id} href={`/mietvertraege/${v.id}`} className="block text-white hover:underline">
                            {v.mieter.map((m) => mieterName(m)).join(" & ")}
                            {vertragStatus(v) === "GEPLANT" && <span className="ml-2 text-xs text-amber-400">geplant</span>}
                          </Link>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
                {einheiten.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                      Noch keine Einheiten in diesem Gebäude.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium text-white">
          Reparaturen, Sanierung & Modernisierung dieses Gebäudes ({kosten.length})
        </h2>
        <KostenTable rows={kosten} />
      </section>

      <section className="mt-10 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-900/60 p-4">
        <div>
          <h2 className="text-sm font-medium text-white">Gebäude löschen</h2>
          <p className="text-xs text-neutral-400">
            {einheiten.length > 0
              ? "Nicht möglich, solange Einheiten zugeordnet sind."
              : "Gedacht für versehentlich angelegte Adressen ohne Einheiten."}
          </p>
        </div>
        {einheiten.length === 0 && (
          <DeleteButton
            action={deleteGebaeude.bind(null, id)}
            confirmText={`Gebäude ${gebaeude.strasse} ${gebaeude.hausnummer} wirklich löschen?`}
            label="Gebäude löschen"
          />
        )}
      </section>
    </div>
  );
}

function Kennzahl({
  titel,
  wert,
  wertKlasse = "text-white",
  children,
}: {
  titel: string;
  wert: string;
  wertKlasse?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${wertKlasse}`}>{wert}</p>
      {children ? (
        <p className="mt-0.5 truncate text-xs text-neutral-500" title={typeof children === "string" ? children : undefined}>
          {children}
        </p>
      ) : null}
    </div>
  );
}
