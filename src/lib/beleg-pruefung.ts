import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { ladeBelegStatus, type BelegStatus } from "@/lib/beleg-status";

export type BelegPruefZeile = {
  id: string;
  datum: Date | null;
  kostenartName: string;
  gebaeudeLabel: string;
  empfaenger: string | null;
  beschreibung: string | null;
  betrag: number;
  status: BelegStatus;
};

export type BelegPruefung = {
  /** Beleg-pflichtige Positionen (BELEGT, AUSNAHME, FEHLT), sortiert: fehlende zuerst. */
  zeilen: BelegPruefZeile[];
};

// Belegprüfung einer Nebenkostenabrechnung: alle umlagefähigen, aktiven Kostenpositionen des Kostenjahres mit ihrem
// Belegstatus. Schmale Abfragen ohne Bankzeile (rohdaten) — die Seite rechnet nur auf Aufruf.
export async function ladeBelegPruefung(jahr: number): Promise<BelegPruefung> {
  const positionen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, jahr, kostenart: { umlagefaehig: true }, ...AKTIVE_BUCHUNG_FILTER },
    omit: { rohdaten: true },
    include: {
      kostenart: true,
      gebaeude: true,
      haus: { include: { gebaeude: true } },
      kostengruppe: true,
      einheit: { include: { gebaeude: true } },
    },
    orderBy: [{ datum: { sort: "asc", nulls: "last" } }, { erstelltAm: "asc" }],
  });
  const mitKostenart = positionen.filter((p) => p.kostenart);
  const status = await ladeBelegStatus(mitKostenart);

  const reihenfolge: Record<BelegStatus, number> = { FEHLT: 0, AUSNAHME: 1, BELEGT: 2, ENTFAELLT: 3 };
  const zeilen = mitKostenart
    .filter((p) => status.get(p.id) !== "ENTFAELLT")
    .map<BelegPruefZeile>((p) => ({
      id: p.id,
      datum: p.datum,
      kostenartName: p.kostenart!.name,
      gebaeudeLabel: gebaeudeOderHausLabel(p.gebaeude, p.haus, p.kostengruppe, p.einheit),
      empfaenger: p.empfaenger,
      beschreibung: p.verwendungszweck,
      betrag: Number(p.betrag),
      status: status.get(p.id)!,
    }))
    .sort((a, b) => reihenfolge[a.status] - reihenfolge[b.status]);
  return { zeilen };
}

export type BelegZusammenfassung = {
  gesamt: number;
  belegt: number;
  ausnahme: number;
  fehlt: number;
  betragGesamt: number;
  betragFehlt: number;
};

export function fasseBelegPruefungZusammen(zeilen: BelegPruefZeile[]): BelegZusammenfassung {
  const z: BelegZusammenfassung = { gesamt: zeilen.length, belegt: 0, ausnahme: 0, fehlt: 0, betragGesamt: 0, betragFehlt: 0 };
  for (const r of zeilen) {
    z.betragGesamt += r.betrag;
    if (r.status === "BELEGT") z.belegt++;
    else if (r.status === "AUSNAHME") z.ausnahme++;
    else {
      z.fehlt++;
      z.betragFehlt += r.betrag;
    }
  }
  return z;
}

// Nur die Zahlen (für den Hinweis auf der Abrechnungsseite und die Warnung beim Versand): eine schmale Abfrage ohne
// Includes statt der vollen Belegprüfung.
export async function zaehleBelegLuecken(jahr: number): Promise<{ gesamt: number; fehlt: number }> {
  const positionen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, jahr, kostenart: { umlagefaehig: true }, ...AKTIVE_BUCHUNG_FILTER },
    select: {
      id: true,
      aufteilungGruppeId: true,
      bezugTyp: true,
      kostenart: { select: { belegErforderlich: true } },
    },
  });
  const status = await ladeBelegStatus(positionen);
  let gesamt = 0;
  let fehlt = 0;
  for (const s of status.values()) {
    if (s === "ENTFAELLT") continue;
    gesamt++;
    if (s === "FEHLT") fehlt++;
  }
  return { gesamt, fehlt };
}

export type BelegLueckenJahr = {
  gesamt: number;
  fehlt: number;
  betragFehlt: number;
  /** Kostenarten mit fehlenden Belegen, die meisten zuerst. */
  nachKostenart: { name: string; fehlt: number; betrag: number }[];
};

// Wie zaehleBelegLuecken, aber über ALLE Kostenarten (nicht nur umlagefähige) — für den Hinweis in Jahresübersicht und
// Steuer-Aufstellung: Das Finanzamt kann zu jeder Ausgabe einen Beleg verlangen. Schmale Abfrage, nur lesend. Zeitraum wie
// im Bericht (Abflussprinzip): Buchungsdatum im Kalenderjahr, Positionen ohne Datum zählen im Kostenjahr.
export async function zaehleBelegLueckenJahr(jahr: number): Promise<BelegLueckenJahr> {
  const positionen = await prisma.buchung.findMany({
    where: {
      buchungsart: { code: "KOSTENPOSITION" },
      OR: [{ datum: { gte: new Date(jahr, 0, 1), lt: new Date(jahr + 1, 0, 1) } }, { datum: null, jahr }],
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: {
      id: true,
      betrag: true,
      aufteilungGruppeId: true,
      bezugTyp: true,
      kostenart: { select: { name: true, belegErforderlich: true } },
    },
  });
  const status = await ladeBelegStatus(positionen);
  const proArt = new Map<string, { name: string; fehlt: number; betrag: number }>();
  let gesamt = 0;
  let fehlt = 0;
  let betragFehlt = 0;
  for (const p of positionen) {
    const s = status.get(p.id);
    if (!s || s === "ENTFAELLT") continue;
    gesamt++;
    if (s !== "FEHLT") continue;
    fehlt++;
    betragFehlt += Number(p.betrag);
    const name = p.kostenart!.name.trim();
    const e = proArt.get(name) ?? { name, fehlt: 0, betrag: 0 };
    e.fehlt++;
    e.betrag += Number(p.betrag);
    proArt.set(name, e);
  }
  return { gesamt, fehlt, betragFehlt, nachKostenart: [...proArt.values()].sort((a, b) => b.fehlt - a.fehlt) };
}
