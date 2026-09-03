import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { berechneSoll, berechneIst } from "@/lib/soll-ist";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function DashboardPage() {
  const [objekt, gebaeudeCount, einheitenCount, aktiveVertraege, abrechenbareVertraege, aktiveKautionen] =
    await Promise.all([
      prisma.objekt.findFirst(),
      prisma.gebaeude.count(),
      prisma.einheit.count(),
      prisma.mietvertrag.findMany({
        where: { status: "AKTIV" },
        select: { einheitId: true, kaltmiete: true, nebenkostenVorauszahlung: true },
      }),
      prisma.mietvertrag.findMany({
        where: { status: { in: ["AKTIV", "BEENDET"] } },
        select: {
          beginn: true,
          ende: true,
          kaltmiete: true,
          nebenkostenVorauszahlung: true,
          mehrwertsteuer: true,
          zahlungen: { select: { datum: true, betrag: true } },
        },
      }),
      prisma.kaution.findMany({ where: { status: "AKTIV" }, select: { betrag: true } }),
    ]);

  const summeKautionen = aktiveKautionen.reduce((sum, k) => sum + Number(k.betrag), 0);

  const belegteEinheiten = new Set(aktiveVertraege.map((v) => v.einheitId)).size;
  const leerstand = einheitenCount - belegteEinheiten;
  const sollKaltmiete = aktiveVertraege.reduce((sum, v) => sum + Number(v.kaltmiete), 0);
  const sollNebenkosten = aktiveVertraege.reduce(
    (sum, v) => sum + Number(v.nebenkostenVorauszahlung),
    0,
  );

  const buchhaltungAb = objekt?.buchhaltungAb ?? null;
  const gesamtRueckstand = abrechenbareVertraege.reduce((sum, v) => {
    const soll = berechneSoll(
      {
        beginn: v.beginn,
        ende: v.ende,
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
      },
      new Date(),
      buchhaltungAb,
    );
    const ist = berechneIst(
      v.zahlungen.map((z) => ({ datum: z.datum, betrag: Number(z.betrag) })),
      buchhaltungAb,
    );
    const saldo = ist - soll;
    return sum + Math.min(saldo, 0);
  }, 0);

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
        <Link
          href="/offene-posten"
          className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
        >
          <p className="text-xs text-neutral-400">Offene Posten gesamt</p>
          <p
            className={`mt-1 text-xl font-semibold ${gesamtRueckstand < 0 ? "text-red-400" : "text-white"}`}
          >
            {formatEuro(gesamtRueckstand)}
          </p>
        </Link>
        <Link
          href="/kautionen"
          className="rounded-lg border border-neutral-800 p-4 hover:bg-neutral-900"
        >
          <p className="text-xs text-neutral-400">Kautionen gesamt (aktiv)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summeKautionen)}</p>
        </Link>
      </div>
    </div>
  );
}
