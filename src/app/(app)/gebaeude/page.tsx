import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { hausLabel } from "@/lib/gebaeude-gruppen";
import { GebaeudeTable, type GebaeudeRow } from "./gebaeude-table";

function ladeGebaeudeRows(gebaeudeRaw: Awaited<ReturnType<typeof ladeGebaeudeRaw>>): GebaeudeRow[] {
  const sortiert = [...gebaeudeRaw].sort((a, b) => {
    const strasseCompare = a.strasse.localeCompare(b.strasse);
    if (strasseCompare !== 0) return strasseCompare;
    return Number(a.hausnummer) - Number(b.hausnummer);
  });

  return sortiert.map((g) => ({
    id: g.id,
    strasse: g.strasse,
    haus: g.haus
      ? g.haus.gebaeude
          .map((m) => m.hausnummer)
          .sort((a, b) => Number(a) - Number(b))
          .join(", ")
      : null,
    hausId: g.hausId,
    hausnummer: g.hausnummer,
    einheitenCount: g._count.einheiten,
  }));
}

function ladeGebaeudeRaw() {
  return prisma.gebaeude.findMany({
    include: { _count: { select: { einheiten: true } }, haus: { include: { gebaeude: true } } },
  });
}

export default async function GebaeudePage() {
  const gebaeudeRaw = await ladeGebaeudeRaw();
  const gebaeude = ladeGebaeudeRows(gebaeudeRaw);

  // Das eigentliche physische Gebäude ist "Haus" (mehrere Hausnummern desselben Bauwerks, z.B.
  // "Breslauer Str. 2, 4, 6") — die 16 einzelnen Adressen (DB-Modell "Gebaeude", je eine
  // Hausnummer) flach untereinander zu listen macht das für den Nutzer unnötig unübersichtlich.
  // Diese Seite gruppiert deshalb primär nach Haus; die einzelne Adresse bleibt über die
  // Haus-Detailseite bzw. die ausklappbare Volltabelle unten weiter erreichbar.
  const gruppen = new Map<string, GebaeudeRow[]>();
  const ohneHaus: GebaeudeRow[] = [];
  for (const g of gebaeude) {
    if (g.hausId) {
      const liste = gruppen.get(g.hausId) ?? [];
      liste.push(g);
      gruppen.set(g.hausId, liste);
    } else {
      ohneHaus.push(g);
    }
  }
  const hausGruppen = [...gruppen.entries()]
    .map(([hausId, mitglieder]) => ({
      hausId,
      label: hausLabel(mitglieder),
      einheitenGesamt: mitglieder.reduce((sum, g) => sum + g.einheitenCount, 0),
      mitglieder: mitglieder.sort((a, b) => Number(a.hausnummer) - Number(b.hausnummer)),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "de"));

  const gesamtEinheiten = gebaeude.reduce((sum, g) => sum + g.einheitenCount, 0);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Gebäude</h1>
          <p className="text-sm text-neutral-400">
            {hausGruppen.length} Gebäude mit insgesamt {gebaeude.length} Hausnummern und{" "}
            {gesamtEinheiten} Einheiten
            {ohneHaus.length > 0 && `, plus ${ohneHaus.length} weitere Adresse${ohneHaus.length === 1 ? "" : "n"} ohne Haus-Zuordnung`}
          </p>
        </div>
        <Link
          href="/gebaeude/neu"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          + Neue Hausnummer
        </Link>
      </div>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {hausGruppen.map((h) => (
          <Link
            key={h.hausId}
            href={`/haeuser/${h.hausId}`}
            className="rounded-lg border border-neutral-800 p-4 hover:border-neutral-600 hover:bg-neutral-900"
          >
            <p className="text-sm font-medium text-white">{h.label}</p>
            <p className="mt-1 text-xs text-neutral-400">
              {h.mitglieder.length} Hausnummern · {h.einheitenGesamt} Einheiten
            </p>
          </Link>
        ))}
      </div>

      {ohneHaus.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-medium text-white">Weitere Adressen (kein Haus zugeordnet)</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {ohneHaus.map((g) => (
              <Link
                key={g.id}
                href={`/gebaeude/${g.id}`}
                className="rounded-lg border border-neutral-800 p-4 hover:border-neutral-600 hover:bg-neutral-900"
              >
                <p className="text-sm font-medium text-white">
                  {g.strasse} {g.hausnummer}
                </p>
                <p className="mt-1 text-xs text-neutral-400">{g.einheitenCount} Einheiten</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      <details className="rounded-lg border border-neutral-800 p-4">
        <summary className="cursor-pointer text-sm font-medium text-white">
          Alle Hausnummern einzeln ({gebaeude.length})
        </summary>
        <div className="mt-4">
          <GebaeudeTable rows={gebaeude} />
        </div>
      </details>
    </div>
  );
}
