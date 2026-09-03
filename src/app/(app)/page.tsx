import { prisma } from "@/lib/prisma";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function DashboardPage() {
  const [objekt, gebaeudeCount, einheitenCount, aktiveVertraege] = await Promise.all([
    prisma.objekt.findFirst(),
    prisma.gebaeude.count(),
    prisma.einheit.count(),
    prisma.mietvertrag.findMany({
      where: { status: "AKTIV" },
      select: { einheitId: true, kaltmiete: true, nebenkostenVorauszahlung: true },
    }),
  ]);

  const belegteEinheiten = new Set(aktiveVertraege.map((v) => v.einheitId)).size;
  const leerstand = einheitenCount - belegteEinheiten;
  const sollKaltmiete = aktiveVertraege.reduce((sum, v) => sum + Number(v.kaltmiete), 0);
  const sollNebenkosten = aktiveVertraege.reduce(
    (sum, v) => sum + Number(v.nebenkostenVorauszahlung),
    0,
  );

  const kacheln = [
    { label: "Gebäude", value: gebaeudeCount.toString() },
    { label: "Einheiten gesamt", value: einheitenCount.toString() },
    { label: "Vermietet", value: belegteEinheiten.toString() },
    { label: "Leerstand", value: leerstand.toString() },
    { label: "Sollmiete kalt / Monat", value: formatEuro(sollKaltmiete) },
    { label: "NK-Vorauszahlung / Monat", value: formatEuro(sollNebenkosten) },
  ];

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-white">Dashboard</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {objekt ? `${objekt.name} · ${objekt.strasse} ${objekt.hausnummer}, ${objekt.plz} ${objekt.ort}` : "Kein Objekt angelegt"}
      </p>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {kacheln.map((k) => (
          <div key={k.label} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">{k.label}</p>
            <p className="mt-1 text-xl font-semibold text-white">{k.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
