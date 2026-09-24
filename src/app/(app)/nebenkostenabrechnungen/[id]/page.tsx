import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/delete-button";
import { SubmitButton } from "@/components/submit-button";
import { gebaeudeOderHausLabel, hausLabel, vergleicheHaus } from "@/lib/gebaeude-gruppen";
import { baueKostenUebersicht, type Uebersicht } from "@/lib/nk-uebersicht";
import { Kostenuebersicht, type UebersichtAuswahl } from "./kostenuebersicht";
import { PositionenTable } from "./positionen-table";
import { ermittleNichtBeruecksichtigteKostenarten } from "@/lib/nebenkostenabrechnung";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import {
  deleteAbrechnung,
  ladeBerechnungsdaten,
  ladeNebenkostenausgleichSummen,
  neuBerechnen,
  setAbrechnungStatus,
} from "../actions";
import { ManuellePositionForm } from "../manuelle-position-form";
import { VorverteilteKostenanteileForm, type VorverteilteZeile, type LeerstandZeile } from "../vorverteilte-kostenanteile-form";
import { TechemAllgemeinstromForm } from "../techem-allgemeinstrom-form";

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

  const [
    { kostenpositionen, einheiten, verbrauchswerte },
    mietvertraegeRoh,
    vorverteilteKostenarten,
    vorverteilteKostenanteileRoh,
    leerstandRoh,
    nebenkostenausgleichSummen,
    kostengruppenRoh,
    techemAllgemeinstromAnteileRoh,
  ] = await Promise.all([
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
    prisma.vorverteilterLeerstand.findMany({
      where: { jahr: abrechnung.jahr },
      include: { kostenart: { select: { name: true } }, einheit: { select: { gebaeudeId: true, gebaeude: { select: { hausId: true } } } } },
      orderBy: { createdAt: "asc" },
    }),
    ladeNebenkostenausgleichSummen(
      abrechnung.jahr,
      abrechnung.positionen.map((p) => p.mietvertragId),
    ),
    prisma.kostengruppe.findMany({ orderBy: { bezeichnung: "asc" } }),
    prisma.techemAllgemeinstromAnteil.findMany({ where: { jahr: abrechnung.jahr } }),
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
  const techemAllgemeinstromAnteileById = new Map(
    techemAllgemeinstromAnteileRoh.map((a) => [a.kostenartId, Number(a.betrag)]),
  );
  const vorverteilteGruppen = await Promise.all(
    vorverteilteKostenarten.map(async (k) => {
      const juengste = await prisma.buchung.findFirst({
        where: { buchungsart: { code: "KOSTENPOSITION" }, kostenartId: k.id },
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
      const leerstand: LeerstandZeile[] = leerstandRoh
        .filter((l) => l.kostenartId === k.id)
        .map((l) => ({ einheitId: l.einheitId, betrag: Number(l.betrag), notiz: l.notiz }));
      const einheitOptionen = wohnungenRoh
        .filter((e) => passendeEinheitIds.has(e.id))
        .map((e) => ({ id: e.id, bezeichnung: e.bezeichnung }));
      return { kostenartId: k.id, kostenartName: k.name, zeilen, leerstand, einheitOptionen };
    }),
  );

  const summeKostenanteil = abrechnung.positionen.reduce((s, p) => s + Number(p.kostenanteilGesamt), 0);
  const summeVorauszahlung = abrechnung.positionen.reduce((s, p) => s + Number(p.vorauszahlungGesamt), 0);
  const summeSaldo = abrechnung.positionen.reduce((s, p) => s + Number(p.saldo), 0);

  const naechsterStatus = abrechnung.status === "ENTWURF" ? "FINAL" : "ENTWURF";
  const naechsterStatusAction = setAbrechnungStatus.bind(null, id, naechsterStatus);
  const neuBerechnenAction = neuBerechnen.bind(null, id);

  // Kostenaufschlüsselung: Objekt gesamt sowie je Haus (mehrere Hausnummern) und je Gebäude, jeweils
  // aus den gespeicherten Aufschlüsselungen der Positionen (siehe nk-uebersicht.ts).
  const positionenFuerUebersicht = abrechnung.positionen.map((p) => ({
    einheitId: p.einheitId,
    gebaeudeId: p.einheit.gebaeude.id,
    hausId: p.einheit.gebaeude.hausId,
    details: (p.details as KostenanteilDetailEintrag[] | null) ?? [],
  }));
  const uebersichtDaten: Record<string, Uebersicht> = {
    objekt: baueKostenUebersicht(
      positionenFuerUebersicht,
      "gesamt",
      leerstandRoh.map((l) => ({ kostenartName: l.kostenart.name, betrag: Number(l.betrag) })),
    ),
  };
  const uebersichtAuswahl: UebersichtAuswahl[] = [{ value: "objekt", label: "Objekt gesamt", gruppe: "objekt" }];
  const gebaeudeInAbrechnung = new Map<string, (typeof abrechnung.positionen)[number]["einheit"]["gebaeude"]>();
  for (const p of abrechnung.positionen) gebaeudeInAbrechnung.set(p.einheit.gebaeude.id, p.einheit.gebaeude);
  const hausListe = new Map<string, (typeof abrechnung.positionen)[number]["einheit"]["gebaeude"]["haus"]>();
  for (const g of gebaeudeInAbrechnung.values()) if (g.haus && g.haus.gebaeude.length > 1) hausListe.set(g.haus.id, g.haus);
  for (const haus of [...hausListe.values()].sort((a, b) => vergleicheHaus(a!, b!))) {
    const key = `haus:${haus!.id}`;
    uebersichtAuswahl.push({ value: key, label: hausLabel(haus!.gebaeude), gruppe: "haus" });
    uebersichtDaten[key] = baueKostenUebersicht(positionenFuerUebersicht.filter((p) => p.hausId === haus!.id),
      "anteil",
      leerstandRoh
        .filter((l) => l.einheit?.gebaeude.hausId === haus!.id)
        .map((l) => ({ kostenartName: l.kostenart.name, betrag: Number(l.betrag) })),
      positionenFuerUebersicht,
    );
  }
  for (const g of [...gebaeudeInAbrechnung.values()].sort((a, b) =>
    `${a.strasse} ${a.hausnummer}`.localeCompare(`${b.strasse} ${b.hausnummer}`, "de", { numeric: true }),
  )) {
    const key = `gebaeude:${g.id}`;
    uebersichtAuswahl.push({ value: key, label: `${g.strasse} ${g.hausnummer}`, gruppe: "gebaeude" });
    uebersichtDaten[key] = baueKostenUebersicht(positionenFuerUebersicht.filter((p) => p.gebaeudeId === g.id),
      "anteil",
      leerstandRoh
        .filter((l) => l.einheit?.gebaeudeId === g.id)
        .map((l) => ({ kostenartName: l.kostenart.name, betrag: Number(l.betrag) })),
      positionenFuerUebersicht,
    );
  }

  // Kostengruppen: frei zusammengestellte Gebäudegruppen über Haus-Grenzen hinweg (z.B. "Haus
  // 2-12" für einen gemeinsam abgerechneten Versorger-Anschluss mehrerer Häuser) — als weitere
  // Filter-Ebene neben Haus/Gebäude, nur wenn mindestens eine Einheit dieser Abrechnung zu ihr
  // gehört (eine Einheit gehört über ihr Gebäude ggf. zu mehreren Kostengruppen gleichzeitig,
  // siehe EinheitFuerAbrechnung.kostengruppenIds).
  const einheitenById = new Map(einheiten.map((e) => [e.id, e]));
  for (const kg of kostengruppenRoh) {
    const positionenDieserKostengruppe = positionenFuerUebersicht.filter((p) =>
      einheitenById.get(p.einheitId)?.kostengruppenIds.includes(kg.id),
    );
    if (positionenDieserKostengruppe.length === 0) continue;
    const key = `kostengruppe:${kg.id}`;
    uebersichtAuswahl.push({ value: key, label: kg.bezeichnung, gruppe: "kostengruppe" });
    uebersichtDaten[key] = baueKostenUebersicht(
      positionenDieserKostengruppe,
      "anteil",
      leerstandRoh
        .filter((l) => l.einheitId && einheitenById.get(l.einheitId)?.kostengruppenIds.includes(kg.id))
        .map((l) => ({ kostenartName: l.kostenart.name, betrag: Number(l.betrag) })),
      positionenFuerUebersicht,
    );
  }

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
            <SubmitButton
              pendingLabel="Berechne…"
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Neu berechnen
            </SubmitButton>
          </form>
          <form action={naechsterStatusAction}>
            <SubmitButton
              pendingLabel="Speichere…"
              className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
            >
              Als {STATUS_LABEL[naechsterStatus]} markieren
            </SubmitButton>
          </form>
          <DeleteButton
            action={deleteAbrechnung.bind(null, id)}
            confirmText="Abrechnung wirklich löschen? Alle Positionen gehen dabei verloren."
          />
        </div>
      </div>

      {uebersichtDaten.objekt.zeilen.length > 0 && (
        <Kostenuebersicht jahr={abrechnung.jahr} auswahl={uebersichtAuswahl} daten={uebersichtDaten} />
      )}

      {nichtBeruecksichtigt.some((n) => n.grund === "in_abrechnung_enthalten") && (
        <p className="mb-6 text-xs text-neutral-500">
          Bereits in der Techem-Abrechnung (Heizkosten pro Mieter) enthalten und deshalb nicht gesondert abgerechnet:{" "}
          {nichtBeruecksichtigt
            .filter((n) => n.grund === "in_abrechnung_enthalten")
            .map((n) => `${n.kostenartName} (${formatEuro(n.summe)})`)
            .join(", ")}
          .
        </p>
      )}

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
            Für mindestens eine betroffene Einheit fehlt ein Ablesewert für {abrechnung.jahr}. Die
            Kostenart wird deshalb nicht mit abgerechnet.
          </p>
        </div>
      )}

      {vorverteilteGruppen.length > 0 && (
        <details className="mb-6">
          <summary className="cursor-pointer select-none text-sm font-medium text-neutral-300 hover:text-white">
            Extern vorverteilte Kostenarten — hier bewusst nicht selbst berechnet ({vorverteilteGruppen.length})
          </summary>
          <p className="mb-3 mt-2 text-xs text-neutral-500">
            Die Pro-Mieter-Aufteilung liegt extern vor (z.B. Techem-Gesamtabrechnung) — trag den
            jeweiligen Betrag pro Mietvertrag ein und klicke danach auf &quot;Neu berechnen&quot;,
            damit er in den Kostenanteil einfließt.
          </p>
          {vorverteilteGruppen.map((g) => (
            <div key={g.kostenartId} className="mb-4">
              <VorverteilteKostenanteileForm
                jahr={abrechnung.jahr}
                kostenartId={g.kostenartId}
                kostenartName={g.kostenartName}
                zeilen={g.zeilen}
                leerstand={g.leerstand}
                einheiten={g.einheitOptionen}
              />
              <TechemAllgemeinstromForm
                jahr={abrechnung.jahr}
                kostenartId={g.kostenartId}
                betrag={techemAllgemeinstromAnteileById.get(g.kostenartId) ?? null}
              />
            </div>
          ))}
          {(() => {
            const mieter = vorverteilteKostenanteileRoh.reduce((s, v) => s + Number(v.betrag), 0);
            const leer = leerstandRoh.reduce((s, l) => s + Number(l.betrag), 0);
            return (
              <div className="ml-auto max-w-sm rounded-lg border border-neutral-700 p-3 text-sm">
                <p className="mb-1 text-xs uppercase text-neutral-400">Summe aller Einträge {abrechnung.jahr}</p>
                <div className="flex justify-between text-neutral-300"><span>Mieter</span><span>{formatEuro(mieter)}</span></div>
                <div className="flex justify-between text-neutral-300"><span>Leerstand</span><span>{formatEuro(leer)}</span></div>
                <div className="mt-1 flex justify-between border-t border-neutral-700 pt-1 font-medium text-white"><span>Gesamt</span><span>{formatEuro(mieter + leer)}</span></div>
              </div>
            );
          })()}
        </details>
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

      <p className="mb-3 text-sm text-neutral-400">
        <strong className="text-neutral-300">Saldo</strong> = Vorauszahlung − Kostenanteil (positiv
        = Guthaben, negativ = Nachzahlung).{" "}
        <strong className="text-neutral-300">Rückzahlung/Gutschrift</strong> zeigt die Summe der
        tatsächlich importierten/erfassten Nebenkostenausgleich-Zahlungen für Mietvertrag und Jahr
        — die echte Kontobewegung, unabhängig vom berechneten Saldo. Einzelne Zahlungen lassen sich
        unter{" "}
        <Link href="/nebenkostenausgleich" className="underline hover:text-white">
          Nebenkostenausgleich
        </Link>{" "}
        einsehen und korrigieren. <strong className="text-neutral-300">Saldo nach Gutschrift</strong>{" "}
        = Saldo − Rückzahlung/Gutschrift — der Betrag, der nach der echten Kontobewegung noch offen
        ist, falls einer offen ist; ist er 0, gilt die Position als erledigt.
      </p>

      <PositionenTable
        rows={abrechnung.positionen.map((p) => {
          const eintrag = p.mietvertragId ? nebenkostenausgleichSummen.get(p.mietvertragId) : undefined;
          const gutschriftSumme = eintrag?.summe ?? 0;
          const saldoNachGutschrift = Number(p.saldo) - gutschriftSumme;
          return {
            id: p.id,
            einheitId: p.einheitId,
            einheitBezeichnung: p.einheit.bezeichnung,
            gebaeudeLabel: gebaeudeOderHausLabel(p.einheit.gebaeude, p.einheit.gebaeude.haus),
            gebaeudeSortSchluessel:
              (p.einheit.gebaeude.haus?.reihenfolge ?? 999) * 1000 + Number(p.einheit.gebaeude.hausnummer),
            mieterNamen: p.mietvertrag
              ? p.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")
              : "–",
            zeitraumVon: p.zeitraumVon.toISOString(),
            zeitraumBis: p.zeitraumBis.toISOString(),
            kostenanteilGesamt: Number(p.kostenanteilGesamt),
            vorauszahlungGesamt: Number(p.vorauszahlungGesamt),
            saldo: Number(p.saldo),
            gutschriftSumme: eintrag ? eintrag.summe : null,
            gutschriftDatum: eintrag ? eintrag.juengstesDatum.toISOString() : null,
            saldoNachGutschrift,
            verrechnetSumme: eintrag ? eintrag.davonVerrechnet : 0,
            kautionSumme: eintrag ? eintrag.davonKaution : 0,
            erledigt: Math.abs(saldoNachGutschrift) < 0.01,
            mietvertragId: p.mietvertragId,
            details: (p.details as KostenanteilDetailEintrag[] | null) ?? [],
          };
        })}
      />

      <ManuellePositionForm
        abrechnungId={id}
        jahr={abrechnung.jahr}
        mietvertragKandidaten={mietvertragKandidaten}
      />
    </div>
  );
}
