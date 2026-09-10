import { prisma } from "@/lib/prisma";
import { KautionenTable, type KautionRow } from "./kautionen-table";
import { KautionsbuchungenTable, type KautionsbuchungRow } from "./kautionsbuchungen-table";
import type { KostenpositionKandidat } from "./kaution-bearbeiten-dialog";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

async function ladeKautionen(): Promise<KautionRow[]> {
  const kautionen = await prisma.kaution.findMany({
    include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    orderBy: [{ status: "asc" }, { einzahlungsdatum: "desc" }],
  });

  return kautionen.map((k) => ({
    id: k.id,
    mietvertragId: k.mietvertragId,
    einheitBezeichnung: k.mietvertrag.einheit.bezeichnung,
    mieterNamen: k.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    betrag: Number(k.betrag),
    anlageform: k.anlageform,
    zinssatz: k.zinssatz ? Number(k.zinssatz) : null,
    einzahlungsdatum: k.einzahlungsdatum ? k.einzahlungsdatum.toISOString() : null,
    aufloesungsdatum: k.aufloesungsdatum ? k.aufloesungsdatum.toISOString() : null,
    aufloesungsbetrag: k.aufloesungsbetrag ? Number(k.aufloesungsbetrag) : null,
    rueckzahlungsdatum: k.rueckzahlungsdatum ? k.rueckzahlungsdatum.toISOString() : null,
    rueckzahlungsbetrag: k.rueckzahlungsbetrag ? Number(k.rueckzahlungsbetrag) : null,
    status: k.status as "AKTIV" | "AUFGELOEST" | "ZURUECKGEZAHLT",
    notizen: k.notizen,
  }));
}

// Alle bereits mit einer Kaution verrechneten Kostenpositionen (für die "Einbehalten"-Spalte
// und die Anzeige im Bearbeiten-Dialog, gefiltert nach kautionId — siehe kautionen-table.tsx).
async function ladeVerknuepfteKostenpositionen(): Promise<KostenpositionKandidat[]> {
  const positionen = await prisma.kostenposition.findMany({
    where: { kautionId: { not: null } },
    select: {
      id: true,
      betrag: true,
      beschreibung: true,
      empfaenger: true,
      jahr: true,
      kautionId: true,
      kostenart: { select: { name: true } },
    },
  });
  return positionen.map((p) => ({
    id: p.id,
    label: `${p.jahr} — ${p.kostenart.name} — ${new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(p.betrag))}${p.beschreibung ? ` — ${p.beschreibung}` : p.empfaenger ? ` — ${p.empfaenger}` : ""}`,
    betrag: Number(p.betrag),
    kautionId: p.kautionId,
  }));
}

// Für die "verrechnen"-Suche im Bearbeiten-Dialog: alle noch nicht mit einer Kaution
// verknüpften Kostenpositionen, neueste zuerst (eine Reparatur beim Auszug ist typischerweise
// eine der zuletzt erfassten Positionen).
async function ladeUnverknuepfteKostenpositionen(): Promise<KostenpositionKandidat[]> {
  const positionen = await prisma.kostenposition.findMany({
    where: { kautionId: null },
    orderBy: [{ datum: "desc" }, { createdAt: "desc" }],
    take: 300,
    select: {
      id: true,
      betrag: true,
      beschreibung: true,
      empfaenger: true,
      jahr: true,
      kostenart: { select: { name: true } },
    },
  });
  return positionen.map((p) => ({
    id: p.id,
    label: `${p.jahr} — ${p.kostenart.name} — ${new Intl.NumberFormat("de-DE", {
      style: "currency",
      currency: "EUR",
    }).format(Number(p.betrag))}${p.beschreibung ? ` — ${p.beschreibung}` : p.empfaenger ? ` — ${p.empfaenger}` : ""}`,
    betrag: Number(p.betrag),
    kautionId: null,
  }));
}

async function ladeKautionsbuchungen(): Promise<KautionsbuchungRow[]> {
  const buchungen = await prisma.kautionBuchung.findMany({
    orderBy: { datum: "desc" },
    include: {
      mietvertrag: { include: { einheit: true, mieter: true } },
      importBatch: true,
    },
  });

  return buchungen.map((k) => ({
    id: k.id,
    mietvertragId: k.mietvertragId,
    einheitBezeichnung: k.mietvertrag?.einheit.bezeichnung ?? null,
    mieterNamen: k.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") ?? null,
    datum: k.datum.toISOString(),
    betrag: Number(k.betrag),
    empfaenger: k.empfaenger,
    verwendungszweck: k.verwendungszweck,
    rohdaten: (k.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: k.importBatchId,
    importDateiname: k.importBatch?.dateiname ?? null,
  }));
}

export default async function KautionenPage() {
  const [kautionen, kautionsbuchungen, verknuepfteKostenpositionen, kandidatenKostenpositionen] =
    await Promise.all([
      ladeKautionen(),
      ladeKautionsbuchungen(),
      ladeVerknuepfteKostenpositionen(),
      ladeUnverknuepfteKostenpositionen(),
    ]);
  // "Aktiv" im Sinne der Kennzahlen umfasst auch AUFGELOEST: das Geld ist zwar vom
  // Kautionskonto abgeflossen, aber noch nicht (vollständig) an den Mieter ausgezahlt — bis zur
  // tatsächlichen Auszahlung bleibt es eine offene Verbindlichkeit.
  const nichtAbgeschlossen = kautionen.filter((k) => k.status !== "ZURUECKGEZAHLT");
  const summeAktiv = nichtAbgeschlossen.reduce((s, k) => s + k.betrag, 0);
  const aufgeloest = kautionen.filter((k) => k.status === "AUFGELOEST");

  const summeJeAnlageform = nichtAbgeschlossen.reduce<Record<string, number>>((acc, k) => {
    acc[k.anlageform] = (acc[k.anlageform] ?? 0) + k.betrag;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Kautionen</h1>
        <p className="text-sm text-neutral-400">
          {nichtAbgeschlossen.length} offene Kaution{nichtAbgeschlossen.length === 1 ? "" : "en"}
          {aufgeloest.length > 0 && ` (davon ${aufgeloest.length} aufgelöst, noch nicht ausgezahlt)`}
          {kautionen.length !== nichtAbgeschlossen.length &&
            `, ${kautionen.length - nichtAbgeschlossen.length} zurückgezahlt`}
          .
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kautionsverbindlichkeiten gesamt (offen)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summeAktiv)}</p>
        </div>
        {Object.entries(summeJeAnlageform).map(([anlageform, summe]) => (
          <div key={anlageform} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">davon {ANLAGEFORM_LABEL[anlageform]}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summe)}</p>
          </div>
        ))}
      </div>

      <KautionenTable
        rows={kautionen}
        verknuepfteKostenpositionen={verknuepfteKostenpositionen}
        kandidatenKostenpositionen={kandidatenKostenpositionen}
      />

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-white">
          Kautionsbuchungen ({kautionsbuchungen.length})
        </h2>
        <KautionsbuchungenTable rows={kautionsbuchungen} />
      </div>
    </div>
  );
}
