import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findeDienstleister, parseSuchbegriffe } from "@/lib/import/dienstleister";
import { normalizeText } from "@/lib/import/bank-csv";
import { gebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";

export type DienstleisterVorschlag = {
  // Normalisierter Empfänger, dient als Schlüssel.
  schluessel: string;
  name: string;
  kostenartId: string;
  kostenartName: string;
  // Nur gesetzt, wenn alle Buchungen dieselbe Zuordnung haben.
  gebaeudeAuswahl: string | null;
  anzahl: number;
  summe: number;
  // Anteil der Buchungen mit der häufigsten Kostenart (0..1).
  sicherheit: number;
};

const MIN_ANZAHL = 2;

/**
 * Leitet aus den bereits importierten Kostenbuchungen Dienstleister-Vorschläge ab: Empfänger, die
 * mindestens zweimal vorkommen, noch von keinem Dienstleister abgedeckt sind und kein Mieter
 * sind. Kostenart = häufigste Kostenart des Empfängers, Gebäude nur bei einheitlicher Zuordnung.
 */
export async function ladeDienstleisterVorschlaege(): Promise<DienstleisterVorschlag[]> {
  const [buchungen, dienstleister, mieter] = await Promise.all([
    prisma.buchung.findMany({
      where: {
        buchungsart: { code: "KOSTENPOSITION" },
        kostenartId: { not: null },
        empfaenger: { not: null },
        ...AKTIVE_BUCHUNG_FILTER,
      },
      select: {
        empfaenger: true,
        betrag: true,
        kostenartId: true,
        kostenart: { select: { name: true } },
        gebaeudeId: true,
        hausId: true,
        kostengruppeId: true,
        einheitId: true,
      },
    }),
    prisma.dienstleister.findMany(),
    prisma.mieter.findMany({ select: { vorname: true, nachname: true } }),
  ]);

  const kandidaten = dienstleister.map((d) => ({
    id: d.id,
    name: d.name,
    suchbegriffe: parseSuchbegriffe(d.suchbegriffe),
    kostenartId: d.kostenartId,
    gebaeudeAuswahl: d.gebaeudeAuswahl,
  }));
  const mieterNamen = new Set(
    mieter.flatMap((m) => [normalizeText(`${m.vorname}${m.nachname}`), normalizeText(`${m.nachname}${m.vorname}`)]),
  );

  type Gruppe = {
    schreibweisen: Map<string, number>;
    kostenarten: Map<string, { name: string; anzahl: number }>;
    gebaeude: Map<string, number>;
    anzahl: number;
    summe: number;
  };
  const gruppen = new Map<string, Gruppe>();
  for (const b of buchungen) {
    const roh = (b.empfaenger ?? "").trim();
    const schluessel = normalizeText(roh);
    if (schluessel.length < 3 || mieterNamen.has(schluessel)) continue;
    let g = gruppen.get(schluessel);
    if (!g) {
      g = { schreibweisen: new Map(), kostenarten: new Map(), gebaeude: new Map(), anzahl: 0, summe: 0 };
      gruppen.set(schluessel, g);
    }
    g.anzahl++;
    g.summe += Number(b.betrag);
    g.schreibweisen.set(roh, (g.schreibweisen.get(roh) ?? 0) + 1);
    const ka = g.kostenarten.get(b.kostenartId!) ?? { name: b.kostenart?.name ?? "", anzahl: 0 };
    ka.anzahl++;
    g.kostenarten.set(b.kostenartId!, ka);
    const gw = gebaeudeAuswahlWert(b.gebaeudeId, b.hausId, b.kostengruppeId, b.einheitId);
    g.gebaeude.set(gw, (g.gebaeude.get(gw) ?? 0) + 1);
  }

  const haeufigster = <T>(m: Map<string, T>, wert: (v: T) => number) =>
    [...m.entries()].sort((a, b) => wert(b[1]) - wert(a[1]))[0];

  const vorschlaege: DienstleisterVorschlag[] = [];
  for (const [schluessel, g] of gruppen) {
    if (g.anzahl < MIN_ANZAHL) continue;
    const name = haeufigster(g.schreibweisen, (n) => n)[0];
    if (findeDienstleister(name, "", kandidaten)) continue;
    const [kostenartId, ka] = haeufigster(g.kostenarten, (k) => k.anzahl);
    vorschlaege.push({
      schluessel,
      name,
      kostenartId,
      kostenartName: ka.name,
      gebaeudeAuswahl: g.gebaeude.size === 1 ? ([...g.gebaeude.keys()][0] || null) : null,
      anzahl: g.anzahl,
      summe: g.summe,
      sicherheit: ka.anzahl / g.anzahl,
    });
  }
  return vorschlaege.sort((a, b) => b.anzahl - a.anzahl);
}
