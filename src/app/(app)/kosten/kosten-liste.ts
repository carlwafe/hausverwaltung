import { prisma } from "@/lib/prisma";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import type { KostenpositionRow } from "./kosten-table";
import type { NichtZugeordneteBuchungRow } from "./nicht-zugeordnete-buchungen-table";

// Die einzigen Kostenarten, die Reparaturen/Sanierungs-/Modernisierungsarbeiten abbilden (siehe
// Kostenarten-Verwaltung) — genutzt, um auf den Einheit-/Haus-/Gebäude-/Objekt-Seiten gezielt nur
// diese anzuzeigen statt aller dort zugeordneten Kostenpositionen (z.B. Grundsteuer, Heizkosten).
export const REPARATUR_SANIERUNG_KOSTENART_NAMEN = [
  "Reparaturen",
  "Sanierungsarbeiten",
  "Modernisierung/Ausstattung",
];

export async function ladeKosten(where: {
  gebaeudeId?: string | null;
  hausId?: string | null;
  kostengruppeId?: string | null;
  einheitId?: string | null;
  kostenart?: { name: { in: string[] } };
} = {}): Promise<KostenpositionRow[]> {
  const positionen = await prisma.kostenposition.findMany({
    where,
    orderBy: [{ jahr: "desc" }, { createdAt: "desc" }],
    include: {
      kostenart: true,
      gebaeude: true,
      haus: { include: { gebaeude: true } },
      kostengruppe: true,
      einheit: { include: { gebaeude: true } },
      importBatch: true,
    },
  });

  return positionen.map((k) => ({
    id: k.id,
    jahr: k.jahr,
    datum: k.datum ? k.datum.toISOString() : null,
    gebaeudeLabel: gebaeudeOderHausLabel(k.gebaeude, k.haus, k.kostengruppe, k.einheit),
    kostenartName: k.kostenart.name,
    umlagefaehig: k.kostenart.umlagefaehig,
    betrag: Number(k.betrag),
    empfaenger: k.empfaenger,
    beschreibung: k.beschreibung,
    rohdaten: (k.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: k.importBatchId,
    importDateiname: k.importBatch?.dateiname ?? null,
    aufteilungGruppeId: k.aufteilungGruppeId,
    virtuelleKautionBuchungId: k.virtuelleKautionBuchungId,
  }));
}

// Beim Kontoauszug-Import bewusst als "nicht kategorisiert" geparkte Buchungen (siehe
// parkeAlsNichtKategorisiert in kontoauszug/import/actions.ts) — werden oben auf /kosten zur
// späteren Zuordnung angezeigt, unabhängig vom regulären Kostenpositionen-Bestand.
export async function ladeNichtZugeordneteBuchungen(): Promise<NichtZugeordneteBuchungRow[]> {
  const buchungen = await prisma.nichtZugeordneteBuchung.findMany({
    orderBy: { datum: "desc" },
    include: { importBatch: true },
  });

  return buchungen.map((b) => ({
    id: b.id,
    datum: b.datum.toISOString(),
    betrag: Number(b.betrag),
    empfaenger: b.empfaenger,
    verwendungszweck: b.verwendungszweck,
    quelle: b.quelle,
    rohdaten: (b.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: b.importBatchId,
    importDateiname: b.importBatch?.dateiname ?? null,
  }));
}
