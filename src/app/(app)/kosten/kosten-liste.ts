import { prisma } from "@/lib/prisma";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
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
  const positionen = await prisma.buchung.findMany({
    where: { ...where, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: [{ jahr: "desc" }, { erstelltAm: "desc" }],
    include: {
      kostenart: true,
      gebaeude: true,
      haus: { include: { gebaeude: true } },
      kostengruppe: true,
      einheit: { include: { gebaeude: true } },
      importBatch: true,
    },
  });

  return positionen
    .filter((k) => k.kostenart)
    .map((k) => ({
      id: k.id,
      jahr: k.jahr!,
      datum: k.datum ? k.datum.toISOString() : null,
      gebaeudeLabel: gebaeudeOderHausLabel(k.gebaeude, k.haus, k.kostengruppe, k.einheit),
      kostenartName: k.kostenart!.name,
      umlagefaehig: k.kostenart!.umlagefaehig,
      betrag: Number(k.betrag),
      empfaenger: k.empfaenger,
      beschreibung: k.verwendungszweck,
      rohdaten: (k.rohdaten as Record<string, string> | null) ?? null,
      importBatchId: k.importBatchId,
      importDateiname: k.importBatch?.dateiname ?? null,
      aufteilungGruppeId: k.aufteilungGruppeId,
      // Frühere eigene Relation virtuelleKautionBuchungId ersetzt durch den polymorphen
      // bezugTyp/bezugId-Bezug (siehe Buchung im Schema) — "Buchung" ist hier immer eine
      // Kautionsbuchung (KAUTIONSKONTO), da nur diese Gegenbuchungen auf eine Kostenposition
      // verweisen (siehe kautionen/actions.ts erstelleKautionsbuchung).
      virtuelleKautionBuchungId: k.bezugTyp === "Buchung" ? k.bezugId : null,
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
