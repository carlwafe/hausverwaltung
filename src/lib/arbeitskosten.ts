import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { belegPflichtig } from "@/lib/beleg-status";
import type { Prisma } from "@/generated/prisma/client";

// Arbeitskosten je Kostenposition für den Ausweis nach § 35a EStG im Schreiben „Betriebskostenabrechnung“
// (Tabelle BuchungArbeitskosten, siehe prisma/schema.prisma). Die Seite zeigt den Erfassungsstand je Kostenart, das
// Schreiben nimmt nur Kostenarten, bei denen **alle** Positionen des Jahres eine Angabe haben (sonst wäre der Anteil
// zu niedrig). Für 2025 trägt ein Skript die Zahlen des Vorverwalters je Position ein (CLAUDE.md).

const rund2 = (n: number) => Math.round(n * 100) / 100;

/**
 * „Bearbeiten“, „Aufteilen“ und „Aufteilung rückgängig“ sind Storno + Neuanlage — der Anteil hängt an der Buchungs-ID
 * und wird deshalb wie die Beleg-Ausnahme auf die neue(n) Position(en) kopiert (an der stornierten bleibt er als
 * Historie). Verhältnis bleibt erhalten: Der Gesamtanteil richtet sich nach der Summe der neuen Beträge im Verhältnis
 * zur Summe der alten, auf die neuen Positionen wird nach Betrag verteilt (Rest auf die letzte, damit die Summe stimmt).
 * Nur Ziele, die eine Kostenposition sind. Fehlt an den alten Positionen jede Angabe, passiert nichts.
 */
export async function uebernehmeArbeitskosten(
  tx: Prisma.TransactionClient,
  vonBuchungIds: string | string[],
  nachBuchungIds: string | string[],
) {
  const von = Array.isArray(vonBuchungIds) ? vonBuchungIds : [vonBuchungIds];
  const nach = Array.isArray(nachBuchungIds) ? nachBuchungIds : [nachBuchungIds];
  if (von.length === 0 || nach.length === 0) return;
  const quellen = await tx.buchungArbeitskosten.findMany({ where: { buchungId: { in: von } } });
  if (quellen.length === 0) return;
  const [vonBuchungen, ziele] = await Promise.all([
    tx.buchung.findMany({ where: { id: { in: von } }, select: { betrag: true } }),
    tx.buchung.findMany({ where: { id: { in: nach }, buchungsart: { code: "KOSTENPOSITION" } }, select: { id: true, betrag: true } }),
  ]);
  const summeVon = vonBuchungen.reduce((s, b) => s + Number(b.betrag), 0);
  const geordnet = nach.map((id) => ziele.find((z) => z.id === id)).filter((z): z is NonNullable<typeof z> => !!z);
  const summeZiele = geordnet.reduce((s, z) => s + Number(z.betrag), 0);
  if (geordnet.length === 0 || summeVon === 0 || summeZiele === 0) return;
  const gesamt = rund2((quellen.reduce((s, q) => s + Number(q.betrag), 0) * summeZiele) / summeVon);

  let verteilt = 0;
  const daten = geordnet.map((z, i) => {
    const betrag = i === geordnet.length - 1 ? rund2(gesamt - verteilt) : rund2((gesamt * Number(z.betrag)) / summeZiele);
    verteilt += betrag;
    return { buchungId: z.id, betrag, geaendertVon: quellen[0].geaendertVon };
  });
  await tx.buchungArbeitskosten.createMany({ data: daten, skipDuplicates: true });
}

export type ArbeitskostenStand = {
  kostenartId: string;
  kostenartName: string;
  positionen: number;
  mitAngabe: number;
  summeBetrag: number;
  summeArbeit: number;
  /** Arbeitskosten ÷ Rechnungsbetrag (0–1); null, wenn der Rechnungsbetrag 0 ist. */
  quote: number | null;
  /** Alle beleg-pflichtigen Positionen des Jahres haben eine Angabe und der Anteil ist > 0 → erscheint im Schreiben. */
  vollstaendig: boolean;
};

/**
 * Erfassungsstand je Kostenart für ein Kostenjahr: nur Kostenarten, bei denen mindestens eine Position eine Angabe hat
 * (alle anderen gelten als nicht begünstigt). Gleiche Positionsmenge wie die Belegprüfung (umlagefähig, nicht in der
 * Techem-Abrechnung enthalten, keine Kaution-Gegenbuchung).
 */
export async function ladeArbeitskostenStand(jahr: number): Promise<ArbeitskostenStand[]> {
  const positionen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, jahr, kostenart: { umlagefaehig: true }, ...AKTIVE_BUCHUNG_FILTER },
    select: {
      id: true,
      betrag: true,
      bezugTyp: true,
      kostenartId: true,
      kostenart: { select: { id: true, name: true, umlagefaehig: true, standardVerteilerschluessel: true } },
      arbeitskosten: { select: { betrag: true } },
    },
  });
  const proKostenart = new Map<string, ArbeitskostenStand>();
  for (const p of positionen) {
    if (!p.kostenart || !belegPflichtig(p)) continue;
    const e =
      proKostenart.get(p.kostenart.id) ??
      { kostenartId: p.kostenart.id, kostenartName: p.kostenart.name.trim(), positionen: 0, mitAngabe: 0, summeBetrag: 0, summeArbeit: 0, quote: null, vollstaendig: false };
    e.positionen++;
    e.summeBetrag += Number(p.betrag);
    if (p.arbeitskosten) {
      e.mitAngabe++;
      e.summeArbeit += Number(p.arbeitskosten.betrag);
    }
    proKostenart.set(p.kostenart.id, e);
  }
  return [...proKostenart.values()]
    .filter((e) => e.mitAngabe > 0)
    .map((e) => {
      const summeBetrag = rund2(e.summeBetrag);
      const summeArbeit = rund2(e.summeArbeit);
      const quote = summeBetrag !== 0 ? summeArbeit / summeBetrag : null;
      return { ...e, summeBetrag, summeArbeit, quote, vollstaendig: e.mitAngabe === e.positionen && quote !== null && quote > 0 };
    })
    .sort((a, b) => a.kostenartName.localeCompare(b.kostenartName, "de"));
}
