import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { DARLEHEN_BEZUG, DARLEHEN_BUCHUNGSART } from "@/lib/darlehen";
import { getCurrentUser } from "@/lib/session";
import { formatEuro } from "@/lib/dokumente-anzeige";
import { berechneTilgungsplan, type Zinsstufe } from "@/lib/tilgungsplan";
import { AufteilenFormular, MonatForm, ZusammenfuehrenKnopf, type PlanRateInfo } from "./rate-formulare";

const datumText = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);
const MONATSNAMEN = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

// Eine über das Mietkonto gezahlte Darlehensrate (Tilgung + Zinsanteil, oder eine Sonderbuchung wie Verzugszinsen):
// Darlehen und Monat der Rate ansehen/ändern, eine Zahlung für mehrere Monate auf diese Monate aufteilen.
export default async function DarlehensrateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const kannBearbeiten = !!user && user.role !== "GAST";

  const anker = await prisma.buchung.findFirst({
    where: { id, ...AKTIVE_BUCHUNG_FILTER, OR: [{ buchungsart: { code: DARLEHEN_BUCHUNGSART } }, { bezugTyp: null, kostenart: { anlageVZeile: "SCHULDZINSEN" }, darlehenZuordnung: { isNot: null } }] },
    include: { buchungsart: { select: { code: true } }, darlehenZuordnung: { include: { darlehen: true } }, kostenart: { select: { name: true } } },
  });
  if (!anker || !anker.datum) notFound();

  const istTilgung = anker.buchungsart.code === DARLEHEN_BUCHUNGSART;
  const zinsBuchung = istTilgung
    ? await prisma.buchung.findFirst({ where: { bezugTyp: DARLEHEN_BEZUG, bezugId: id, ...AKTIVE_BUCHUNG_FILTER }, include: { kostenart: { select: { name: true } } } })
    : null;
  const zins = istTilgung ? (zinsBuchung ? Number(zinsBuchung.betrag) : 0) : Number(anker.betrag);
  const tilgung = istTilgung ? -Number(anker.betrag) : 0;
  const gesamt = Math.round((zins + tilgung) * 100) / 100;
  const z = anker.darlehenZuordnung;
  const kostenartId = (istTilgung ? zinsBuchung?.kostenartId : anker.kostenartId) ?? null;

  // Teile einer Aufteilung (gleiche Gruppe): andere Raten derselben Zahlung.
  const geschwister = anker.aufteilungGruppeId
    ? await prisma.buchung.findMany({
        where: { aufteilungGruppeId: anker.aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER, darlehenZuordnung: { isNot: null } },
        include: { darlehenZuordnung: true, buchungsart: { select: { code: true } } },
        orderBy: { erstelltAm: "asc" },
      })
    : [];

  // Plan-Raten des Darlehens für die Vorbelegung beim Aufteilen
  let plan: PlanRateInfo[] = [];
  if (z && kannBearbeiten && !z.sonder && !anker.aufteilungGruppeId) {
    const d = z.darlehen;
    plan = berechneTilgungsplan({
      startRestschuld: Number(d.startRestschuld),
      startDatum: d.startDatum,
      rate: Number(d.rate),
      zinssatz: Number(d.zinssatz),
      zahltag: d.zahltag,
      laufzeitEnde: d.laufzeitEnde,
      zinsbindungBis: d.zinsbindungBis,
      stufen: (d.stufen as Zinsstufe[] | null) ?? [],
    })
      .filter((r) => Math.abs(r.jahr - anker.datum!.getUTCFullYear()) <= 1)
      .map((r) => ({ jahr: r.jahr, monat: r.monat, rate: r.rate, zins: r.zins }));
  }
  const zinsArten = kannBearbeiten && !kostenartId ? await prisma.kostenart.findMany({ where: { anlageVZeile: "SCHULDZINSEN" }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [];

  const jahr = z?.periodeJahr ?? anker.datum.getUTCFullYear();
  const monat = z?.periodeMonat ?? anker.datum.getUTCMonth() + 1;

  return (
    <div className="max-w-3xl">
      <Link href={z ? `/darlehen/tilgungsplan?darlehen=${z.darlehenId}&jahr=${jahr}` : "/darlehen"} prefetch={false} className="text-sm text-neutral-400 hover:text-white">
        ← {z ? "Darlehenskonto" : "Darlehen"}
      </Link>
      <h1 className="mt-2 text-2xl font-semibold text-white">{z?.sonder ? "Darlehen: Sonderbuchung" : "Darlehensrate"}</h1>
      <p className="text-sm text-neutral-400">
        {datumText(anker.datum)} · {anker.verwendungszweck || anker.empfaenger || "Darlehen"}
      </p>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-neutral-400">Abbuchung</dt>
          <dd className="text-white">{formatEuro(gesamt)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Zinsen (Kosten)</dt>
          <dd className="text-white">
            {zins > 0 ? (
              <Link prefetch={false} href={`/kosten/${zinsBuchung?.id ?? anker.id}`} className="underline hover:text-neutral-300">
                {formatEuro(zins)}
              </Link>
            ) : (
              formatEuro(0)
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Tilgung</dt>
          <dd className="text-white">{formatEuro(tilgung)}</dd>
        </div>
        <div>
          <dt className="text-xs text-neutral-400">Darlehen</dt>
          <dd className="text-white">
            {z ? (
              <Link prefetch={false} href={`/darlehen/tilgungsplan?darlehen=${z.darlehenId}&jahr=${jahr}`} className="underline hover:text-neutral-300">
                {z.darlehen.bezeichnung}
              </Link>
            ) : (
              <span className="text-amber-400">nicht zugeordnet</span>
            )}
          </dd>
        </div>
      </dl>
      {(zinsBuchung?.kostenart?.name ?? anker.kostenart?.name) && (
        <p className="mt-2 text-xs text-neutral-500">Kostenart der Zinsen: {zinsBuchung?.kostenart?.name ?? anker.kostenart?.name}</p>
      )}
      {anker.erstelltAm && (
        <p className="mt-1 text-xs text-neutral-500">
          Gebucht {datumText(anker.erstelltAm)}
          {anker.erstelltVon ? ` von ${anker.erstelltVon}` : ""}
        </p>
      )}

      {z?.sonder ? (
        <p className="mt-6 text-sm text-neutral-400">
          Sonderbuchung (z.B. Verzugszinsen): gehört zum Darlehen, ist aber keine Rate des Tilgungsplans und steht deshalb im
          Darlehenskonto nur unter den Sonderbuchungen, nicht im Soll.
        </p>
      ) : z ? (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Monat der Rate</h2>
          <p className="mb-3 mt-1 text-sm text-neutral-400">
            Für diesen Monat zählt die Zahlung im Darlehenskonto ({MONATSNAMEN[monat - 1]} {jahr}). Bei einer verspäteten oder
            vorgezogenen Zahlung den Monat ändern.
          </p>
          {kannBearbeiten ? <MonatForm ankerId={id} jahr={jahr} monat={monat} /> : <p className="text-sm text-white">{MONATSNAMEN[monat - 1]} {jahr}</p>}
        </section>
      ) : null}

      {anker.aufteilungGruppeId && geschwister.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Aufgeteilte Zahlung</h2>
          <p className="mb-3 mt-1 text-sm text-neutral-400">Diese Zahlung wurde auf mehrere Monate aufgeteilt:</p>
          <ul className="max-w-md text-sm">
            {geschwister.map((g) => {
              const tilg = g.buchungsart.code === DARLEHEN_BUCHUNGSART;
              return (
                <li key={g.id} className="flex justify-between border-b border-neutral-800 py-1.5">
                  <Link prefetch={false} href={`/darlehen/rate/${g.id}`} className={`underline hover:text-neutral-300 ${g.id === id ? "font-medium text-white" : "text-neutral-300"}`}>
                    {g.darlehenZuordnung?.sonder ? "Sonderbuchung" : g.darlehenZuordnung?.periodeMonat ? `${MONATSNAMEN[g.darlehenZuordnung.periodeMonat - 1]} ${g.darlehenZuordnung.periodeJahr}` : "Rate"}
                  </Link>
                  <span className="text-neutral-400">
                    {formatEuro(tilg ? -Number(g.betrag) : Number(g.betrag))} {tilg ? "Tilgung" : "Zinsen"}
                  </span>
                </li>
              );
            })}
          </ul>
          {kannBearbeiten && (
            <div className="mt-4">
              <ZusammenfuehrenKnopf ankerId={id} />
            </div>
          )}
        </section>
      )}

      {kannBearbeiten && z && !z.sonder && !anker.aufteilungGruppeId && tilgung >= 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-medium text-white">Auf mehrere Monate aufteilen</h2>
          <div className="mt-2">
            <AufteilenFormular ankerId={id} zielUrl={`/darlehen/tilgungsplan?darlehen=${z.darlehenId}&jahr=${jahr}`} gesamt={gesamt} jahr={jahr} monat={monat} plan={plan} kostenartNoetig={!kostenartId} zinsArten={zinsArten} />
          </div>
        </section>
      )}
    </div>
  );
}
