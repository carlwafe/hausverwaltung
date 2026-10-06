import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { VpiForm } from "./vpi-form";
import { loescheVpi } from "./actions";

const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

export default async function VpiWertePage() {
  const werte = await prisma.verbraucherpreisindex.findMany({
    orderBy: [{ jahr: "desc" }, { monat: "desc" }],
  });
  const heute = new Date();
  // Veröffentlichung etwa Monatsmitte für den Vormonat → Vorschlag: Vormonat
  const vor = new Date(heute.getFullYear(), heute.getMonth() - 1, 1);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">VPI-Werte</h1>
        <p className="text-sm text-neutral-400">
          Verbraucherpreisindex für Deutschland (Gesamtindex, Statistisches Bundesamt) als Grundlage der
          Indexmiete (§ 557b BGB). Die Werte werden von Hand aus der Destatis-Tabelle 61111-0002
          eingetragen; ein vorhandener Monat wird überschrieben. Alle Werte müssen auf demselben
          Basisjahr stehen (aktuell 2020 = 100) — Werte aus älterem Basisjahr vorher umrechnen.{" "}
          <Link href="/mietvertraege/moegliche-erhoehungen" className="underline">
            Zurück zu „Mieterhöhung“
          </Link>
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <VpiForm jahr={vor.getFullYear()} monat={vor.getMonth() + 1} />
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Monat</th>
              <th className="px-4 py-2 text-right">Indexwert</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {werte.map((w) => (
              <tr key={w.id} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-white">
                  {MONATE[w.monat - 1]} {w.jahr}
                </td>
                <td className="px-4 py-2 text-right text-neutral-300">
                  {Number(w.wert).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 3 })}
                </td>
                <td className="px-4 py-2 text-right">
                  <form action={loescheVpi}>
                    <input type="hidden" name="id" value={w.id} />
                    <button type="submit" className="text-xs text-red-400 hover:underline">
                      Löschen
                    </button>
                  </form>
                </td>
              </tr>
            ))}
            {werte.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Werte eingetragen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
