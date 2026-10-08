import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { basisIndexMonat, letzteKaltmietenAenderung } from "@/lib/indexmiete";
import { ladeLastschriftMandat } from "@/lib/lastschrift-mandat";
import { nkAnpassungMoeglich } from "@/lib/vorauszahlung-vorschlag";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { IndexerhoehungSchreiben } from "./indexerhoehung-schreiben";

export default async function IndexerhoehungPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mitNk?: string }>;
}) {
  const { id } = await params;
  const { mitNk } = await searchParams;
  const [vertrag, vpiWerte] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: {
        einheit: { include: { gebaeude: { select: { strasse: true, hausnummer: true, objekt: { select: { plz: true, ort: true } } } } } },
        mieter: true,
        mieterhoehungen: { orderBy: { gueltigAb: "asc" } },
        dokumente: { where: { art: "SCHREIBEN" }, orderBy: { createdAt: "desc" } },
        // Für die optionale NK-Anpassung im selben Schreiben: nur die neueste Abrechnung des Vertrags.
        abrechnungspositionen: {
          orderBy: { abrechnung: { jahr: "desc" } },
          take: 1,
          select: { zeitraumVon: true, zeitraumBis: true, kostenanteilGesamt: true, details: true, abrechnung: { select: { jahr: true } } },
        },
      },
    }),
    prisma.verbraucherpreisindex.findMany({ orderBy: [{ jahr: "asc" }, { monat: "asc" }] }),
  ]);
  if (!vertrag) notFound();

  // Mandatsreferenz und Gläubiger-ID für die Vorabankündigung stehen in der Bankzeile der letzten Lastschrift.
  // Überweiser brauchen sie nicht (Bankzeile nur für Lastschrift-/unbekannten Zahlungsweg laden).
  const mandat = vertrag.zahlungsweg === "UEBERWEISUNG" ? null : await ladeLastschriftMandat(vertrag.id);

  const position = vertrag.abrechnungspositionen[0] ?? null;
  const nk =
    position && nkAnpassungMoeglich(vertrag.ende, position.abrechnung.jahr, Number(position.kostenanteilGesamt))
      ? {
          jahr: position.abrechnung.jahr,
          zeitraumVon: position.zeitraumVon,
          zeitraumBis: position.zeitraumBis,
          kostenanteilGesamt: Number(position.kostenanteilGesamt),
          anteileJahr: (Array.isArray(position.details) ? (position.details as unknown as KostenanteilDetailEintrag[]) : []).map(
            (d) => d.anteilJahr,
          ),
        }
      : null;

  const erhoehungen = vertrag.mieterhoehungen.map((e) => ({
    gueltigAb: e.gueltigAb,
    kaltmiete: Number(e.kaltmiete),
    nebenkostenVorauszahlung: Number(e.nebenkostenVorauszahlung),
    indexMonat: e.indexMonat,
  }));
  const letzteAenderung = letzteKaltmietenAenderung(Number(vertrag.kaltmiete), erhoehungen);
  const referenzDatum = letzteAenderung?.gueltigAb ?? vertrag.beginn;
  const basis = referenzDatum ? basisIndexMonat(referenzDatum, letzteAenderung?.indexMonat ?? null) : null;

  return (
    <div>
      <div className="mb-6">
        <Link href="/mietvertraege/moegliche-erhoehungen" className="text-sm text-neutral-400 hover:text-white">
          ← Mieterhöhung
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Indexmieten-Schreiben</h1>
        <p className="text-sm text-neutral-400">
          {vertrag.einheit.bezeichnung} · {vertrag.mieter.map((m) => mieterName(m)).join(" & ")}
        </p>
      </div>

      {!referenzDatum ? (
        <p className="text-sm text-neutral-400">
          Für diesen Vertrag ist kein Mietbeginn erfasst — ohne ihn lässt sich der Basisindex nicht bestimmen.
        </p>
      ) : vpiWerte.length === 0 ? (
        <p className="text-sm text-neutral-400">
          Es sind noch keine VPI-Werte eingetragen.{" "}
          <Link href="/mietvertraege/vpi-werte" className="underline">
            VPI-Werte pflegen
          </Link>
        </p>
      ) : (
        <IndexerhoehungSchreiben
          mietvertragId={vertrag.id}
          mieter={vertrag.mieter.map((m) => ({ anrede: m.anrede, vorname: m.vorname, nachname: m.nachname }))}
          strasse={`${vertrag.einheit.gebaeude.strasse} ${vertrag.einheit.gebaeude.hausnummer}`}
          plzOrt={`${vertrag.einheit.gebaeude.objekt.plz} ${vertrag.einheit.gebaeude.objekt.ort}`}
          einheit={vertrag.einheit.bezeichnung}
          basisKaltmiete={Number(vertrag.kaltmiete)}
          basisNk={Number(vertrag.nebenkostenVorauszahlung)}
          erhoehungen={erhoehungen}
          mehrwertsteuer={vertrag.mehrwertsteuer ? Number(vertrag.mehrwertsteuer) : 0}
          jobcenter={vertrag.mieter.some((m) => m.buergergeldEmpfaenger)}
          zahlungsweg={vertrag.zahlungsweg}
          mandat={mandat}
          referenzDatum={referenzDatum}
          referenzQuelle={letzteAenderung ? "letzte Mietanpassung" : "Mietbeginn"}
          basisVorbelegung={basis}
          nk={nk}
          mitNkVorbelegt={mitNk === "1"}
          kopien={vertrag.dokumente.map((d) => ({
            id: d.id,
            dateiname: d.dateiname,
            belegDatum: d.belegDatum?.toISOString() ?? null,
            createdAt: d.createdAt.toISOString(),
          }))}
          vpi={vpiWerte.map((w) => ({ jahr: w.jahr, monat: w.monat, wert: Number(w.wert) }))}
        />
      )}
    </div>
  );
}
