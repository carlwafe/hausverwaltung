import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/delete-button";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { ermittleNichtBeruecksichtigteKostenarten } from "@/lib/nebenkostenabrechnung";
import { toDateInputValue } from "@/lib/date-utils";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import {
  deleteAbrechnung,
  entferneBeglichen,
  ladeBerechnungsdaten,
  markiereBeglichen,
  neuBerechnen,
  setAbrechnungStatus,
} from "../actions";
import { ManuellePositionForm } from "../manuelle-position-form";
import { VorverteilteKostenanteileForm, type VorverteilteZeile } from "../vorverteilte-kostenanteile-form";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

function formatZahl(n: number) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 2 }).format(n);
}

// Beschreibt die Verteilungsbasis eines Kostenanteil-Beleg-Eintrags für die Anzeige, z.B.
// "35,20 von 420,50 m²" (WOHNFLAECHE), "1 von 12 Einheiten" (EINHEITEN), "180 von 950 kWh"
// (VERBRAUCH_MANUELL) oder "extern vorverteilt" (VORVERTEILT).
function formatVerteilungsbasis(d: KostenanteilDetailEintrag) {
  if (d.verteilerschluessel === "VORVERTEILT") return "extern vorverteilt";
  if (d.verteilerschluessel === "EINHEITEN") return `1 von ${formatZahl(d.poolMasswert)} Einheiten`;
  return `${formatZahl(d.einheitMasswert)} von ${formatZahl(d.poolMasswert)} ${d.masseinheit}`.trim();
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

  const [{ kostenpositionen, einheiten, verbrauchswerte }, mietvertraegeRoh, vorverteilteKostenarten, vorverteilteKostenanteileRoh] =
    await Promise.all([
      ladeBerechnungsdaten(abrechnung.jahr),
      prisma.mietvertrag.findMany({
        where: { status: { in: ["AKTIV", "BEENDET"] } },
        include: { einheit: true, mieter: true },
        orderBy: { einheit: { bezeichnung: "asc" } },
      }),
      prisma.kostenart.findMany({
        where: { standardVerteilerschluessel: "VORVERTEILT" },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.vorverteilterKostenanteil.findMany({ where: { jahr: abrechnung.jahr } }),
    ]);
  const mietvertragKandidaten = mietvertraegeRoh.map((v) => ({
    id: v.id,
    label: `${v.einheit.bezeichnung} - ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
  }));
  const nichtBeruecksichtigt = ermittleNichtBeruecksichtigteKostenarten(
    abrechnung.jahr,
    kostenpositionen,
    einheiten,
    verbrauchswerte,
  );

  // Für jede Kostenart mit VORVERTEILT: Gebäude-/Haus-/Kostengruppen-Zuordnung wird nicht neu
  // modelliert, sondern wie an anderen Stellen im Kosten-Modul aus der jüngsten bestehenden
  // Kostenposition dieser Kostenart abgeleitet (dieselbe Kostenart wird bisher immer konsistent
  // für denselben Gebäude-/Haus-/Kostengruppen-Scope gebucht).
  const wohnungenRoh = einheiten.filter((e) => e.typ === "WOHNUNG");
  const vorverteilteGruppen = await Promise.all(
    vorverteilteKostenarten.map(async (k) => {
      const juengste = await prisma.kostenposition.findFirst({
        where: { kostenartId: k.id },
        orderBy: { datum: "desc" },
        select: { gebaeudeId: true, hausId: true, kostengruppeId: true },
      });
      const passendeEinheitIds = new Set(
        (juengste?.kostengruppeId
          ? wohnungenRoh.filter((e) => e.kostengruppenIds.includes(juengste.kostengruppeId!))
          : juengste?.hausId
            ? wohnungenRoh.filter((e) => e.hausId === juengste.hausId)
            : juengste?.gebaeudeId
              ? wohnungenRoh.filter((e) => e.gebaeudeId === juengste.gebaeudeId)
              : []
        ).map((e) => e.id),
      );
      const betraege = new Map(
        vorverteilteKostenanteileRoh
          .filter((v) => v.kostenartId === k.id)
          .map((v) => [v.mietvertragId, Number(v.betrag)]),
      );
      const zeilen: VorverteilteZeile[] = abrechnung.positionen
        .filter((p) => p.mietvertragId && passendeEinheitIds.has(p.einheitId))
        .map((p) => ({
          mietvertragId: p.mietvertragId!,
          einheitBezeichnung: p.einheit.bezeichnung,
          mieterNamen: p.mietvertrag ? p.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") : "–",
          zeitraumVon: p.zeitraumVon.toISOString(),
          zeitraumBis: p.zeitraumBis.toISOString(),
          betrag: betraege.get(p.mietvertragId!) ?? null,
        }));
      return { kostenartId: k.id, kostenartName: k.name, zeilen };
    }),
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

      {nichtBeruecksichtigt.some((n) => n.grund === "kein_verteilerschluessel") && (
        <div className="mb-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm font-medium text-amber-400">
            Nicht berücksichtigte Kostenarten — kein unterstützter Verteilerschlüssel
          </p>
          <ul className="space-y-1 text-sm text-neutral-300">
            {nichtBeruecksichtigt
              .filter((n) => n.grund === "kein_verteilerschluessel")
              .map((n) => (
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

      {nichtBeruecksichtigt.some((n) => n.grund === "unvollstaendige_verbrauchswerte") && (
        <div className="mb-6 rounded-lg border border-amber-900 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm font-medium text-amber-400">
            Nicht berücksichtigte Kostenarten — Verbrauchswerte unvollständig
          </p>
          <ul className="space-y-1 text-sm text-neutral-300">
            {nichtBeruecksichtigt
              .filter((n) => n.grund === "unvollstaendige_verbrauchswerte")
              .map((n) => (
                <li key={n.kostenartName}>
                  {n.kostenartName}: {formatEuro(n.summe)}
                </li>
              ))}
          </ul>
          <p className="mt-2 text-xs text-neutral-500">
            Für mindestens eine betroffene Einheit fehlt ein Ablesewert für {abrechnung.jahr}.{" "}
            <Link href="/verbrauchswerte" className="underline">
              Verbrauchswerte erfassen
            </Link>{" "}
            und &quot;Neu berechnen&quot;.
          </p>
        </div>
      )}

      {vorverteilteGruppen.length > 0 && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium text-neutral-300">
            Extern vorverteilte Kostenarten — hier bewusst nicht selbst berechnet
          </p>
          <p className="mb-3 text-xs text-neutral-500">
            Die Pro-Mieter-Aufteilung liegt extern vor (z.B. Techem-Gesamtabrechnung) — trag den
            jeweiligen Betrag pro Mietvertrag ein und klicke danach auf &quot;Neu berechnen&quot;,
            damit er in den Kostenanteil einfließt.
          </p>
          {vorverteilteGruppen.map((g) => (
            <VorverteilteKostenanteileForm
              key={g.kostenartId}
              jahr={abrechnung.jahr}
              kostenartId={g.kostenartId}
              kostenartName={g.kostenartName}
              zeilen={g.zeilen}
            />
          ))}
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
              <th className="px-4 py-2">Beglichen</th>
            </tr>
          </thead>
          <tbody>
            {abrechnung.positionen.map((p) => {
              const details = ((p.details as KostenanteilDetailEintrag[] | null) ?? []).slice().sort((a, b) =>
                a.kostenartName.localeCompare(b.kostenartName, "de"),
              );
              const summeDetails = details.reduce((s, d) => s + d.anteilZeitraum, 0);
              return (
              <Fragment key={p.id}>
              <tr className="border-t border-neutral-800 hover:bg-neutral-900">
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
                <td className="px-4 py-2 text-neutral-300">
                  {p.beglichenAm ? (
                    <div className="flex items-center gap-2">
                      <span className="text-green-400">{formatDate(p.beglichenAm)}</span>
                      <form action={entferneBeglichen.bind(null, p.id)}>
                        <button
                          type="submit"
                          className="text-xs text-neutral-500 underline hover:text-white"
                        >
                          zurücksetzen
                        </button>
                      </form>
                    </div>
                  ) : (
                    <form action={markiereBeglichen} className="flex items-center gap-1">
                      <input type="hidden" name="positionId" value={p.id} />
                      <input
                        type="date"
                        name="datum"
                        required
                        defaultValue={toDateInputValue(new Date())}
                        className="rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                      />
                      <button
                        type="submit"
                        className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-white hover:bg-neutral-900"
                      >
                        Markieren
                      </button>
                    </form>
                  )}
                </td>
              </tr>
              <tr key={`${p.id}-details`} className="border-t border-neutral-800 bg-neutral-950/40">
                <td colSpan={8} className="px-4 py-2">
                  <details className="text-xs">
                    <summary className="cursor-pointer select-none text-neutral-400 hover:text-white">
                      Kostenanteil-Aufschlüsselung {details.length > 0 ? `(${details.length})` : ""}
                    </summary>
                    {details.length === 0 ? (
                      <p className="mt-2 text-neutral-500">
                        Keine Aufschlüsselung gespeichert — manuell erfasste Position oder vor
                        Einführung dieser Übersicht berechnet. &quot;Neu berechnen&quot; klicken, um sie
                        nachzutragen.
                      </p>
                    ) : (
                      <div className="mt-2 overflow-x-auto">
                        <table className="w-full max-w-4xl text-xs">
                          <thead className="text-left text-neutral-500">
                            <tr>
                              <th className="py-1 pr-3">Kostenart</th>
                              <th className="py-1 pr-3">Kostenkreis</th>
                              <th className="py-1 pr-3 text-right">Gesamt (Jahr)</th>
                              <th className="py-1 pr-3">Verteilung</th>
                              <th className="py-1 pr-3 text-right">Anteil (volles Jahr)</th>
                              <th className="py-1 pr-3 text-right">Anteil (Zeitraum)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.map((d, i) => (
                              <tr key={i} className="border-t border-neutral-800">
                                <td className="py-1 pr-3 text-neutral-300">{d.kostenartName}</td>
                                <td className="py-1 pr-3 text-neutral-500">{d.scopeLabel}</td>
                                <td className="py-1 pr-3 text-right text-neutral-300">
                                  {formatEuro(d.gesamtbetragPool)}
                                </td>
                                <td className="py-1 pr-3 text-neutral-500">{formatVerteilungsbasis(d)}</td>
                                <td className="py-1 pr-3 text-right text-neutral-300">{formatEuro(d.anteilJahr)}</td>
                                <td className="py-1 pr-3 text-right text-white">{formatEuro(d.anteilZeitraum)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-neutral-800 font-medium">
                              <td colSpan={5} className="py-1 pr-3 text-right text-neutral-400">
                                Summe Aufschlüsselung
                              </td>
                              <td className="py-1 pr-3 text-right text-white">{formatEuro(summeDetails)}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    )}
                  </details>
                </td>
              </tr>
              </Fragment>
              );
            })}
            {abrechnung.positionen.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-neutral-500">
                  Keine Positionen vorhanden.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ManuellePositionForm
        abrechnungId={id}
        jahr={abrechnung.jahr}
        mietvertragKandidaten={mietvertragKandidaten}
      />
    </div>
  );
}
