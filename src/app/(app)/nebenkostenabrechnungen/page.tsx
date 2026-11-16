import { prisma } from "@/lib/prisma";
import { AbrechnungenTable, type AbrechnungZeile } from "./abrechnungen-table";
import { NeueAbrechnungForm } from "./neue-abrechnung-form";

const DATUM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin" });

export default async function NebenkostenabrechnungenPage() {
  // Summen je Abrechnung in einer Abfrage statt alle Positionen zu laden.
  const [abrechnungen, summen] = await Promise.all([
    prisma.nebenkostenabrechnung.findMany({ orderBy: { jahr: "desc" } }),
    prisma.nebenkostenabrechnungPosition.groupBy({
      by: ["abrechnungId"],
      _count: { _all: true },
      _sum: { kostenanteilGesamt: true, vorauszahlungGesamt: true, saldo: true },
    }),
  ]);
  const summeJeAbrechnung = new Map(summen.map((s) => [s.abrechnungId, s]));

  const rows: AbrechnungZeile[] = abrechnungen.map((a) => {
    const s = summeJeAbrechnung.get(a.id);
    return {
      id: a.id,
      jahr: a.jahr,
      status: a.status,
      manuell: a.manuell,
      versendetAm: a.versendetAm ? DATUM.format(a.versendetAm) : null,
      erstelltAm: DATUM.format(a.erstelltAm),
      positionen: s?._count._all ?? 0,
      kostenanteil: Number(s?._sum.kostenanteilGesamt ?? 0),
      vorauszahlung: Number(s?._sum.vorauszahlungGesamt ?? 0),
      saldo: Number(s?._sum.saldo ?? 0),
    };
  });

  // Vorbelegung: das Vorjahr, solange es dafür noch keine Abrechnung gibt — sonst leer, damit der
  // Knopf nicht sofort in „existiert bereits“ läuft.
  const vorjahr = new Date().getFullYear() - 1;
  const vorschlagJahr = abrechnungen.some((a) => a.jahr === vorjahr) ? null : vorjahr;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Betriebskostenabrechnung</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Eine Abrechnung pro Jahr fürs ganze Objekt — verteilt die umlagefähigen Kosten nach Verteilerschlüssel auf
          alle Einheiten.
        </p>
      </div>

      <AbrechnungenTable rows={rows} />

      <section className="mt-8 rounded-lg border border-neutral-800 p-4">
        <h2 className="mb-3 text-sm font-semibold text-white">Neue Abrechnung</h2>
        <NeueAbrechnungForm vorschlagJahr={vorschlagJahr} />
      </section>
    </div>
  );
}
