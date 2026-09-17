import Link from "next/link";
import { prisma } from "@/lib/prisma";

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

// Ein Jahr auf ein Datum addieren — bewusst mit UTC-Gettern/-Constructor statt lokalen (wie z.B.
// gueltigAb aus einem <input type="date"> als UTC-Mitternacht gespeichert wird): mit lokalen
// Gettern würde das Ergebnis je nach Server-Zeitzone um einen Tag verschoben sein. JS normalisiert
// Datumsüberläufe (z.B. 29. Februar) automatisch korrekt.
function plusEinJahr(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
}

function monateBis(heute: Date, ziel: Date): number {
  return (ziel.getUTCFullYear() - heute.getUTCFullYear()) * 12 + (ziel.getUTCMonth() - heute.getUTCMonth());
}

type Zeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  referenzDatum: Date;
  referenzQuelle: "Mietbeginn" | "letzte Mieterhöhung";
  naechsteMoeglich: Date;
  bereitsMoeglich: boolean;
};

async function ladeZeilen(): Promise<Zeile[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: "AKTIV" },
    include: {
      einheit: true,
      mieter: true,
      mieterhoehungen: { orderBy: { gueltigAb: "desc" }, take: 1 },
    },
  });

  const heute = new Date();
  const zeilen: Zeile[] = [];

  for (const v of vertraege) {
    // Ausgangspunkt laut Indexmiete-Klausel: das Datum der letzten Mietanpassung, oder — falls
    // noch nie angepasst — der Mietbeginn. Ein unbekannter Mietbeginn lässt sich nicht berechnen.
    const letzteMieterhoehung = v.mieterhoehungen[0];
    const referenzDatum = letzteMieterhoehung?.gueltigAb ?? v.beginn;
    if (!referenzDatum) continue;

    const naechsteMoeglich = plusEinJahr(referenzDatum);
    zeilen.push({
      mietvertragId: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") || "– ohne Mieter –",
      referenzDatum,
      referenzQuelle: letzteMieterhoehung ? "letzte Mieterhöhung" : "Mietbeginn",
      naechsteMoeglich,
      bereitsMoeglich: naechsteMoeglich <= heute,
    });
  }

  return zeilen.sort((a, b) => a.naechsteMoeglich.getTime() - b.naechsteMoeglich.getTime());
}

export default async function MoeglicheErhoehungenPage() {
  const zeilen = await ladeZeilen();
  const heute = new Date();
  const bereitsMoeglich = zeilen.filter((z) => z.bereitsMoeglich).length;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Mieterhöhung möglich ab</h1>
        <p className="text-sm text-neutral-400">
          Laut Indexmiete-Klausel (§ 557b BGB) muss die Miete seit der letzten Anpassung
          mindestens ein Jahr unverändert geblieben sein. Ausgangspunkt ist die letzte erfasste
          Mieterhöhung — oder, falls noch keine erfolgt ist, der Mietbeginn. Nur aktive
          Mietverträge mit bekanntem Mietbeginn werden gezeigt.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Bereits jetzt möglich</p>
        <p className={`mt-1 text-lg font-semibold ${bereitsMoeglich > 0 ? "text-green-400" : "text-white"}`}>
          {bereitsMoeglich} von {zeilen.length}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Letzte Anpassung</th>
              <th className="px-4 py-2">Mieterhöhung möglich ab</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.mietvertragId} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/mietvertraege/${z.mietvertragId}`} className="font-medium hover:underline">
                    {z.einheitBezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-300">{z.mieterNamen}</td>
                <td className="px-4 py-2 text-neutral-300">
                  {formatDate(z.referenzDatum)}{" "}
                  <span className="text-xs text-neutral-500">({z.referenzQuelle})</span>
                </td>
                <td className="px-4 py-2 text-white">{formatDate(z.naechsteMoeglich)}</td>
                <td className="px-4 py-2">
                  {z.bereitsMoeglich ? (
                    <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">
                      jetzt möglich
                    </span>
                  ) : (
                    <span className="text-xs text-neutral-500">
                      noch {monateBis(heute, z.naechsteMoeglich)} Monat
                      {monateBis(heute, z.naechsteMoeglich) === 1 ? "" : "e"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  Keine aktiven Mietverträge mit bekanntem Mietbeginn.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
