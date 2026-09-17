import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ZahlungForm } from "../zahlung-form";
import { updateZahlung, deleteZahlung, hebeZahlungAufteilungAuf } from "../actions";
import { AufteilenForm } from "../aufteilen-form";
import { DeleteButton } from "@/components/delete-button";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function ZahlungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [zahlung, vertraege, kostenarten] = await Promise.all([
    prisma.zahlung.findUnique({
      where: { id },
      include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: { einheit: true, mieter: true },
    }),
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!zahlung) notFound();
  vertraege.sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung));

  const aufteilungGruppeId = zahlung.aufteilungGruppeId;
  const aufteilungGeschwister = await prisma.zahlung.findMany({
    where: { aufteilungGruppeId: aufteilungGruppeId ?? "__keine__" },
    include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    orderBy: { createdAt: "asc" },
  });
  const aufteilungKosten = await prisma.kostenposition.findMany({
    where: { aufteilungGruppeId: aufteilungGruppeId ?? "__keine__" },
    include: { kostenart: true },
    orderBy: { createdAt: "asc" },
  });

  const mietvertraegeOptionen = vertraege.map((v) => ({
    id: v.id,
    label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Zahlung — {zahlung.mietvertrag.einheit.bezeichnung} (
          {zahlung.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")})
        </h1>
        <DeleteButton action={deleteZahlung.bind(null, id)} confirmText="Zahlung wirklich löschen?" />
      </div>
      <ZahlungForm
        mietvertraege={mietvertraegeOptionen}
        initial={{
          mietvertragId: zahlung.mietvertragId,
          datum: zahlung.datum.toISOString().slice(0, 10),
          betrag: zahlung.betrag.toString(),
          periodeMonat: zahlung.periodeMonat,
          periodeJahr: zahlung.periodeJahr,
          verwendungszweck: zahlung.verwendungszweck,
        }}
        action={updateZahlung.bind(null, id)}
      />

      {aufteilungGeschwister.length > 0 ? (
        <div className="mt-4 rounded-lg border border-neutral-800 p-4">
          <p className="mb-1 text-sm font-medium text-white">
            Teil einer Aufteilung ({aufteilungGeschwister.length} Zahlung
            {aufteilungGeschwister.length === 1 ? "" : "en"}
            {aufteilungKosten.length > 0 &&
              ` + ${aufteilungKosten.length} Kostenposition${aufteilungKosten.length === 1 ? "" : "en"}`}
            )
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Entstanden aus einer einzelnen Zahlung, die aufgeteilt wurde — z.B. auf mehrere
            Mietverträge oder in Miete + eine Kostenerstattung.
          </p>
          <ul className="mb-3 space-y-1 text-sm">
            {aufteilungGeschwister.map((z) => {
              const label = `${z.mietvertrag.einheit.bezeichnung} — ${z.mietvertrag.mieter
                .map((m) => `${m.vorname} ${m.nachname}`)
                .join(" & ")}`;
              return (
                <li key={z.id} className="flex items-center justify-between">
                  {z.id === id ? (
                    <span className="text-neutral-400">{label} (diese Zahlung)</span>
                  ) : (
                    <Link href={`/zahlungen/${z.id}`} className="text-white hover:underline">
                      {label}
                    </Link>
                  )}
                  <span className="text-neutral-300">{formatEuro(Number(z.betrag))}</span>
                </li>
              );
            })}
            {aufteilungKosten.map((k) => (
              <li key={k.id} className="flex items-center justify-between">
                <Link href={`/kosten/${k.id}`} className="text-white hover:underline">
                  Kosten: {k.kostenart.name}
                </Link>
                <span className="text-neutral-300">{formatEuro(Number(k.betrag))}</span>
              </li>
            ))}
          </ul>
          <DeleteButton
            action={hebeZahlungAufteilungAuf.bind(null, id)}
            confirmText={`Aufteilung wirklich rückgängig machen? Alle ${aufteilungGeschwister.length} Zahlungen werden zu einer Zahlung unter "${zahlung.mietvertrag.einheit.bezeichnung}" zusammengeführt.${aufteilungKosten.length > 0 ? " Die abgespaltenen Kostenpositionen bleiben davon unberührt bestehen." : ""}`}
            label="Aufteilung rückgängig machen"
          />
        </div>
      ) : (
        <AufteilenForm
          zahlungId={id}
          betragGesamt={Number(zahlung.betrag)}
          aktuelleMietvertragId={zahlung.mietvertragId}
          periodeMonat={zahlung.periodeMonat}
          periodeJahr={zahlung.periodeJahr}
          mietvertraege={mietvertraegeOptionen}
          kostenarten={kostenarten.map((k) => ({ id: k.id, name: k.name }))}
        />
      )}
    </div>
  );
}
