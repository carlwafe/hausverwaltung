import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { ladeLastschriftMandat } from "@/lib/lastschrift-mandat";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { indexErhoehungMoeglich } from "@/lib/index-erhoehung-moeglich";
import { vorgeschlagenesGueltigAb } from "@/lib/vorauszahlung-vorschlag";
import { VorauszahlungAnpassung } from "./vorauszahlung-anpassung";

export default async function NkAnpassungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vertrag = await prisma.mietvertrag.findUnique({
    where: { id },
    include: {
      einheit: { include: { gebaeude: { select: { strasse: true, hausnummer: true, objekt: { select: { plz: true, ort: true } } } } } },
      mieter: true,
      mieterhoehungen: { orderBy: { gueltigAb: "asc" } },
      dokumente: { where: { art: "SCHREIBEN" }, orderBy: { createdAt: "desc" } },
      // Maßgeblich ist nur die neueste Abrechnung, in der dieser Vertrag vorkommt.
      abrechnungspositionen: {
        orderBy: { abrechnung: { jahr: "desc" } },
        take: 1,
        select: {
          zeitraumVon: true,
          zeitraumBis: true,
          kostenanteilGesamt: true,
          details: true,
          abrechnung: { select: { jahr: true } },
        },
      },
    },
  });
  if (!vertrag) notFound();

  const position = vertrag.abrechnungspositionen[0] ?? null;
  const jahr = position?.abrechnung.jahr ?? null;
  // Endet der Vertrag bis zum Jahresende der Abrechnung, gibt es keine Vorauszahlung mehr anzupassen.
  const endetVorher = jahr !== null && vertrag.ende !== null && vertrag.ende <= new Date(jahr, 11, 31, 23, 59, 59);

  const hinweis = !position
    ? "Für diesen Mietvertrag gibt es noch keine Nebenkostenabrechnung — der Vorschlag baut auf dem Kostenanteil einer Abrechnung auf."
    : endetVorher
      ? `Der Mietvertrag endet bis zum Jahresende ${jahr} — eine Anpassung der Vorauszahlung ist nicht mehr nötig.`
      : null;

  // Mandatsreferenz und Gläubiger-ID für die Vorabankündigung stehen in der Bankzeile der letzten Lastschrift;
  // Überweiser brauchen sie nicht (Bankzeile nur bei Lastschrift-/unbekanntem Zahlungsweg laden).
  const mandat = hinweis || vertrag.zahlungsweg === "UEBERWEISUNG" ? null : await ladeLastschriftMandat(vertrag.id);

  // Steht für denselben Termin auch eine Indexerhöhung an, gibt es ein gemeinsames Schreiben (Seite „Mieterhöhung“).
  const indexMoeglich = hinweis
    ? false
    : indexErhoehungMoeglich(
        {
          einheitTyp: vertrag.einheit.typ,
          status: vertrag.status,
          beginn: vertrag.beginn,
          kaltmiete: Number(vertrag.kaltmiete),
          nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
          mieterhoehungen: vertrag.mieterhoehungen.map((m) => ({
            gueltigAb: m.gueltigAb,
            kaltmiete: Number(m.kaltmiete),
            nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
            indexMonat: m.indexMonat,
          })),
        },
        (await prisma.verbraucherpreisindex.findMany()).map((w) => ({ jahr: w.jahr, monat: w.monat, wert: Number(w.wert) })),
        vorgeschlagenesGueltigAb(),
      );

  return (
    <div>
      <div className="mb-6">
        <Link href="/mietvertraege/nk-anpassung" className="text-sm text-neutral-400 hover:text-white">
          ← NK-Anpassung
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">NK-Vorauszahlung anpassen</h1>
        <p className="text-sm text-neutral-400">
          {vertrag.einheit.bezeichnung} · {vertrag.mieter.map((m) => mieterName(m)).join(" & ")}
          {" · "}
          <Link prefetch={false} href={`/mietvertraege/${vertrag.id}`} className="underline hover:text-white">
            Mietvertrag
          </Link>
          {jahr !== null && ` · Grundlage: Abrechnung ${jahr}`}
        </p>
      </div>

      {indexMoeglich && (
        <p className="mb-4 rounded-md border border-neutral-700 p-3 text-sm text-neutral-300">
          Für diesen Vertrag ist auch eine Indexerhöhung möglich.{" "}
          <Link prefetch={false} href={`/mietvertraege/${vertrag.id}/indexerhoehung?mitNk=1`} className="underline hover:text-white">
            Beides in einem Schreiben erstellen
          </Link>{" "}
          (eine Gesamtmiete, ein Zugang, eine Mieterhöhung).
        </p>
      )}

      {hinweis || !position || jahr === null ? (
        <p className="text-sm text-neutral-400">{hinweis}</p>
      ) : (
        <VorauszahlungAnpassung
          jahr={jahr}
          zeitraumVon={position.zeitraumVon}
          zeitraumBis={position.zeitraumBis}
          kostenanteilGesamt={Number(position.kostenanteilGesamt)}
          anteileJahr={(Array.isArray(position.details) ? (position.details as unknown as KostenanteilDetailEintrag[]) : []).map(
            (d) => d.anteilJahr,
          )}
          brief={{
            mietvertragId: vertrag.id,
            mieter: vertrag.mieter.map((m) => ({ anrede: m.anrede, vorname: m.vorname, nachname: m.nachname })),
            strasse: `${vertrag.einheit.gebaeude.strasse} ${vertrag.einheit.gebaeude.hausnummer}`,
            plzOrt: `${vertrag.einheit.gebaeude.objekt.plz} ${vertrag.einheit.gebaeude.objekt.ort}`,
            einheit: vertrag.einheit.bezeichnung,
            vertrag: {
              kaltmiete: Number(vertrag.kaltmiete),
              nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
              mieterhoehungen: vertrag.mieterhoehungen.map((m) => ({
                gueltigAb: m.gueltigAb,
                kaltmiete: Number(m.kaltmiete),
                nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
              })),
            },
            mehrwertsteuer: vertrag.mehrwertsteuer ? Number(vertrag.mehrwertsteuer) : 0,
            jobcenter: vertrag.mieter.some((m) => m.buergergeldEmpfaenger),
            zahlungsweg: vertrag.zahlungsweg,
            mandat,
            kopien: vertrag.dokumente.map((d) => ({
              id: d.id,
              dateiname: d.dateiname,
              belegDatum: d.belegDatum?.toISOString() ?? null,
              createdAt: d.createdAt.toISOString(),
            })),
          }}
        />
      )}
    </div>
  );
}
