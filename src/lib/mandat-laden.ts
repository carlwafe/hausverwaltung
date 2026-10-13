import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { GLAEUBIGER_LEER, type MandatGlaeubiger, type MandatVertrag } from "@/lib/sepa-mandat";

export type MandatZeile = MandatVertrag & {
  einheitRang: number;
  zahlungsweg: "LASTSCHRIFT" | "UEBERWEISUNG" | null;
  geplant: boolean;
  /** Am Vertrag erfasstes, bereits bestehendes Mandat (null = keines erfasst). */
  mandatReferenz: string | null;
  mandatDatum: string | null; // ISO
};

/** Mietverträge mit den Angaben für die Mandatsformulare (temporär, siehe `sepa-mandat.ts`), in Haus-Reihenfolge. */
export async function ladeMandatZeilen(where: Prisma.MietvertragWhereInput): Promise<MandatZeile[]> {
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
