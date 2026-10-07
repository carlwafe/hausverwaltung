import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { sollAufschluesselung, mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { mieterName } from "@/lib/mieter-name";
import { effektiverStichtag } from "@/lib/buchhaltung-stichtag";
import { MieteMonatTable, type MieteMonatRow } from "./miete-monat-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const MONATSNAMEN = [
  "Januar", "Februar", "März", "April", "Mai", "Juni",
  "Juli", "August", "September", "Oktober", "November", "Dezember",
];

function monatParam(jahr: number, monat: number) {
  return `${jahr}-${String(monat).padStart(2, "0")}`;
}

function verschiebe(jahr: number, monat: number, delta: number) {
  const index = jahr * 12 + (monat - 1) + delta;
  return { jahr: Math.floor(index / 12), monat: (index % 12) + 1 };
}

export default async function MieteMonatPage({
  searchParams,
}: {
  searchParams: Promise<{ monat?: string; alle?: string }>;
}) {
  const { monat: monatQuery, alle } = await searchParams;
  const heute = new Date();
  const aktuellerIndex = heute.getFullYear() * 12 + heute.getMonth();

  // Gewählter Monat (YYYY-MM); ohne/ungültig oder in der Zukunft → aktueller Monat.
  const treffer = /^(\d{4})-(\d{2})$/.exec(monatQuery ?? "");
  let jahr = heute.getFullYear();
  let monat = heute.getMonth() + 1;
  if (treffer) {
    const j = Number(treffer[1]);
    const m = Number(treffer[2]);
    if (m >= 1 && m <= 12 && j * 12 + (m - 1) <= aktuellerIndex) {
      jahr = j;
      monat = m;
    }
  }
  const istAktuellerMonat = jahr * 12 + (monat - 1) === aktuellerIndex;
  const alleAnzeigen = alle === "1";

  const objekt = await prisma.objekt.findFirst({ select: { buchhaltungAb: true } });
  const monatsEnde = new Date(jahr, monat, 0);

  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: {
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      mieter: true,
      mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
      mietnachlaesse: { select: { jahr: true, monat: true, betrag: true } },
    },
  });

  // Zahlungen nach Mietperiode (ohne Periode: Monat des Buchungsdatums), wie in den Offenen Posten.
  const zahlungen = await prisma.buchung.findMany({
    where: {
      ...AKTIVE_BUCHUNG_FILTER,
      mietvertragId: { in: vertraege.map((v) => v.id) },
      buchungsart: { code: "MIETZAHLUNG" },
    },
    select: { mietvertragId: true, datum: true, betrag: true, periodeMonat: true, periodeJahr: true },
  });
  const gezahlt = new Map<string, number>();
  for (const z of zahlungen) {
    if (!z.mietvertragId || !z.datum) continue;
    const pJahr = z.periodeJahr && z.periodeMonat ? z.periodeJahr : z.datum.getFullYear();
    const pMonat = z.periodeJahr && z.periodeMonat ? z.periodeMonat : z.datum.getMonth() + 1;
    if (pJahr !== jahr || pMonat !== monat) continue;
    gezahlt.set(z.mietvertragId, (gezahlt.get(z.mietvertragId) ?? 0) + Number(z.betrag));
  }

  const einheitRang = new Map(
    sortEinheitenNachGebaeude(
      vertraege.map((v) => ({ id: v.id, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude })),
    ).map((v, i) => [v.id, i]),
  );

  const alleZeilen: MieteMonatRow[] = [];
  for (const v of vertraege) {
    // Stichtag je Vertrag: eigener (früherer) oder der des Objekts.
    const buchhaltungAb = effektiverStichtag(v, objekt);
    const sollZeile = sollAufschluesselung(
      {
        beginn: v.beginn,
        ende: v.ende,
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
        mieterhoehungen: v.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
        mietnachlaesse: mietnachlaesseFuerSoll(v.mietnachlaesse),
      },
      monatsEnde,
      buchhaltungAb,
    ).find((z) => z.jahr === jahr && z.monat === monat);
    if (!sollZeile || sollZeile.betrag <= 0) continue;

    const ist = gezahlt.get(v.id) ?? 0;
    const offen = Math.round((sollZeile.betrag - ist) * 100) / 100;
    const faelligAm = sollZeile.faelligAm;
    const faellig = !istAktuellerMonat || heute >= faelligAm;
    const status: MieteMonatRow["status"] =
      offen <= 0 ? "bezahlt" : !faellig ? "nichtFaellig" : ist > 0 ? "teilweise" : "offen";

    alleZeilen.push({
      id: v.id,
      einheit: v.einheit.bezeichnung,
      einheitRang: einheitRang.get(v.id) ?? 0,
      mieter: v.mieter.map((m) => mieterName(m)).join(" & "),
      zahlungsweg: v.zahlungsweg === "LASTSCHRIFT" ? "Lastschrift" : v.zahlungsweg === "UEBERWEISUNG" ? "Überweisung" : "",
      faelligAm: formatDatum(faelligAm),
      soll: sollZeile.betrag,
      ist,
      offen,
      status,
    });
  }
  alleZeilen.sort((a, b) => a.einheitRang - b.einheitRang);

  const unbezahlt = alleZeilen.filter((z) => z.status === "offen" || z.status === "teilweise");
  const summeOffen = unbezahlt.reduce((s, z) => s + z.offen, 0);
  const anzahlBezahlt = alleZeilen.filter((z) => z.status === "bezahlt").length;
  const zeilen = alleAnzeigen ? alleZeilen : alleZeilen.filter((z) => z.status !== "bezahlt");

  const vorher = verschiebe(jahr, monat, -1);
  const nachher = verschiebe(jahr, monat, 1);
  const linkKlasse = "rounded-md border border-neutral-700 px-3 py-1.5 text-sm text-white hover:bg-neutral-900";
  const basis = (m: { jahr: number; monat: number }, mitAlle = alleAnzeigen) =>
    `/miete-monat?monat=${monatParam(m.jahr, m.monat)}${mitAlle ? "&alle=1" : ""}`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Miete diesen Monat</h1>
        <p className="text-sm text-neutral-400">
          Wer hat die Miete (Kaltmiete + Nebenkosten-Vorauszahlung) für den gewählten Monat noch nicht
          vollständig gezahlt? Gezählt werden Mietzahlungen nach Mietperiode; fällig ist die Miete
          am 3. Werktag des Monats. Ältere Rückstände und Sonderforderungen stehen unter{" "}
          <Link href="/offene-posten" className="underline hover:text-white">
            Offene Posten
          </Link>
          .
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href={basis(vorher)} className={linkKlasse}>
          ‹ {MONATSNAMEN[vorher.monat - 1]}
        </Link>
        <span className="min-w-36 text-center text-lg font-medium text-white">
          {MONATSNAMEN[monat - 1]} {jahr}
        </span>
        {istAktuellerMonat ? (
          <span className="rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-600">
            {MONATSNAMEN[nachher.monat - 1]} ›
          </span>
        ) : (
          <Link href={basis(nachher)} className={linkKlasse}>
            {MONATSNAMEN[nachher.monat - 1]} ›
          </Link>
        )}
        {!istAktuellerMonat && (
          <Link href={alleAnzeigen ? "/miete-monat?alle=1" : "/miete-monat"} className={linkKlasse}>
            Aktueller Monat
          </Link>
        )}
        <Link href={basis({ jahr, monat }, !alleAnzeigen)} className={`${linkKlasse} ml-auto`}>
          {alleAnzeigen ? "Nur Offene zeigen" : "Auch Bezahlte zeigen"}
        </Link>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Noch nicht (voll) bezahlt</p>
          <p className={`mt-1 text-xl font-semibold ${unbezahlt.length > 0 ? "text-red-400" : "text-green-400"}`}>
            {unbezahlt.length} von {alleZeilen.length}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Offener Betrag</p>
          <p className={`mt-1 text-xl font-semibold ${summeOffen > 0 ? "text-red-400" : "text-white"}`}>
            {formatEuro(summeOffen)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Vollständig bezahlt</p>
          <p className="mt-1 text-xl font-semibold text-white">{anzahlBezahlt}</p>
        </div>
      </div>

      <MieteMonatTable rows={zeilen} />
    </div>
  );
}
