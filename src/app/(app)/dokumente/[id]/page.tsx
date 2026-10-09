import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { BEREICHE, artLabel, formatBytes, formatDate, formatEuro } from "@/lib/dokumente-anzeige";
import { ladeBezugOptionen, ladeDokumentZeile } from "@/lib/dokumente-uebersicht";
import {
  ladeBuchungAuswahl,
  ladeBuchungVorschlaege,
  ladeDienstleisterVorschlag,
  ladeMietvertragVorschlaege,
  type DokumentLabels,
} from "@/lib/dokument-zuordnung";
import { istErkennbar, type Erkennung } from "@/lib/dokument-erkennung";
import { ErkennenBereich, LabelsForm, ZuordnenPanel, type LabelWerte, type Vorschlag } from "./dokument-formulare";

// Die Texterkennung läuft in einer Server-Aktion dieser Seite (Claude liest das PDF).
export const maxDuration = 60;

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const betragText = (b: unknown) => (b === null || b === undefined ? "" : Number(b).toFixed(2).replace(".", ","));

export default async function DokumentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [user, zeile, dokument, kostenarten] = await Promise.all([
    getCurrentUser(),
    ladeDokumentZeile(id),
    prisma.dokument.findUnique({ where: { id } }),
    prisma.kostenart.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  if (!zeile || !dokument) notFound();
  const editierbar = user?.role !== "GAST";

  const labels: DokumentLabels = {
    aussteller: dokument.aussteller,
    rechnungsnummer: dokument.rechnungsnummer,
    betrag: dokument.betrag === null ? null : Number(dokument.betrag),
    belegDatum: dokument.belegDatum,
    kostenjahr: dokument.kostenjahr,
    iban: dokument.iban,
    adressat: dokument.adressat,
    objektHinweis: dokument.objektHinweis,
  };

  // Vorschläge und Auswahllisten nur für Dokumente im Eingang (und nur für Bearbeiter).
  let vorschlaege: Vorschlag[] = [];
  let optionen: Awaited<ReturnType<typeof bauOptionen>> | null = null;
  if (dokument.eingang && editierbar) {
    const [buchungen, vertraege, dienstleister] = await Promise.all([
      ladeBuchungVorschlaege(labels),
      ladeMietvertragVorschlaege(labels),
      ladeDienstleisterVorschlag(dokument.aussteller),
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
      ...vertraege.map(
        (v): Vorschlag => ({ ziel: "mietvertrag", zielId: v.mietvertragId, titel: v.label, details: "", gruende: v.gruende }),
      ),
      ...(dienstleister
        ? [{ ziel: "dienstleister", zielId: dienstleister.dienstleisterId, titel: dienstleister.name, details: "Aussteller passt zu den Suchbegriffen des Dienstleisters", gruende: [] } satisfies Vorschlag]
        : []),
    ];
    optionen = await bauOptionen(labels);
  }

  const werte: LabelWerte = {
    art: dokument.art ?? "",
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
  const erkennung = dokument.erkennung as Erkennung | null;
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
      <h1 className="mb-1 text-2xl font-semibold text-white [overflow-wrap:anywhere]">{dokument.dateiname}</h1>
      <p className="mb-6 text-sm text-neutral-400">
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

      <div className="mb-6 rounded-lg border border-neutral-800 p-4 text-sm">
        <span className="text-neutral-400">Zugeordnet zu: </span>
        {dokument.eingang ? (
          <span className="text-white">Noch nicht zugeordnet (Eingang)</span>
        ) : zeile.bezugHref ? (
          <Link href={zeile.bezugHref} className="text-white underline [overflow-wrap:anywhere]">
            {zeile.bezugLabel}
          </Link>
        ) : (
          <span className="text-white">Unkategorisiert — Ordner „{zeile.ordnerLabel}“</span>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-6">
          {dokument.eingang && editierbar && optionen && <ZuordnenPanel id={id} vorschlaege={vorschlaege} optionen={optionen} />}
          <LabelsForm
            key={`${dokument.erkanntAm?.toISOString() ?? ""}-${JSON.stringify(werte)}`}
            id={id}
            werte={werte}
            kostenarten={kostenarten}
            editierbar={editierbar}
          />
          <ErkennenBereich
            id={id}
            erkanntAm={dokument.erkanntAm ? formatDate(dokument.erkanntAm) : null}
            konfidenz={erkennung?.konfidenz ?? null}
            hinweis={erkennung?.hinweis ?? null}
            erkennbar={istErkennbar(dokument.mimeType)}
            editierbar={editierbar}
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

async function bauOptionen(labels: DokumentLabels) {
  const [bezug, buchungen] = await Promise.all([ladeBezugOptionen(), ladeBuchungAuswahl(labels)]);
  return { buchung: buchungen, mietvertrag: bezug.mietvertraege, einheit: bezug.einheiten, dienstleister: bezug.dienstleister, ticket: bezug.tickets };
}
