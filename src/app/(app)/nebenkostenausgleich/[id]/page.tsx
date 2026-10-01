import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { mieterName } from "@/lib/mieter-name";
import { DeleteButton } from "@/components/delete-button";
import { BuchungsartInfo } from "@/components/buchungsart-info";
import { NebenkostenausgleichAufteilenForm } from "../aufteilen-form";
import { deleteNebenkostenausgleichZahlungen, hebeNebenkostenausgleichAufteilungAuf } from "../actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function loescheUndZurueck(id: string) {
  "use server";
  await deleteNebenkostenausgleichZahlungen([id]);
  redirect("/nebenkostenausgleich");
}

export default async function NebenkostenausgleichDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [buchung, vertraege] = await Promise.all([
    prisma.buchung.findFirst({
      where: { id, buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...AKTIVE_BUCHUNG_FILTER },
      include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: { einheit: true, mieter: true },
    }),
  ]);
  if (!buchung || !buchung.datum) notFound();
  vertraege.sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung));
  const mietvertraegeOptionen = vertraege.map((v) => ({
    id: v.id,
    label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => mieterName(m)).join(" & ")}`,
  }));
  const mieterNamen = buchung.mietvertrag?.mieter.map((m) => mieterName(m)).join(" & ") ?? "";

  const geschwister = buchung.aufteilungGruppeId
    ? await prisma.buchung.findMany({
        where: {
          aufteilungGruppeId: buchung.aufteilungGruppeId,
          ...AKTIVE_BUCHUNG_FILTER,
        },
        include: { buchungsart: { select: { code: true, bezeichnung: true } }, mietvertrag: { include: { einheit: true } } },
        orderBy: { erstelltAm: "asc" },
      })
    : [];

  // Zusammenführen geht nur bei reinen BK-Ausgleich/Gebühren-Zahlung-Gruppen; enthält die Gruppe
  // z.B. eine Kautionsauszahlung, bleibt es bei Aufteilen (dieses Teils) bzw. Stornieren.
  const kannZusammenfuehren = geschwister.every((g) => ["NEBENKOSTENAUSGLEICH", "SONDERZAHLUNG"].includes(g.buchungsart.code));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Nebenkostenausgleich
          {buchung.mietvertrag ? ` — ${buchung.mietvertrag.einheit.bezeichnung} (${mieterNamen})` : " — ohne Mietvertrag"}
        </h1>
        <DeleteButton action={loescheUndZurueck.bind(null, id)} confirmText="Nebenkostenausgleich wirklich stornieren?" />
      </div>
      <BuchungsartInfo code="NEBENKOSTENAUSGLEICH" erstelltAm={buchung.erstelltAm} erstelltVon={buchung.erstelltVon} />
      <div className="max-w-xl space-y-2 rounded-lg border border-neutral-800 p-4 text-sm">
        <p className="flex justify-between">
          <span className="text-neutral-400">Datum</span>
          <span className="text-white">{new Intl.DateTimeFormat("de-DE").format(buchung.datum)}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-neutral-400">Betrag</span>
          <span className="text-white">{formatEuro(Number(buchung.betrag))}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-neutral-400">Abrechnungsjahr</span>
          <span className="text-white">{buchung.jahr ?? "–"}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-neutral-400">Empfänger/Absender</span>
          <span className="text-right text-white">{buchung.empfaenger || "–"}</span>
        </p>
        <p className="flex justify-between gap-6">
          <span className="text-neutral-400">Verwendungszweck</span>
          <span className="text-right text-white">{buchung.verwendungszweck || "–"}</span>
        </p>
        <p className="flex justify-between">
          <span className="text-neutral-400">Mietvertrag</span>
          {buchung.mietvertrag ? (
            <Link href={`/mietvertraege/${buchung.mietvertragId}`} className="text-white hover:underline">
              {buchung.mietvertrag.einheit.bezeichnung} — {mieterNamen}
            </Link>
          ) : (
            <span className="text-amber-400">nicht zugeordnet</span>
          )}
        </p>
      </div>

      {geschwister.length > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-800 p-4">
          <p className="mb-1 text-sm font-medium text-white">Teil einer Aufteilung ({geschwister.length} Buchungen)</p>
          <p className="mb-3 text-xs text-neutral-500">
            Entstanden aus einer einzelnen Überweisung, die aufgeteilt wurde.
          </p>
          <ul className="mb-3 space-y-1 text-sm">
            {geschwister.map((g) => {
              const art =
                g.buchungsart.code === "SONDERZAHLUNG"
                  ? "Gebühren-Zahlung"
                  : g.buchungsart.code === "NEBENKOSTENAUSGLEICH"
                    ? `BK-Ausgleich${g.jahr ? ` ${g.jahr}` : ""}`
                    : g.buchungsart.bezeichnung;
              const label = `${art} — ${g.mietvertrag?.einheit.bezeichnung ?? ""}`;
              return (
                <li key={g.id} className="flex items-center justify-between">
                  {g.id === id ? (
                    <span className="text-neutral-400">{label} (diese Buchung)</span>
                  ) : g.buchungsart.code === "SONDERZAHLUNG" ? (
                    <Link href={`/zahlungen/${g.id}`} className="text-white hover:underline">
                      {label}
                    </Link>
                  ) : g.buchungsart.code !== "NEBENKOSTENAUSGLEICH" ? (
                    <span className="text-white">{label}</span>
                  ) : (
                    <Link href={`/nebenkostenausgleich/${g.id}`} className="text-white hover:underline">
                      {label}
                    </Link>
                  )}
                  <span className="text-neutral-300">{formatEuro(Number(g.betrag))}</span>
                </li>
              );
            })}
          </ul>
          {kannZusammenfuehren && (
            <DeleteButton
              action={hebeNebenkostenausgleichAufteilungAuf.bind(null, id)}
              confirmText="Aufteilung wirklich rückgängig machen? Alle Teile werden zu einer Nebenkostenausgleich-Buchung zusammengeführt."
              label="Aufteilung rückgängig machen"
            />
          )}
        </div>
      )}
      <NebenkostenausgleichAufteilenForm
        id={id}
        betragGesamt={Number(buchung.betrag)}
        aktuelleMietvertragId={buchung.mietvertragId ?? ""}
        ohneMietvertrag={!buchung.mietvertragId}
        jahr={buchung.jahr}
        mietvertraege={mietvertraegeOptionen}
      />
    </div>
  );
}
