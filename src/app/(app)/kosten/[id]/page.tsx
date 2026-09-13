import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { KostenpositionForm } from "../kostenposition-form";
import { updateKostenposition, deleteKostenposition, hebeAufteilungAuf } from "../actions";
import { AufteilenForm } from "../aufteilen-form";
import { uploadDokument } from "../../dokumente/actions";
import { DeleteButton } from "@/components/delete-button";
import { BelegeSektion } from "@/components/belege-sektion";
import { gruppiereGebaeude, gebaeudeOderHausLabel, gebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";
import { ladeVirtuelleAuszahlungen } from "../virtuelle-auszahlungen";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export default async function KostenpositionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [kostenposition, kostenarten, gebaeude, virtuelleAuszahlungen] = await Promise.all([
    prisma.kostenposition.findUnique({
      where: { id },
      include: {
        kostenart: true,
        gebaeude: true,
        haus: { include: { gebaeude: true } },
        kostengruppe: true,
        dokumente: { orderBy: { createdAt: "desc" } },
        virtuelleKautionBuchung: true,
      },
    }),
    prisma.kostenart.findMany({ orderBy: { name: "asc" } }),
    prisma.gebaeude.findMany({
      orderBy: [{ strasse: "asc" }, { hausnummer: "asc" }],
      include: {
        haus: { select: { id: true } },
        kostengruppen: { select: { id: true, bezeichnung: true } },
      },
    }),
    ladeVirtuelleAuszahlungen(),
  ]);
  if (!kostenposition) notFound();

  const aufteilungGeschwister = kostenposition.aufteilungGruppeId
    ? await prisma.kostenposition.findMany({
        where: { aufteilungGruppeId: kostenposition.aufteilungGruppeId },
        include: { kostenart: true },
        orderBy: { createdAt: "asc" },
      })
    : [];

  const gebaeudeGruppen = gruppiereGebaeude(gebaeude);
  const gebaeudeLabel = gebaeudeOderHausLabel(
    kostenposition.gebaeude,
    kostenposition.haus,
    kostenposition.kostengruppe,
  );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {kostenposition.kostenart.name} — {gebaeudeLabel} ({kostenposition.jahr})
        </h1>
        <DeleteButton
          action={deleteKostenposition.bind(null, id)}
          confirmText="Kostenposition wirklich löschen?"
        />
      </div>
      <KostenpositionForm
        kostenarten={kostenarten.map((k) => ({ id: k.id, label: k.name }))}
        gebaeude={gebaeudeGruppen}
        virtuelleAuszahlungen={virtuelleAuszahlungen}
        initial={{
          kostenartId: kostenposition.kostenartId,
          gebaeudeAuswahl: gebaeudeAuswahlWert(
            kostenposition.gebaeudeId,
            kostenposition.hausId,
            kostenposition.kostengruppeId,
          ),
          jahr: kostenposition.jahr,
          betrag: kostenposition.betrag.toString(),
          beschreibung: kostenposition.beschreibung,
          empfaenger: kostenposition.empfaenger,
          virtuelleKautionBuchungId: kostenposition.virtuelleKautionBuchungId,
        }}
        action={updateKostenposition.bind(null, id)}
      />

      {kostenposition.virtuelleKautionBuchung && (
        <div className="mt-4 rounded-lg border border-purple-900/40 bg-purple-500/5 p-4">
          <p className="text-sm text-purple-300">
            Virtuelle Gutschrift — verknüpft mit Kautionsbuchung vom{" "}
            {new Intl.DateTimeFormat("de-DE").format(kostenposition.virtuelleKautionBuchung.datum)} (
            {formatEuro(Number(kostenposition.virtuelleKautionBuchung.betrag))}).{" "}
            <Link
              href={`/kautionen#kautionsbuchung-${kostenposition.virtuelleKautionBuchung.id}`}
              className="underline hover:text-purple-200"
            >
              Kautionsbuchung anzeigen
            </Link>
          </p>
        </div>
      )}

      {aufteilungGeschwister.length > 0 ? (
        <div className="mt-4 rounded-lg border border-neutral-800 p-4">
          <p className="mb-1 text-sm font-medium text-white">
            Teil einer Aufteilung ({aufteilungGeschwister.length} Positionen, ursprünglich{" "}
            {formatEuro(aufteilungGeschwister.reduce((s, p) => s + Number(p.betrag), 0))})
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Entstanden aus einer einzelnen importierten Buchung, die auf mehrere Kostenarten
            aufgeteilt wurde.
          </p>
          <ul className="mb-3 space-y-1 text-sm">
            {aufteilungGeschwister.map((p) => (
              <li key={p.id} className="flex items-center justify-between">
                {p.id === id ? (
                  <span className="text-neutral-400">{p.kostenart.name} (diese Position)</span>
                ) : (
                  <Link href={`/kosten/${p.id}`} className="text-white hover:underline">
                    {p.kostenart.name}
                  </Link>
                )}
                <span className="text-neutral-300">{formatEuro(Number(p.betrag))}</span>
              </li>
            ))}
          </ul>
          <DeleteButton
            action={hebeAufteilungAuf.bind(null, id)}
            confirmText={`Aufteilung wirklich rückgängig machen? Alle ${aufteilungGeschwister.length} Positionen werden zu einer Position unter "${kostenposition.kostenart.name}" zusammengeführt.`}
            label="Aufteilung rückgängig machen"
          />
        </div>
      ) : (
        <AufteilenForm
          kostenpositionId={id}
          betragGesamt={Number(kostenposition.betrag)}
          kostenarten={kostenarten.map((k) => ({ id: k.id, name: k.name }))}
          aktuelleKostenartId={kostenposition.kostenartId}
        />
      )}

      <div className="mt-6">
        <BelegeSektion
          dokumente={kostenposition.dokumente}
          uploadAction={uploadDokument.bind(null, {
            kostenpositionId: id,
            revalidatePath: `/kosten/${id}`,
          })}
          revalidatePath={`/kosten/${id}`}
        />
      </div>
    </div>
  );
}
