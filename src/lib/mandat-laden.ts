import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findColumn } from "@/lib/import/bank-csv";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { GLAEUBIGER_LEER, type MandatGlaeubiger, type MandatVertrag } from "@/lib/sepa-mandat";

export type MandatZeile = MandatVertrag & {
  einheitRang: number;
  zahlungsweg: "LASTSCHRIFT" | "UEBERWEISUNG" | "BEHOERDE" | null;
  geplant: boolean;
  /** Am Vertrag erfasstes, bereits bestehendes Mandat (null = keines erfasst). */
  mandatReferenz: string | null;
  mandatDatum: string | null; // ISO
  /**
   * Wer die Miete zahlt (aus den Mietzahlungen der letzten 12 Monate): "AMT" = Jobcenter/Bundesagentur oder Kreis zahlt
   * (ganz oder teilweise), "SELBST" = der Mieter. null = nicht ermittelt (nur bei Verträgen ohne erfasstes Mandat berechnet).
   */
  zahler: "SELBST" | "AMT" | null;
  zahlerText: string | null;
};

const AMT_BUNDESAGENTUR = /bundesagentur|jobcenter/i;
const AMT_KREIS = /kreis\s*ostholstein/i;

/** Zahler je Vertrag aus dem Zahlernamen der Bankzeilen; nur für die übergebenen Verträge, nur Zahlungen der letzten 12 Monate. */
async function ladeZahler(ids: string[]): Promise<Map<string, { zahler: "SELBST" | "AMT"; text: string }>> {
  const ergebnis = new Map<string, { zahler: "SELBST" | "AMT"; text: string }>();
  if (ids.length === 0) return ergebnis;
  const ab = new Date();
  ab.setUTCFullYear(ab.getUTCFullYear() - 1);
  const zeilen = await prisma.buchung.findMany({
    where: {
      mietvertragId: { in: ids },
      ...AKTIVE_BUCHUNG_FILTER,
      buchungsart: { code: "MIETZAHLUNG" },
      datum: { gte: ab },
      betrag: { gt: 0 },
      rohdaten: { not: Prisma.DbNull },
    },
    select: { mietvertragId: true, rohdaten: true },
  });
  const bundesagentur = new Set<string>();
  const kreis = new Set<string>();
  const anzahl = new Map<string, number>();
  const ohneAmt = new Set<string>();
  for (const z of zeilen) {
    if (!z.mietvertragId) continue;
    const r = z.rohdaten as Record<string, unknown>;
    const spalte = findColumn(Object.keys(r), ["beguenstigterzahlungspflichtiger"]);
    const name = spalte && typeof r[spalte] === "string" ? (r[spalte] as string) : "";
    anzahl.set(z.mietvertragId, (anzahl.get(z.mietvertragId) ?? 0) + 1);
    if (AMT_BUNDESAGENTUR.test(name)) bundesagentur.add(z.mietvertragId);
    else if (AMT_KREIS.test(name)) kreis.add(z.mietvertragId);
    else ohneAmt.add(z.mietvertragId);
  }
  for (const id of ids) {
    if (!anzahl.has(id)) continue; // keine Zahlung mit Bankzeile im letzten Jahr: nicht ermittelbar
    const amt = [bundesagentur.has(id) && "Jobcenter", kreis.has(id) && "Kreis Ostholstein"].filter(Boolean).join(" + ");
    ergebnis.set(id, amt ? { zahler: "AMT", text: ohneAmt.has(id) ? `${amt} + Mieter` : amt } : { zahler: "SELBST", text: "Mieter" });
  }
  return ergebnis;
}

/** Mietverträge mit den Angaben für die Mandatsformulare (temporär, siehe `sepa-mandat.ts`), in Haus-Reihenfolge. */
export async function ladeMandatZeilen(where: Prisma.MietvertragWhereInput, mitZahler = false): Promise<MandatZeile[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where,
    include: {
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } }, objekt: { select: { plz: true, ort: true } } } } } },
      mieter: true,
    },
  });
  const rang = new Map(
    sortEinheitenNachGebaeude(vertraege.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude }))).map((v, i) => [v.id, i]),
  );
  const zahler = mitZahler ? await ladeZahler(vertraege.filter((v) => !v.mandatReferenz).map((v) => v.id)) : new Map();
  return vertraege
    .map((v) => ({
      id: v.id,
      einheit: v.einheit.bezeichnung,
      einheitRang: rang.get(v.id) ?? 0,
      mieterNamen: v.mieter.map((m) => mieterName(m)).join(" & ") || "",
      strasse: `${v.einheit.gebaeude.strasse} ${v.einheit.gebaeude.hausnummer}`,
      plzOrt: `${v.einheit.gebaeude.objekt.plz} ${v.einheit.gebaeude.objekt.ort}`,
      beginn: v.beginn ? v.beginn.toISOString() : null,
      zahlungsweg: v.zahlungsweg,
      geplant: v.status === "GEPLANT",
      mandatReferenz: v.mandatReferenz,
      mandatDatum: v.mandatDatum ? v.mandatDatum.toISOString() : null,
      zahler: zahler.get(v.id)?.zahler ?? null,
      zahlerText: zahler.get(v.id)?.text ?? null,
    }))
    .sort((a, b) => a.einheitRang - b.einheitRang);
}

/** Gläubigerangaben des Objekts (Seite „Objekt“) zur Vorbelegung der Mandate; nicht hinterlegte Felder bleiben leer. */
export async function ladeGlaeubiger(): Promise<MandatGlaeubiger> {
  const o = await prisma.objekt.findFirst({
    select: { sepaGlaeubigerName: true, sepaGlaeubigerAnschrift: true, sepaGlaeubigerId: true },
  });
  if (!o) return GLAEUBIGER_LEER;
  return {
    name: o.sepaGlaeubigerName ?? "",
    anschrift: o.sepaGlaeubigerAnschrift ?? "",
    id: o.sepaGlaeubigerId ?? "",
  };
}
