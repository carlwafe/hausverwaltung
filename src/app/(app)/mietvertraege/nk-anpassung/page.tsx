import { prisma } from "@/lib/prisma";
import { mieterName } from "@/lib/mieter-name";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { STANDARD_ZUSCHLAG_PROZENT, schlageVorauszahlungVor, vorgeschlagenesGueltigAb } from "@/lib/vorauszahlung-vorschlag";
import { NkAnpassungTabelle, type NkAnpassungZeile } from "./nk-anpassung-tabelle";

async function ladeZeilen(): Promise<NkAnpassungZeile[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: "AKTIV", abrechnungspositionen: { some: {} } },
    include: {
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      mieter: true,
      mieterhoehungen: { orderBy: { gueltigAb: "asc" } },
      // Maßgeblich ist je Vertrag nur die neueste Abrechnung.
      abrechnungspositionen: {
        orderBy: { abrechnung: { jahr: "desc" } },
        take: 1,
        select: {
          zeitraumVon: true,
          zeitraumBis: true,
          kostenanteilGesamt: true,
          vorauszahlungGesamt: true,
          details: true,
          abrechnung: { select: { jahr: true, status: true } },
        },
      },
    },
  });

  const einheitRang = new Map(
    sortEinheitenNachGebaeude(
      vertraege.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
    ).map((v, i) => [v.id, i]),
  );

  // Derselbe Zeitpunkt wie im Formular vorbelegt: Vorschlag und „bisherige Vorauszahlung“ stimmen so überein.
  const gueltigAb = vorgeschlagenesGueltigAb();
  const zuschlagProzent = Number(STANDARD_ZUSCHLAG_PROZENT);

  const zeilen: NkAnpassungZeile[] = [];
  for (const v of vertraege) {
    const p = v.abrechnungspositionen[0];
    if (!p) continue;
    const jahr = p.abrechnung.jahr;
    // Endet der Vertrag bis zum Jahresende der Abrechnung, ist nichts mehr anzupassen.
    if (v.ende && v.ende <= new Date(jahr, 11, 31, 23, 59, 59)) continue;

    const vertrag = {
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      mieterhoehungen: v.mieterhoehungen.map((m) => ({
        gueltigAb: m.gueltigAb,
        kaltmiete: Number(m.kaltmiete),
        nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
      })),
    };
    const bisher = ermittleMieteFuerMonat(vertrag, gueltigAb.getFullYear(), gueltigAb.getMonth()).nebenkostenVorauszahlung;
    const kostenanteil = Number(p.kostenanteilGesamt);
    const ergebnis =
      kostenanteil > 0
        ? schlageVorauszahlungVor({
            jahr,
            zeitraumVon: p.zeitraumVon,
            zeitraumBis: p.zeitraumBis,
            kostenanteilGesamt: kostenanteil,
            anteileJahr: (Array.isArray(p.details) ? (p.details as unknown as KostenanteilDetailEintrag[]) : []).map((d) => d.anteilJahr),
            aktuelleVorauszahlung: bisher,
            zuschlagProzent,
          })
        : null;

    // Schon nach der Abrechnung angepasst: eine Mieterhöhung nach Ende des Abrechnungsjahres.
    const jahresende = new Date(jahr, 11, 31, 23, 59, 59);
    const angepasst = v.mieterhoehungen.find((m) => m.gueltigAb > jahresende);

    zeilen.push({
      id: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      einheitRang: einheitRang.get(v.id) ?? 0,
      mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & ") || "– ohne Mieter –",
      jahr,
      entwurf: p.abrechnung.status === "ENTWURF",
      kostenanteil,
      bisher,
      jahreskosten: ergebnis?.jahreskosten ?? null,
      hochgerechnet: ergebnis?.hochgerechnet ?? false,
      monatlich: ergebnis?.rechnerischMonatlich ?? null,
      vorschlag: ergebnis?.vorschlag ?? null,
      angepasstAb: angepasst ? angepasst.gueltigAb.toISOString() : null,
    });
  }
  return zeilen;
}

export default async function NkAnpassungPage() {
  const zeilen = await ladeZeilen();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">NK-Anpassung</h1>
        <p className="text-sm text-neutral-400">
          Nach einer Nebenkostenabrechnung darf die monatliche Vorauszahlung auf eine angemessene Höhe angepasst werden
          (§ 560 Abs. 4 BGB, Erklärung in Textform). Gezeigt wird je aktivem Mietvertrag die neueste Abrechnung mit dem
          Rechenweg von links nach rechts: Kostenanteil des Abrechnungsjahres → auf 12 Monate hochgerechnet (nur bei
          unterjähriger Nutzung, sonst gleich) → ÷ 12 = Kosten pro Monat → plus {STANDARD_ZUSCHLAG_PROZENT} % Zuschlag,
          aufgerundet auf volle Euro = Vorschlag. Zuschlag, Betrag und Gültig-ab-Datum lassen
          sich im Schreiben je Mieter ändern; die Spalten hier sind nur eine Vorschau (nichts gespeichert).
          „Angepasst“ heißt: Nach dem Abrechnungsjahr wurde schon eine Mieterhöhung erfasst (auch eine mit anderem
          Anlass) — dann Schreiben und Betrag im Vertrag prüfen. Bei Mietern mit Jobcenter vorher die
          Angemessenheitsgrenze beachten.
        </p>
      </div>

      <NkAnpassungTabelle alle={zeilen} />
    </div>
  );
}
