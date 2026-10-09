import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { BEREICHE, artLabel, formatBytes, formatDate, formatEuro } from "@/lib/dokumente-anzeige";
import { allgemeineOrdnerNamen, ladeDokumentIndex, ladeDokumentZeile, type BezugTyp } from "@/lib/dokumente-uebersicht";
import {
  ladeBuchungVorschlaege,
  ladeDienstleisterVorschlag,
  ladeEinheitVorschlaege,
  ladeGebaeudeVorschlaege,
  ladeMietvertragVorschlaege,
  type DokumentLabels,
} from "@/lib/dokument-zuordnung";
import { istErkennbar, type ErkennungErgebnis } from "@/lib/dokument-erkennung";
import type { ZuordnungsZiel } from "../actions";
import { AufteilenPanel, BezuegePanel, ErkennenBereich, LabelsForm, type AktuellerBezug, type LabelWerte, type Vorschlag } from "./dokument-formulare";

// Die Texterkennung läuft in einer Server-Aktion dieser Seite (Claude liest das PDF).
export const maxDuration = 60;

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const betragText = (b: unknown) => (b === null || b === undefined ? "" : Number(b).toFixed(2).replace(".", ","));

const ZIEL_VON_TYP: Record<BezugTyp, ZuordnungsZiel> = {
  mietvertraege: "mietvertrag",
  einheiten: "einheit",
  gebaeude: "gebaeude",
  kosten: "buchung",
  dienstleister: "dienstleister",
  tickets: "ticket",
};

export default async function DokumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, zeile, dokument, kostenarten] = await Promise.all([
    getCurrentUser(),
    ladeDokumentZeile(id),
    prisma.dokument.findUnique({
      where: { id },
      include: {
        herkunft: { select: { id: true, titel: true, dateiname: true } },
        teile: { select: { id: true, titel: true, dateiname: true }, orderBy: { dateiname: "asc" } },
      },
    }),
    prisma.kostenart.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!zeile || !dokument) notFound();
  const editierbar = user?.role !== "GAST";

  // Ein aufgeteiltes Original ist nur noch Archiv (die Angaben und Bezüge stehen an den Teilen).
  const nurAnsicht = dokument.teile.length > 0;
  const kannBearbeiten = editierbar && !nurAnsicht;

  const labels: DokumentLabels = {
    aussteller: dokument.aussteller,
    rechnungsnummer: dokument.rechnungsnummer,
    betrag: dokument.betrag === null ? null : Number(dokument.betrag),
    belegDatum: dokument.belegDatum,
    kostenjahr: dokument.kostenjahr,
    iban: dokument.iban,
    adressat: dokument.adressat,
    objektHinweis: dokument.objektHinweis,
    art: dokument.art,
  };

  const bezuege: AktuellerBezug[] = zeile.bezuege.map((b) => ({
    ziel: ZIEL_VON_TYP[b.typ],
    label: b.label,
    href: b.href,
    entfernbar: b.typ !== "kosten",
  }));
  const hat = (z: ZuordnungsZiel) => bezuege.some((b) => b.ziel === z);

  // Vorschläge nur für Bezüge, die noch fehlen, und nur für Bearbeiter. Kostenpositionen brauchen Betrag, Rechnungsnummer
  // oder Aussteller als Anhaltspunkt.
  let vorschlaege: Vorschlag[] = [];
  if (kannBearbeiten) {
    // Ein Angebot findet seine Kostenposition über Objekt und Aussteller, nicht über Betrag oder Nummer.
    const hatAnhalt = labels.betrag !== null || !!labels.rechnungsnummer || !!labels.aussteller || (labels.art === "ANGEBOT" && !!labels.objektHinweis);
    const [buchungen, vertraege, einheiten, gebaeude, dienstleister] = await Promise.all([
      !hat("buchung") && hatAnhalt ? ladeBuchungVorschlaege(labels) : Promise.resolve([]),
      !hat("mietvertrag") ? ladeMietvertragVorschlaege(labels) : Promise.resolve([]),
      !hat("einheit") ? ladeEinheitVorschlaege(labels) : Promise.resolve([]),
      !hat("gebaeude") ? ladeGebaeudeVorschlaege(labels) : Promise.resolve([]),
      !hat("dienstleister") ? ladeDienstleisterVorschlag(dokument.aussteller) : Promise.resolve(null),
    ]);
    vorschlaege = [
      ...buchungen.map(
        (b): Vorschlag => ({
          ziel: "buchung",
          zielId: b.buchungId,
          titel: `${b.datum ? b.datum.split("-").reverse().join(".") : "ohne Datum"} · ${b.empfaenger || "–"} · ${formatEuro(b.betrag)}`,
          details: `${b.kostenart}${b.verwendungszweck ? ` — ${b.verwendungszweck}` : ""}${b.belege > 0 ? ` · hat schon ${b.belege} Beleg${b.belege === 1 ? "" : "e"}` : ""}`,
          gruende: b.bewertung.gruende,
          sicher: b.bewertung.sicher,
        }),
      ),
      ...vertraege.map((v): Vorschlag => ({ ziel: "mietvertrag", zielId: v.mietvertragId, titel: v.label, details: "", gruende: v.gruende })),
      ...einheiten.map((e): Vorschlag => ({ ziel: "einheit", zielId: e.einheitId, titel: e.label, details: "", gruende: ["Adresse und Wohnung stehen im Dokument"] })),
      ...gebaeude.map((g): Vorschlag => ({ ziel: "gebaeude", zielId: g.gebaeudeId, titel: g.label, details: "", gruende: ["Adresse steht im Dokument"] })),
      ...(dienstleister
        ? [{ ziel: "dienstleister", zielId: dienstleister.dienstleisterId, titel: dienstleister.name, details: "", gruende: ["Aussteller passt zu den Suchbegriffen des Dienstleisters"] } satisfies Vorschlag]
        : []),
    ];
  }
  // Ordnernamen für „Ohne Bezug ablegen“ nur im Eingang.
  const ordnerNamen = kannBearbeiten && dokument.eingang && bezuege.length === 0 ? allgemeineOrdnerNamen(await ladeDokumentIndex()) : [];

  const werte: LabelWerte = {
    art: dokument.art ?? "",
    titel: dokument.titel ?? "",
    belegDatum: iso(dokument.belegDatum),
    aussteller: dokument.aussteller ?? "",
    rechnungsnummer: dokument.rechnungsnummer ?? "",
    betrag: betragText(dokument.betrag),
    leistungVon: iso(dokument.leistungVon),
    leistungBis: iso(dokument.leistungBis),
    kostenjahr: dokument.kostenjahr?.toString() ?? "",
    iban: dokument.iban ?? "",
    kostenartId: dokument.kostenartId ?? "",
    adressat: dokument.adressat ?? "",
    objektHinweis: dokument.objektHinweis ?? "",
  };
  const erkennung = dokument.erkennung as ErkennungErgebnis | null;
  // Sammel-PDF: nur anbieten, solange es nicht aufgeteilt ist und noch keine Bezüge hat.
  const aufteilbar =
    editierbar && !dokument.ausgeblendetAm && bezuege.length === 0 && dokument.mimeType === "application/pdf" && (erkennung?.teile?.length ?? 0) > 1
      ? { seiten: erkennung?.seiten ?? 0, teile: erkennung!.teile!.map((t, i) => ({ quelleIndex: i, titel: t.titel, aussteller: t.aussteller, rechnungsnummer: t.rechnungsnummer, betrag: t.betrag, seiteVon: t.seiteVon, seiteBis: t.seiteBis })) }
      : null;
  const bereichLabel = BEREICHE.find((b) => b.key === zeile.bereich)?.label ?? zeile.bereich;
  const vorschau = dokument.mimeType === "application/pdf" ? "pdf" : dokument.mimeType?.startsWith("image/") ? "bild" : null;

  return (
    <div>
      <div className="mb-4 text-sm text-neutral-500">
        <Link href="/dokumente" className="hover:text-white hover:underline">
          Dokumente
        </Link>{" "}
        / <Link href={`/dokumente?bereich=${zeile.bereich}`} className="hover:text-white hover:underline">{bereichLabel}</Link>
      </div>
      <h1 className="mb-1 text-2xl font-semibold text-white [overflow-wrap:anywhere]">{dokument.titel ?? dokument.dateiname}</h1>
      <p className="mb-6 text-sm text-neutral-400">
        {dokument.titel && <>{dokument.dateiname} · </>}
        {artLabel(dokument.art)} · {formatBytes(dokument.groesseBytes)} · hochgeladen am {formatDate(dokument.createdAt)}
        {dokument.hochgeladenVon && ` von ${dokument.hochgeladenVon}`} ·{" "}
        <a href={`/api/dokumente/${id}/download`} className="text-white underline">
          Herunterladen
        </a>
        {dokument.ausgeblendetAm && (
          <span className="ml-2 rounded-full border border-neutral-700 px-2 py-0.5 text-xs">
            ausgeblendet am {formatDate(dokument.ausgeblendetAm)}
            {dokument.ausgeblendetVon && ` von ${dokument.ausgeblendetVon}`}
          </span>
        )}
      </p>

      {dokument.herkunft && (
        <p className="mb-4 rounded-lg border border-neutral-800 p-3 text-sm text-neutral-300">
          Teil eines aufgeteilten PDFs — Original:{" "}
          <Link href={`/dokumente/${dokument.herkunft.id}`} className="text-white underline">
            {dokument.herkunft.titel ?? dokument.herkunft.dateiname}
          </Link>
        </p>
      )}
      {dokument.teile.length > 0 && (
        <div className="mb-4 rounded-lg border border-neutral-800 p-3 text-sm text-neutral-300">
          Dieses PDF wurde aufgeteilt in:
          <ul className="mt-1 list-disc pl-5">
            {dokument.teile.map((t) => (
              <li key={t.id}>
                <Link href={`/dokumente/${t.id}`} className="text-white underline [overflow-wrap:anywhere]">
                  {t.titel ?? t.dateiname}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {aufteilbar && aufteilbar.seiten > 0 && <AufteilenPanel id={id} seiten={aufteilbar.seiten} teile={aufteilbar.teile} />}
          {kannBearbeiten ? (
            <BezuegePanel id={id} eingang={dokument.eingang} bezuege={bezuege} vorschlaege={vorschlaege} ordnerNamen={ordnerNamen} art={dokument.art} gelesen={dokument.erkanntAm !== null} />
          ) : (
            <div className="rounded-lg border border-neutral-800 p-4 text-sm">
              <h2 className="mb-2 text-lg font-medium text-white">Bezüge</h2>
              {bezuege.length === 0 ? (
                <span className="text-neutral-400">{dokument.eingang ? "Noch nicht abgelegt (Eingang)" : "Kein Bezug (Unkategorisiert)"}</span>
              ) : (
                <ul className="space-y-1">
                  {bezuege.map((b) => (
                    <li key={b.ziel}>
                      <Link href={b.href} prefetch={false} className="text-white underline [overflow-wrap:anywhere]">
                        {b.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          <LabelsForm
            key={`${dokument.erkanntAm?.toISOString() ?? ""}-${JSON.stringify(werte)}`}
            id={id}
            werte={werte}
            kostenarten={kostenarten}
            editierbar={kannBearbeiten}
          />
          <ErkennenBereich
            id={id}
            erkanntAm={dokument.erkanntAm ? formatDate(dokument.erkanntAm) : null}
            konfidenz={erkennung?.konfidenz ?? null}
            hinweis={erkennung?.hinweis ?? null}
            erkennbar={istErkennbar(dokument.mimeType)}
            editierbar={kannBearbeiten}
          />
        </div>
        <div>
          {vorschau === "pdf" ? (
            <iframe src={`/api/dokumente/${id}/download?ansicht=inline`} title={dokument.dateiname} className="h-[75vh] w-full rounded-lg border border-neutral-800 bg-white" />
          ) : vorschau === "bild" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={`/api/dokumente/${id}/download`} alt={dokument.dateiname} className="max-h-[75vh] rounded-lg border border-neutral-800" />
          ) : (
            <p className="text-sm text-neutral-500">Für diesen Dateityp gibt es keine Vorschau — bitte herunterladen.</p>
          )}
        </div>
      </div>
    </div>
  );
}
