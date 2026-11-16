import Link from "next/link";
import { requireUser } from "@/lib/session";
import { ladeStartseiteTickets, ladeStartseiteWerte } from "@/lib/startseite-cache";
import { GlobaleSuche } from "@/components/globale-suche";

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function DashboardPage() {
  const user = await requireUser();
  // Beide Werte kommen aus dem Zwischenspeicher (src/lib/startseite-cache.ts): Die Rechnung über
  // alle Verträge läuft nur nach einer Schreibaktion oder am nächsten Tag neu.
  const [w, tickets] = await Promise.all([ladeStartseiteWerte(), ladeStartseiteTickets(user.id)]);

  const kacheln = [
    { label: "Gebäude", value: w.gebaeude.toString() },
    { label: "Einheiten gesamt", value: w.einheiten.toString() },
    { label: "Vermietet", value: w.vermietet.toString() },
    { label: "Leerstand", value: w.leerstand.toString() },
    { label: "Sollmiete kalt / Monat", value: formatEuro(w.sollKaltmiete) },
    { label: "BK-Vorauszahlung / Monat", value: formatEuro(w.sollNebenkosten) },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {w.objektZeile ?? "Kein Objekt angelegt"}
      </p>

      <GlobaleSuche />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kacheln.map((k) => (
          <div key={k.label} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">{k.label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{k.value}</p>
          </div>
        ))}
        <Link href="/miete-monat" className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900">
          <p className="text-xs text-neutral-400">
            Mieten {MONATSNAMEN[w.mietenMonat - 1]} {w.mietenJahr}
          </p>
          <p className="mt-1 text-xl font-semibold text-white">
            {w.mietenBezahlt} von {w.mietenAnzahl} bezahlt
          </p>
          {w.mietenUnbezahlt > 0 ? (
            <p className="text-xs text-red-400">
              {w.mietenUnbezahlt} offen · {formatEuro(w.mietenOffenBetrag)}
            </p>
          ) : (
            <p className="text-xs text-green-400">Alles bezahlt</p>
          )}
        </Link>
        <Link
          href="/offene-posten"
          className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
        >
          <p className="text-xs text-neutral-400">Offene Posten gesamt</p>
          <p
            className={`mt-1 text-xl font-semibold ${w.gesamtRueckstand < 0 ? "text-red-400" : "text-white"}`}
          >
            {formatEuro(w.gesamtRueckstand)}
          </p>
        </Link>
        <Link
          href="/kautionen"
          className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
        >
          <p className="text-xs text-neutral-400">Kautionen gesamt (aktiv)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(w.summeKautionen)}</p>
        </Link>
        <Link href="/tickets" className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900">
          <p className="text-xs text-neutral-400">Offene Tickets</p>
          <p className="mt-1 text-xl font-semibold text-white">{tickets.offen}</p>
          {tickets.ueberfaellig > 0 && <p className="text-xs text-red-400">{tickets.ueberfaellig} überfällig</p>}
        </Link>
      </div>
    </div>
  );
}
