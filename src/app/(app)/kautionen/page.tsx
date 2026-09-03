import { prisma } from "@/lib/prisma";
import { KautionenTable, type KautionRow } from "./kautionen-table";

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
    rueckzahlungsdatum: k.rueckzahlungsdatum ? k.rueckzahlungsdatum.toISOString() : null,
    rueckzahlungsbetrag: k.rueckzahlungsbetrag ? Number(k.rueckzahlungsbetrag) : null,
    status: k.status as "AKTIV" | "ZURUECKGEZAHLT",
  }));
}

export default async function KautionenPage() {
  const kautionen = await ladeKautionen();
  const aktive = kautionen.filter((k) => k.status === "AKTIV");
  const summeAktiv = aktive.reduce((s, k) => s + k.betrag, 0);

  const summeJeAnlageform = aktive.reduce<Record<string, number>>((acc, k) => {
    acc[k.anlageform] = (acc[k.anlageform] ?? 0) + k.betrag;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Kautionen</h1>
        <p className="text-sm text-neutral-400">
          {aktive.length} aktive Kaution{aktive.length === 1 ? "" : "en"}
          {kautionen.length !== aktive.length &&
            `, ${kautionen.length - aktive.length} zurückgezahlt`}
          .
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kautionsverbindlichkeiten gesamt (aktiv)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summeAktiv)}</p>
        </div>
        {Object.entries(summeJeAnlageform).map(([anlageform, summe]) => (
          <div key={anlageform} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">davon {ANLAGEFORM_LABEL[anlageform]}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summe)}</p>
          </div>
        ))}
      </div>

      <KautionenTable rows={kautionen} />
    </div>
  );
}
