import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { BelegBadge } from "@/components/beleg-badge";
import { ladeBelegPruefung, fasseBelegPruefungZusammen } from "@/lib/beleg-pruefung";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date | null) {
  return d ? new Intl.DateTimeFormat("de-DE").format(d) : "–";
}

// Belegprüfung: Der Mieter darf die Belege zur Abrechnung einsehen — hier steht, welche umlagefähigen Kostenpositionen
// des Kostenjahres schon ein Dokument haben und welche noch nicht. Nur lesend; Belege werden an der Kostenposition
// hochgeladen oder im Eingang der Ablage zugeordnet, „Kein Beleg nötig“ ebenfalls an der Kostenposition.
export default async function BelegPruefungPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({
    where: { id },
    select: { id: true, jahr: true, versendetAm: true },
  });
  if (!abrechnung) notFound();

  const { zeilen, inTechem } = await ladeBelegPruefung(abrechnung.jahr);
  const z = fasseBelegPruefungZusammen(zeilen);
  const fehlend = zeilen.filter((r) => r.status === "FEHLT");

  const kostenarten = new Map<string, { gesamt: number; belegt: number; ausnahme: number; fehlt: number; betrag: number; betragFehlt: number }>();
  for (const r of zeilen) {
    const k = kostenarten.get(r.kostenartName) ?? { gesamt: 0, belegt: 0, ausnahme: 0, fehlt: 0, betrag: 0, betragFehlt: 0 };
    k.gesamt++;
    k.betrag += r.betrag;
    if (r.status === "BELEGT") k.belegt++;
    else if (r.status === "AUSNAHME") k.ausnahme++;
    else {
      k.fehlt++;
      k.betragFehlt += r.betrag;
    }
    kostenarten.set(r.kostenartName, k);
  }
  const kostenartZeilen = [...kostenarten.entries()].sort((a, b) => b[1].fehlt - a[1].fehlt || a[0].localeCompare(b[0], "de"));

  return (
    <div>
      <Link href={`/nebenkostenabrechnungen/${id}`} className="mb-2 inline-block text-sm text-neutral-400 hover:text-white">
        ← Nebenkostenabrechnung {abrechnung.jahr}
      </Link>
      <h1 className="text-2xl font-semibold text-white">Belegprüfung {abrechnung.jahr}</h1>
      <p className="mb-6 max-w-3xl text-sm text-neutral-400">
        Der Mieter darf die Belege zur Abrechnung einsehen. Jede umlagefähige Kostenposition des Kostenjahres {abrechnung.jahr}{" "}
        sollte deshalb ein Dokument haben (Rechnung, Bescheid, Abrechnung) — oder bewusst als „Kein Beleg nötig“ markiert
        sein. Belege laden Sie an der Kostenposition hoch oder ordnen sie im Eingang der Dokumentenablage zu.
      </p>

      <div className="mb-6 grid max-w-3xl grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Positionen</p>
          <p className="mt-1 text-lg font-semibold text-white">{z.gesamt}</p>
          <p className="text-xs text-neutral-500">{formatEuro(z.betragGesamt)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Mit Beleg</p>
          <p className="mt-1 text-lg font-semibold text-green-400">{z.belegt}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kein Beleg nötig</p>
          <p className="mt-1 text-lg font-semibold text-blue-400">{z.ausnahme}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Beleg fehlt</p>
          <p className={`mt-1 text-lg font-semibold ${z.fehlt > 0 ? "text-amber-400" : "text-green-400"}`}>{z.fehlt}</p>
          <p className="text-xs text-neutral-500">{formatEuro(z.betragFehlt)}</p>
        </div>
      </div>
      {inTechem > 0 && (
        <p className="mb-6 max-w-3xl text-xs text-neutral-500">
          Nicht gezählt: {inTechem} Position{inTechem === 1 ? "" : "en"} in der Techem-Abrechnung enthalten (Gas, Allgemeinstrom,
          Wasser/Abwasser über Techem) — dort ist die Techem-Abrechnung der Beleg.
        </p>
      )}

      <h2 className="mb-2 text-lg font-medium text-white">Ohne Beleg ({fehlend.length})</h2>
      {fehlend.length === 0 ? (
        <p className="mb-8 text-sm text-green-400">Alle umlagefähigen Positionen sind belegt oder markiert.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-800">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-neutral-800 text-xs text-neutral-400">
              <tr>
                <th className="px-3 py-2 font-medium">Datum</th>
                <th className="px-3 py-2 font-medium">Kostenart</th>
                <th className="px-3 py-2 font-medium">Gebäude</th>
                <th className="px-3 py-2 font-medium">Empfänger</th>
                <th className="px-3 py-2 font-medium">Beschreibung</th>
                <th className="px-3 py-2 text-right font-medium">Betrag</th>
                <th className="px-3 py-2 font-medium">Beleg</th>
              </tr>
            </thead>
            <tbody>
              {fehlend.map((r) => (
                <tr key={r.id} className="border-b border-neutral-900 last:border-0">
                  <td className="whitespace-nowrap px-3 py-2">
                    <Link prefetch={false} href={`/kosten/${r.id}`} className="font-medium text-white hover:underline">
                      {formatDate(r.datum)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-neutral-200">{r.kostenartName}</td>
                  <td className="px-3 py-2 text-neutral-300">{r.gebaeudeLabel}</td>
                  <td className="px-3 py-2 text-neutral-300">{r.empfaenger || "–"}</td>
                  <td className="max-w-xs truncate px-3 py-2 text-neutral-400" title={r.beschreibung ?? undefined}>
                    {r.beschreibung || "–"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-200">{formatEuro(r.betrag)}</td>
                  <td className="px-3 py-2">
                    <BelegBadge status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-2 text-lg font-medium text-white">Nach Kostenart</h2>
      <div className="mb-8 overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-neutral-800 text-xs text-neutral-400">
            <tr>
              <th className="px-3 py-2 font-medium">Kostenart</th>
              <th className="px-3 py-2 text-right font-medium">Positionen</th>
              <th className="px-3 py-2 text-right font-medium">Mit Beleg</th>
              <th className="px-3 py-2 text-right font-medium">Kein Beleg nötig</th>
              <th className="px-3 py-2 text-right font-medium">Fehlt</th>
              <th className="px-3 py-2 text-right font-medium">Betrag</th>
              <th className="px-3 py-2 text-right font-medium">davon ohne Beleg</th>
            </tr>
          </thead>
          <tbody>
            {kostenartZeilen.map(([name, k]) => (
              <tr key={name} className="border-b border-neutral-900 last:border-0">
                <td className="px-3 py-2 text-neutral-200">{name}</td>
                <td className="px-3 py-2 text-right text-neutral-300">{k.gesamt}</td>
                <td className="px-3 py-2 text-right text-green-400">{k.belegt}</td>
                <td className="px-3 py-2 text-right text-blue-400">{k.ausnahme}</td>
                <td className={`px-3 py-2 text-right ${k.fehlt > 0 ? "text-amber-400" : "text-neutral-500"}`}>{k.fehlt}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-200">{formatEuro(k.betrag)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-neutral-400">
                  {k.betragFehlt > 0 ? formatEuro(k.betragFehlt) : "–"}
                </td>
              </tr>
            ))}
            {kostenartZeilen.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-4 text-center text-neutral-500">
                  Keine umlagefähigen Kostenpositionen für {abrechnung.jahr}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-neutral-500">
        Gezählt werden aktive, umlagefähige Kostenpositionen mit Kostenjahr {abrechnung.jahr}. Bei aufgeteilten Positionen
        genügt ein Beleg an einem der Teile (z.B. die Jahresabrechnung der Stadtwerke). Ausgeblendete Dokumente zählen nicht.
      </p>
    </div>
  );
}
