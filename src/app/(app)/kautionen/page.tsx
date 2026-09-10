import { prisma } from "@/lib/prisma";
import { KautionenTable, type KautionRow } from "./kautionen-table";
import { KautionsbuchungenTable, type KautionsbuchungRow } from "./kautionsbuchungen-table";
import { NeueKautionsbuchungForm } from "./neue-kautionsbuchung-form";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

// Cent-Rundungstoleranz beim Vergleich zweier Beträge (z.B. Kaution.betrag gegen die Summe der
// Einzahlung-Mieter-Buchungen, oder "Einbehalten" gegen 0 beim Erledigt-Status).
const TOLERANZ = 0.01;

const STATUS_SORT: Record<KautionRow["status"], number> = { AKTIV: 0, AUFGELOEST: 1, ERLEDIGT: 2 };

async function ladeKautionen(): Promise<KautionRow[]> {
  const [kautionen, buchungen] = await Promise.all([
    prisma.kaution.findMany({
      include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    }),
    prisma.kautionBuchung.findMany({
      where: { mietvertragId: { not: null } },
      select: { mietvertragId: true, betrag: true, kategorie: true },
    }),
  ]);

  // Pro Mietvertrag nach Kategorie aufsummieren, statt einer eigenen Query pro Kaution — die
  // Gesamtmenge an Kautionsbuchungen ist klein genug, um sie einmal komplett zu laden. Mehrere
  // Auszahlungen (z.B. ein späterer Nachschlag auf einen zunächst nur teilweise ausgezahlten
  // Betrag) summieren sich hier automatisch.
  const summenProMietvertrag = new Map<
    string,
    { einzahlung: number; aufgeloest: number; ausgezahlt: number }
  >();
  for (const b of buchungen) {
    const key = b.mietvertragId!;
    const eintrag = summenProMietvertrag.get(key) ?? { einzahlung: 0, aufgeloest: 0, ausgezahlt: 0 };
    const betrag = Number(b.betrag);
    if (b.kategorie === "EINZAHLUNG_MIETER") eintrag.einzahlung += betrag;
    // Auflösung/Auszahlung kommen aus dem Kontoauszug mit ihrem tatsächlichen Vorzeichen
    // (Auflösung eingehend = positiv, Auszahlung ausgehend = negativ) — hier auf positive
    // Beträge normalisiert, damit "Einbehalten" als einfache Differenz berechnet werden kann.
    else if (b.kategorie === "AUFLOESUNG") eintrag.aufgeloest += betrag;
    else if (b.kategorie === "AUSZAHLUNG_MIETER") eintrag.ausgezahlt += Math.abs(betrag);
    summenProMietvertrag.set(key, eintrag);
  }

  return kautionen
    .map((k) => {
      const summen = summenProMietvertrag.get(k.mietvertragId);
      const betrag = Number(k.betrag);
      const einzahlungSumme = summen && summen.einzahlung > 0 ? summen.einzahlung : null;
      const aufgeloest = summen?.aufgeloest ?? 0;
      const ausgezahlt = summen?.ausgezahlt ?? 0;
      // Nur aussagekräftig, sobald überhaupt eine Auflösung stattgefunden hat — vorher ist noch
      // nichts vom Kautionskonto abgeflossen, das der Auszahlung gegenübergestellt werden könnte.
      const einbehalten = aufgeloest > 0 ? Math.round((aufgeloest - ausgezahlt) * 100) / 100 : null;
      const status: KautionRow["status"] =
        aufgeloest === 0 ? "AKTIV" : einbehalten !== null && einbehalten <= TOLERANZ ? "ERLEDIGT" : "AUFGELOEST";

      return {
        id: k.id,
        mietvertragId: k.mietvertragId,
        einheitBezeichnung: k.mietvertrag.einheit.bezeichnung,
        mieterNamen: k.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
        betrag,
        betragAbweichung: einzahlungSumme !== null && Math.abs(einzahlungSumme - betrag) > TOLERANZ,
        einzahlungSumme,
        anlageform: k.anlageform,
        zinssatz: k.zinssatz ? Number(k.zinssatz) : null,
        aufgeloest,
        ausgezahlt,
        einbehalten,
        status,
      };
    })
    .sort(
      (a, b) =>
        STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
        vergleicheEinheitBezeichnung(a.einheitBezeichnung, b.einheitBezeichnung),
    );
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
    kategorie: k.kategorie,
  }));
}

async function ladeMietvertraege(): Promise<{ id: string; label: string }[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: { einheit: true, mieter: true },
  });
  return vertraege
    .sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung))
    .map((v) => ({
      id: v.id,
      label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
    }));
}

export default async function KautionenPage() {
  const [kautionen, kautionsbuchungen, mietvertraege] = await Promise.all([
    ladeKautionen(),
    ladeKautionsbuchungen(),
    ladeMietvertraege(),
  ]);
  const offen = kautionen.filter((k) => k.status !== "ERLEDIGT");
  const aufgeloest = kautionen.filter((k) => k.status === "AUFGELOEST");
  // Für die Verbindlichkeiten-Summe zählt bei einer bereits aufgelösten Kaution nur noch der
  // tatsächlich einbehaltene Rest, nicht mehr der ursprüngliche Gesamtbetrag.
  const summeOffen = offen.reduce((s, k) => s + (k.einbehalten ?? k.betrag), 0);

  const summeJeAnlageform = offen.reduce<Record<string, number>>((acc, k) => {
    acc[k.anlageform] = (acc[k.anlageform] ?? 0) + (k.einbehalten ?? k.betrag);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Kautionen</h1>
        <p className="text-sm text-neutral-400">
          {offen.length} offene Kaution{offen.length === 1 ? "" : "en"}
          {aufgeloest.length > 0 && ` (davon ${aufgeloest.length} aufgelöst, noch nicht vollständig ausgezahlt)`}
          {kautionen.length !== offen.length && `, ${kautionen.length - offen.length} erledigt`}.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kautionsverbindlichkeiten gesamt (offen)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summeOffen)}</p>
        </div>
        {Object.entries(summeJeAnlageform).map(([anlageform, summe]) => (
          <div key={anlageform} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">davon {ANLAGEFORM_LABEL[anlageform]}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summe)}</p>
          </div>
        ))}
      </div>

      <KautionenTable rows={kautionen} />

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-white">
          Kautionsbuchungen ({kautionsbuchungen.length})
        </h2>
        <NeueKautionsbuchungForm mietvertraege={mietvertraege} />
        <KautionsbuchungenTable rows={kautionsbuchungen} />
      </div>
    </div>
  );
}
