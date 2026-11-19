import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/session";
import { ObjektForm } from "./objekt-form";
import { KostenTable } from "../kosten/kosten-table";
import { ladeKosten, REPARATUR_SANIERUNG_KOSTENART_NAMEN } from "../kosten/kosten-liste";

export default async function ObjektPage() {
  await requireAdmin();
  const [objekt, kosten, haeuser, gebaeude, einheiten] = await Promise.all([
    prisma.objekt.findFirst(),
    ladeKosten({
      gebaeudeId: null,
      hausId: null,
      kostengruppeId: null,
      einheitId: null,
      kostenart: { name: { in: REPARATUR_SANIERUNG_KOSTENART_NAMEN } },
    }),
    prisma.haus.count(),
    prisma.gebaeude.count(),
    // Für die Kennzahlen: Typ, Fläche und ob ein laufender/geplanter Vertrag besteht.
    prisma.einheit.findMany({
      select: {
        typ: true,
        wohnflaecheQm: true,
        _count: { select: { mietvertraege: { where: { status: { in: ["AKTIV", "GEPLANT"] } } } } },
      },
    }),
  ]);
  if (!objekt) notFound();

  const wohnungen = einheiten.filter((e) => e.typ !== "GARAGE");
  const garagen = einheiten.length - wohnungen.length;
  const flaeche = wohnungen.reduce((s, e) => s + Number(e.wohnflaecheQm), 0);
  const leerWohnungen = wohnungen.filter((e) => e._count.mietvertraege === 0).length;
  const leerGaragen = einheiten.filter((e) => e.typ === "GARAGE" && e._count.mietvertraege === 0).length;
  const formatZahl = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);

  return (
    <div>
      <div className="mb-6">
        <p className="text-sm text-neutral-400">Objekt</p>
        <h1 className="text-2xl font-semibold">{objekt.name}</h1>
        <p className="mt-1 text-sm text-neutral-400">
          {objekt.strasse} {objekt.hausnummer}, {objekt.plz} {objekt.ort}
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Kennzahl titel="Gebäude" wert={String(gebaeude)} href="/gebaeude">
          {haeuser} {haeuser === 1 ? "Haus" : "Häuser"} mit {gebaeude} Hausnummern
        </Kennzahl>
        <Kennzahl titel="Einheiten" wert={String(einheiten.length)} href="/einheiten">
          {wohnungen.length} Wohnungen{garagen > 0 && `, ${garagen} Garagen`}
        </Kennzahl>
        <Kennzahl titel="Wohnfläche" wert={`${formatZahl(flaeche)} m²`}>
          Summe der Wohnungen
        </Kennzahl>
        <Kennzahl
          titel="Leerstand"
          wert={`${leerWohnungen} ${leerWohnungen === 1 ? "Wohnung" : "Wohnungen"}`}
          wertKlasse={leerWohnungen > 0 ? "text-amber-400" : "text-white"}
          href="/leerstand"
        >
          {garagen > 0 ? `${leerGaragen} ${leerGaragen === 1 ? "Garage" : "Garagen"} frei` : "ohne laufenden Vertrag"}
        </Kennzahl>
      </div>

      <ObjektForm
        initial={{
          ...objekt,
          kontostandAnkerBetrag: objekt.kontostandAnkerBetrag?.toString() ?? null,
        }}
      />

      <section className="mt-10">
        <h2 className="mb-3 text-lg font-medium text-white">
          Reparaturen, Sanierung & Modernisierung für das gesamte Objekt ({kosten.length})
        </h2>
        <KostenTable rows={kosten} />
      </section>
    </div>
  );
}

function Kennzahl({
  titel,
  wert,
  wertKlasse = "text-white",
  href,
  children,
}: {
  titel: string;
  wert: string;
  wertKlasse?: string;
  href?: string;
  children?: React.ReactNode;
}) {
  const inhalt = (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums sm:text-lg ${wertKlasse}`}>{wert}</p>
      {children ? <p className="mt-0.5 text-xs text-neutral-500">{children}</p> : null}
    </>
  );
  const klasse = "block min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4";
  return href ? (
    <Link href={href} prefetch={false} className={`${klasse} hover:border-neutral-600 hover:bg-neutral-900`}>
      {inhalt}
    </Link>
  ) : (
    <div className={klasse}>{inhalt}</div>
  );
}
