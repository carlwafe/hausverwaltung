import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/delete-button";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { ermittleNichtBeruecksichtigteKostenarten } from "@/lib/nebenkostenabrechnung";
import { deleteAbrechnung, neuBerechnen, setAbrechnungStatus } from "../actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const STATUS_LABEL: Record<string, string> = {
  ENTWURF: "Entwurf",
  FINAL: "Final",
};

export default async function NebenkostenabrechnungDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({
    where: { id },
    include: {
      positionen: {
        include: {
          einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
          mietvertrag: { include: { mieter: true } },
        },
        orderBy: [{ einheit: { bezeichnung: "asc" } }, { zeitraumVon: "asc" }],
      },
    },
  });
  if (!abrechnung) notFound();

  const kostenpositionenRoh = await prisma.kostenposition.findMany({
    where: { jahr: abrechnung.jahr, kostenart: { umlagefaehig: true } },
    include: { kostenart: true },
  });
  const nichtBeruecksichtigt = ermittleNichtBeruecksichtigteKostenarten(
    kostenpositionenRoh.map((k) => ({
      betrag: Number(k.betrag),
      gebaeudeId: k.gebaeudeId,
      hausId: k.hausId,
      kostengruppeId: k.kostengruppeId,
      verteilerschluessel: k.kostenart.standardVerteilerschluessel,
      kostenartName: k.kostenart.name,
    })),
  );

  const summeKostenanteil = abrechnung.positionen.reduce((s, p) => s + Number(p.kostenanteilGesamt), 0);
  const summeVorauszahlung = abrechnung.positionen.reduce((s, p) => s + Number(p.vorauszahlungGesamt), 0);
  const summeSaldo = abrechnung.positionen.reduce((s, p) => s + Number(p.saldo), 0);

  const naechsterStatus = abrechnung.status === "ENTWURF" ? "FINAL" : "ENTWURF";
  const naechsterStatusAction = setAbrechnungStatus.bind(null, id, naechsterStatus);
  const neuBerechnenAction = neuBerechnen.bind(null, id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Nebenkostenabrechnung {abrechnung.jahr}
          </h1>
          <p className="text-sm text-neutral-400">
            Status: {STATUS_LABEL[abrechnung.status] ?? abrechnung.status} · erstellt am{" "}
            {formatDate(abrechnung.erstelltAm)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <form action={neuBerechnenAction}>
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Neu berechnen
            </button>
          </form>
          <form action={naechsterStatusAction}>
            <button
              type="submit"
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Als {STATUS_LABEL[naechsterStatus]} markieren
            </button>
          </form>
          <DeleteButton
            action={deleteAbrechnung.bind(null, id)}
            confirmText="Abrechnung wirklich löschen? Alle Positionen gehen dabei verloren."
          />
        </div>
      </div>

      {nichtBeruecksichtigt.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm font-medium text-amber-400">
            Nicht berücksichtigte Kostenarten — kein unterstützter Verteilerschlüssel
          </p>
          <ul className="space-y-1 text-sm text-neutral-300">
            {nichtBeruecksichtigt.map((n) => (
              <li key={n.kostenartName}>
                {n.kostenartName} ({n.verteilerschluessel ?? "kein Verteilerschlüssel"}):{" "}
                {formatEuro(n.summe)}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Verteilerschlüssel Wohnfläche oder Anzahl Einheiten setzen und &quot;Neu
            berechnen&quot;, damit diese Kosten mit einfließen.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Summe Kostenanteil</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeKostenanteil)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Summe Vorauszahlung</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeVorauszahlung)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Summe Saldo</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeSaldo)}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Gebäude</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Zeitraum</th>
              <th className="px-4 py-2 text-right">Kostenanteil</th>
              <th className="px-4 py-2 text-right">Vorauszahlung</th>
              <th className="px-4 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {abrechnung.positionen.map((p) => (
              <tr key={p.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">
                  <Link href={`/einheiten/${p.einheitId}`} className="font-medium hover:underline">
                    {p.einheit.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-neutral-300">
                  {gebaeudeOderHausLabel(p.einheit.gebaeude, p.einheit.gebaeude.haus)}
                </td>
                <td className="px-4 py-2 text-neutral-300">
                  {p.mietvertrag
                    ? p.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")
                    : "–"}
                </td>
                <td className="px-4 py-2 text-neutral-300">
                  {formatDate(p.zeitraumVon)} – {formatDate(p.zeitraumBis)}
                </td>
                <td className="px-4 py-2 text-right text-white">
                  {formatEuro(Number(p.kostenanteilGesamt))}
                </td>
                <td className="px-4 py-2 text-right text-white">
                  {formatEuro(Number(p.vorauszahlungGesamt))}
                </td>
                <td
                  className={`px-4 py-2 text-right font-medium ${
                    Number(p.saldo) >= 0 ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {formatEuro(Number(p.saldo))}
                  {Number(p.saldo) >= 0 ? " (Guthaben)" : " (Nachzahlung)"}
                </td>
              </tr>
            ))}
            {abrechnung.positionen.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
                  Keine Positionen vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
