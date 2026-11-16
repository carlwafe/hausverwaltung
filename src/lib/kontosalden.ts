// Kontostand laut Bank aus den Salden der CAMT-XML-Dateien (Tabelle `Kontosaldo`). Der Tagessaldo ist der echte
// Stand; die Buchungen der App werden dagegen geprüft (Seite /kontostand).
import { prisma } from "@/lib/prisma";
import { parseStrengesDatum } from "@/lib/zod-datum";
import type { CamtPruefung } from "@/lib/import/camt";
import type { KontostandEintrag } from "@/lib/kontostand";

export type Kontosaldo = {
  /** Buchungstag (ISO yyyy-mm-dd). */
  datum: string;
  anfangssaldo: number | null;
  endsaldo: number;
  anzahlUmsaetze: number;
  summeUmsaetze: number;
};

/** Schreibt die Tagessalden einer Saldoprüfung (je Tag ein Wert, derselbe Tag wird überschrieben). */
export async function speichereKontosalden(pruefung: CamtPruefung, quelle: string): Promise<number> {
  let anzahl = 0;
  for (const tag of pruefung.tage) {
    if (!tag.datum || tag.endsaldo === null) continue;
    const datum = parseStrengesDatum(tag.datum);
    if (!datum) continue;
    const werte = {
      iban: pruefung.iban,
      anfangssaldo: tag.anfangssaldo,
      endsaldo: tag.endsaldo,
      anzahlUmsaetze: tag.anzahl,
      summeUmsaetze: tag.summe,
      quelle,
    };
    await prisma.kontosaldo.upsert({ where: { datum }, update: werte, create: { datum, ...werte } });
    anzahl++;
  }
  return anzahl;
}

export async function ladeKontosalden(): Promise<Kontosaldo[]> {
  const zeilen = await prisma.kontosaldo.findMany({ orderBy: { datum: "asc" } });
  return zeilen.map((z) => ({
    datum: z.datum.toISOString().slice(0, 10),
    anfangssaldo: z.anfangssaldo === null ? null : Number(z.anfangssaldo),
    endsaldo: Number(z.endsaldo),
    anzahlUmsaetze: z.anzahlUmsaetze,
    summeUmsaetze: Number(z.summeUmsaetze),
  }));
}

/**
 * Die Lücken zwischen den Tagen, die die Bank-Dateien abdecken: Endsaldo eines Tages ≠ Anfangssaldo des
 * nächsten Tages heißt, dass dazwischen eine Datei fehlt. Liefert je Lücke „von → bis“ mit beiden Salden.
 */
export function findeSaldoLuecken(salden: Kontosaldo[]): { von: string; bis: string; endsaldo: number; anfangssaldo: number }[] {
  const luecken: { von: string; bis: string; endsaldo: number; anfangssaldo: number }[] = [];
  for (let i = 1; i < salden.length; i++) {
    const davor = salden[i - 1];
    const dieser = salden[i];
    if (dieser.anfangssaldo === null) continue;
    if (Math.round(davor.endsaldo * 100) !== Math.round(dieser.anfangssaldo * 100)) {
      luecken.push({ von: davor.datum, bis: dieser.datum, endsaldo: davor.endsaldo, anfangssaldo: dieser.anfangssaldo });
    }
  }
  return luecken;
}

/**
 * Stand laut Buchungen am Ende der angegebenen Tage (aufsteigend, ISO), relativ zum Anker — dieselbe Rechnung wie
 * `kontostandAmStichtag`, aber in einem Durchlauf statt je Tag über alle Einträge.
 */
export function standAnTagen(
  eintraege: KontostandEintrag[],
  anker: { datum: Date; betrag: number },
  tage: string[],
): number[] {
  const sortiert = [...eintraege].sort((a, b) => a.datum.getTime() - b.datum.getTime());
  let summeBisAnker = 0;
  for (const e of sortiert) if (e.datum.getTime() <= anker.datum.getTime()) summeBisAnker += e.betrag;
  const offset = anker.betrag - summeBisAnker;

  let i = 0;
  let laufsumme = 0;
  return tage.map((tag) => {
    const ende = parseStrengesDatum(tag)!.getTime() + 24 * 60 * 60 * 1000 - 1;
    while (i < sortiert.length && sortiert[i].datum.getTime() <= ende) laufsumme += sortiert[i++].betrag;
    return Math.round((offset + laufsumme) * 100) / 100;
  });
}

/** Kontostand laut Bank am Ende eines Tages: Endsaldo des letzten Tages mit Umsätzen bis dahin (null davor). */
export function bankstandAm(salden: Kontosaldo[], iso: string): number | null {
  let stand: number | null = null;
  for (const s of salden) {
    if (s.datum > iso) break;
    stand = s.endsaldo;
  }
  return stand;
}
