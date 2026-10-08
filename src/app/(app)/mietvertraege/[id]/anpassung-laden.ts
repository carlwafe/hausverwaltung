import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { basisIndexMonat, letzteKaltmietenAenderung } from "@/lib/indexmiete";
import { ladeLastschriftMandat } from "@/lib/lastschrift-mandat";
import { nkAnpassungMoeglich } from "@/lib/vorauszahlung-vorschlag";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import type { AnpassungsschreibenProps } from "@/components/anpassungsschreiben";

/**
 * Lädt alles für das Anpassungsschreiben (Indexerhöhung + NK-Vorauszahlung) eines Mietvertrags. Beide Seiten
 * („Mieterhöhung“ → …/indexerhoehung, „NK-Anpassung“ → …/nk-anpassung) zeigen dasselbe Formular und unterscheiden
 * sich nur im Einstieg. `null` = Vertrag nicht gefunden.
 */
export async function ladeAnpassungsschreiben(
  id: string,
  revalidatePfad: string,
  start: { index: boolean; nk: boolean },
): Promise<{ kopf: { einheit: string; mieter: string }; props: AnpassungsschreibenProps } | null> {
  const [vertrag, vpiWerte] = await Promise.all([
    prisma.mietvertrag.findUnique({
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
          select: { zeitraumVon: true, zeitraumBis: true, kostenanteilGesamt: true, details: true, abrechnung: { select: { jahr: true } } },
        },
      },
    }),
    prisma.verbraucherpreisindex.findMany({ orderBy: [{ jahr: "asc" }, { monat: "asc" }] }),
  ]);
  if (!vertrag) return null;

  // Mandatsreferenz und Gläubiger-ID für die Vorabankündigung stehen in der Bankzeile der letzten Lastschrift.
  // Überweiser brauchen sie nicht (Bankzeile nur für Lastschrift-/unbekannten Zahlungsweg laden).
  const mandat = vertrag.zahlungsweg === "UEBERWEISUNG" ? null : await ladeLastschriftMandat(vertrag.id);

  const erhoehungen = vertrag.mieterhoehungen.map((e) => ({
    gueltigAb: e.gueltigAb,
    kaltmiete: Number(e.kaltmiete),
    nebenkostenVorauszahlung: Number(e.nebenkostenVorauszahlung),
    indexMonat: e.indexMonat,
  }));

  // ----- Indexerhöhung -----
  const letzteAenderung = letzteKaltmietenAenderung(Number(vertrag.kaltmiete), erhoehungen);
  const referenzDatum = letzteAenderung?.gueltigAb ?? vertrag.beginn;
  const index =
    referenzDatum && vpiWerte.length > 0
      ? {
          referenzDatum,
          referenzQuelle: letzteAenderung ? ("letzte Mietanpassung" as const) : ("Mietbeginn" as const),
          basisVorbelegung: basisIndexMonat(referenzDatum, letzteAenderung?.indexMonat ?? null),
          vpi: vpiWerte.map((w) => ({ jahr: w.jahr, monat: w.monat, wert: Number(w.wert) })),
        }
      : null;
  const indexHinweis = index
    ? null
    : !referenzDatum
      ? "Für diesen Vertrag ist kein Mietbeginn erfasst — ohne ihn lässt sich der Basisindex nicht bestimmen."
      : "Es sind noch keine VPI-Werte eingetragen (Mietverträge → VPI-Werte pflegen).";

  // ----- NK-Vorauszahlung -----
  const position = vertrag.abrechnungspositionen[0] ?? null;
  const nkMoeglich = position !== null && nkAnpassungMoeglich(vertrag.ende, position.abrechnung.jahr, Number(position.kostenanteilGesamt));
  const nk =
    position && nkMoeglich
      ? {
          jahr: position.abrechnung.jahr,
          zeitraumVon: position.zeitraumVon,
          zeitraumBis: position.zeitraumBis,
          kostenanteilGesamt: Number(position.kostenanteilGesamt),
          anteileJahr: (Array.isArray(position.details) ? (position.details as unknown as KostenanteilDetailEintrag[]) : []).map((d) => d.anteilJahr),
        }
      : null;
  const nkHinweis = nk
    ? null
    : !position
      ? "Für diesen Mietvertrag gibt es noch keine Nebenkostenabrechnung — der Vorschlag baut auf dem Kostenanteil einer Abrechnung auf."
      : Number(position.kostenanteilGesamt) <= 0
        ? `Die Abrechnung ${position.abrechnung.jahr} enthält für diesen Vertrag keinen Kostenanteil (z.B. automatisch angelegte Platzhalter-Position) — ohne Kostenanteil gibt es keinen Vorschlag.`
        : `Der Mietvertrag endet bis zum Jahresende ${position.abrechnung.jahr} — eine Anpassung der Vorauszahlung ist nicht mehr nötig.`;

  return {
    kopf: {
      einheit: vertrag.einheit.bezeichnung,
      mieter: vertrag.mieter.map((m) => mieterName(m)).join(" & "),
    },
    props: {
      mietvertragId: vertrag.id,
      mieter: vertrag.mieter.map((m) => ({ anrede: m.anrede, vorname: m.vorname, nachname: m.nachname })),
      strasse: `${vertrag.einheit.gebaeude.strasse} ${vertrag.einheit.gebaeude.hausnummer}`,
      plzOrt: `${vertrag.einheit.gebaeude.objekt.plz} ${vertrag.einheit.gebaeude.objekt.ort}`,
      einheit: vertrag.einheit.bezeichnung,
      basisKaltmiete: Number(vertrag.kaltmiete),
      basisNk: Number(vertrag.nebenkostenVorauszahlung),
      erhoehungen,
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
      revalidatePfad,
      index,
      indexHinweis,
      nk,
      nkHinweis,
      // Der gewählte Einstieg zählt nur, wenn der Abschnitt möglich ist; sonst startet der andere angehakt.
      ...(() => {
        const startIndex = start.index && index !== null;
        const startNk = start.nk && nk !== null;
        // Ist der gewünschte Einstieg nicht möglich, startet der andere Abschnitt angehakt.
        return startIndex || startNk ? { startIndex, startNk } : { startIndex: index !== null, startNk: index === null && nk !== null };
      })(),
    },
  };
}
