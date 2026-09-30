import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { mieterName } from "@/lib/mieter-name";
import { DeleteButton } from "@/components/delete-button";
import { KautionAufteilenForm } from "../../kaution-aufteilen-form";
import { deleteKautionsbuchungen, hebeKautionAufteilungAuf } from "../../actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function loescheUndZurueck(id: string) {
  "use server";
  await deleteKautionsbuchungen([id]);
  redirect("/kautionen");
}

export default async function KautionsbuchungDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const buchung = await prisma.buchung.findFirst({
    where: { id, buchungsart: { kontokreis: "KAUTIONSKONTO", code: { not: "KAUTION_EINBEHALT" } }, ...AKTIVE_BUCHUNG_FILTER },
    include: { buchungsart: true, mietvertrag: { include: { einheit: true, mieter: true } } },
  });
  if (!buchung || !buchung.mietvertrag || !buchung.datum) notFound();
  const mieterNamen = buchung.mietvertrag.mieter.map((m) => mieterName(m)).join(" & ");

  const geschwister = buchung.aufteilungGruppeId
    ? await prisma.buchung.findMany({
        where: { aufteilungGruppeId: buchung.aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER },
        include: { buchungsart: { select: { code: true, bezeichnung: true, kontokreis: true } }, mietvertrag: { include: { einheit: true } } },
        orderBy: { erstelltAm: "asc" },
      })
    : [];
  const kannZusammenfuehren =
    geschwister.filter((g) => g.buchungsart.kontokreis === "KAUTIONSKONTO").length === 1 &&
    geschwister.every(
      (g) => g.buchungsart.kontokreis === "KAUTIONSKONTO" || ["NEBENKOSTENAUSGLEICH", "SONDERZAHLUNG"].includes(g.buchungsart.code),
    );

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Kautionsbuchung — {buchung.mietvertrag.einheit.bezeichnung} ({mieterNamen})
        </h1>
        <DeleteButton action={loescheUndZurueck.bind(null, id)} confirmText="Kautionsbuchung wirklich stornieren?" />
      </div>
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
          <span className="text-neutral-400">Kategorie</span>
          <span className="text-white">{buchung.buchungsart.bezeichnung}</span>
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
          <Link href={`/mietvertraege/${buchung.mietvertragId}`} className="text-white hover:underline">
            {buchung.mietvertrag.einheit.bezeichnung} — {mieterNamen}
          </Link>
        </p>
      </div>

      {geschwister.length > 0 && (
        <div className="mt-4 rounded-lg border border-neutral-800 p-4">
          <p className="mb-1 text-sm font-medium text-white">
            <span className="mr-1.5 rounded-full bg-blue-500/10 px-1.5 text-xs text-blue-400">✂</span>
            Teil einer Aufteilung ({geschwister.length} Buchungen)
          </p>
          <p className="mb-3 text-xs text-neutral-500">Entstanden aus einer einzelnen Überweisung, die aufgeteilt wurde.</p>
          <ul className="mb-3 space-y-1 text-sm">
            {geschwister.map((g) => {
              const art =
                g.buchungsart.code === "NEBENKOSTENAUSGLEICH"
                  ? `BK-Ausgleich${g.jahr ? ` ${g.jahr}` : ""}`
                  : g.buchungsart.code === "SONDERZAHLUNG"
                    ? "Gebühren-Zahlung"
                    : g.buchungsart.bezeichnung;
              const label = `${art} — ${g.mietvertrag?.einheit.bezeichnung ?? ""}`;
              const href =
                g.buchungsart.kontokreis === "KAUTIONSKONTO"
                  ? `/kautionen/buchung/${g.id}`
                  : g.buchungsart.code === "NEBENKOSTENAUSGLEICH"
                    ? `/nebenkostenausgleich/${g.id}`
                    : g.buchungsart.code === "SONDERZAHLUNG"
                      ? `/zahlungen/${g.id}`
                      : null;
              return (
                <li key={g.id} className="flex items-center justify-between">
                  {g.id === id ? (
                    <span className="text-neutral-400">{label} (diese Buchung)</span>
                  ) : href ? (
                    <Link href={href} className="text-white hover:underline">
                      {label}
                    </Link>
                  ) : (
                    <span className="text-white">{label}</span>
                  )}
                  <span className="text-neutral-300">{formatEuro(Number(g.betrag))}</span>
                </li>
              );
            })}
          </ul>
          {kannZusammenfuehren && (
            <DeleteButton
              action={hebeKautionAufteilungAuf.bind(null, id)}
              confirmText="Aufteilung wirklich rückgängig machen? Alle Teile werden zu einer Kautionsbuchung zusammengeführt."
              label="Aufteilung rückgängig machen"
            />
          )}
        </div>
      )}
      <KautionAufteilenForm
        id={id}
        betragGesamt={Number(buchung.betrag)}
        standardJahr={buchung.datum.getFullYear() - 1}
      />
    </div>
  );
}
