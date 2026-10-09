import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { BEREICHE, formatBytes, type BereichKey } from "@/lib/dokumente-anzeige";
import {
  allgemeineOrdnerNamen,
  ladeDokumentIndex,
  ladeDokumente,
  ordnerVonBereich,
} from "@/lib/dokumente-uebersicht";
import { DokumentUpload } from "./dokument-upload";
import { SichereVorschlaegeKnopf } from "./sichere-vorschlaege-knopf";
import { DokumentTabelle, type DokumentRow } from "./dokument-tabelle";

const LINK = "text-neutral-400 hover:text-white hover:underline";

function Ordnerkarte({
  href,
  titel,
  anzahl,
  groesse,
  hinweis,
  gedimmt,
  badge,
}: {
  href: string;
  titel: string;
  anzahl: number;
  groesse: number;
  hinweis?: string;
  /** Z.B. beendete Mietverträge: optisch zurückgenommen. */
  gedimmt?: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg border border-neutral-800 p-4 hover:border-neutral-600 hover:bg-neutral-900 ${gedimmt ? "opacity-60" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-xl leading-none">📁</span>
        <div className="min-w-0">
          <div className="font-medium text-white [overflow-wrap:anywhere]">
            {titel}
            {badge && (
              <span className="ml-2 rounded-full border border-neutral-700 px-2 py-0.5 align-middle text-[10px] font-normal uppercase text-neutral-400">
                {badge}
              </span>
            )}
          </div>
          <div className="text-xs text-neutral-500">
            {anzahl} {anzahl === 1 ? "Datei" : "Dateien"}
            {groesse > 0 && ` · ${formatBytes(groesse)}`}
            {hinweis && ` · ${hinweis}`}
          </div>
        </div>
      </div>
    </Link>
  );
}

// Die Texterkennung läuft beim Hochladen in derselben Anfrage (Claude liest das PDF).
export const maxDuration = 60;

export default async function DokumentePage({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string; ordner?: string; ansicht?: string; status?: string }>;
}) {
  const { bereich: bereichParam, ordner: ordnerParam, ansicht, status: statusParam } = await searchParams;
  const [user, index] = await Promise.all([getCurrentUser(), ladeDokumentIndex()]);
  const editierbar = user?.role !== "GAST";

  const bereich = BEREICHE.find((b) => b.key === bereichParam) ?? null;
  const alleAnsicht = ansicht === "alle";
  // Die Übersicht rechnet nur mit dem schlanken Index; die schweren Zeilen (Mietvertrag, Einheit, Gebäude …)
  // lädt erst der geöffnete Bereich bzw. Ordner. Ist der Ordner leer/unbekannt, zeigt die Seite die Ordnerliste.
  let zeilen = alleAnsicht ? await ladeDokumente() : bereich ? await ladeDokumente({ bereich: bereich.key, ordnerKey: ordnerParam }) : [];
  if (!alleAnsicht && bereich && ordnerParam !== undefined && zeilen.length === 0) zeilen = await ladeDokumente({ bereich: bereich.key });
  const ordnerListe = bereich ? ordnerVonBereich(zeilen, bereich.key) : [];
  // Filter der Mieterakten: laufende (aktiv/geplant) oder beendete Mietverträge; Standard = alle.
  const statusFilter = bereich?.key === "mietvertraege" && (statusParam === "aktuell" || statusParam === "beendet") ? statusParam : "alle";
  const sichtbareOrdner = ordnerListe.filter(
    (o) => statusFilter === "alle" || (statusFilter === "beendet") === (o.vertragStatus === "BEENDET"),
  );
  // „Eingang“ hat keine Unterordner: der Bereich zeigt direkt die Liste.
  const eingangAnsicht = bereich?.key === "eingang";
  const ordner = bereich && ordnerParam !== undefined ? ordnerListe.find((o) => o.key === ordnerParam) ?? null : null;

  const sichtbar = alleAnsicht || eingangAnsicht
    ? zeilen
    : bereich && ordner
      ? zeilen.filter((z) => z.bereich === bereich.key && z.ordnerKey === ordner.key)
      : [];

  const rows: DokumentRow[] = sichtbar.map((z) => ({
    id: z.id,
    dateiname: z.dateiname,
    groesseBytes: z.groesseBytes,
    belegDatum: z.belegDatum?.toISOString() ?? null,
    createdAt: z.createdAt.toISOString(),
    hochgeladenVon: z.hochgeladenVon,
    bereich: z.bereich,
    ordnerLabel: z.ordnerLabel,
    bezugLabel: z.bezugLabel,
    bezugHref: z.bezugHref,
    revalidatePath: z.revalidatePath,
    vertragStatus: z.vertragStatus,
    schreibgeschuetzt: z.schreibgeschuetzt,
    downloadHref: z.downloadHref,
    art: z.art,
    aussteller: z.aussteller,
    rechnungsnummer: z.rechnungsnummer,
    betrag: z.betrag,
    detailHref: z.detailHref,
  }));

  // Upload vorbelegen mit dem gerade geöffneten Ordner.
  const vorBereich: BereichKey | null = bereich?.key ?? null;
  const vorgabe = {
    bereich: vorBereich && vorBereich !== "kosten" ? vorBereich : ("eingang" as const),
    bezugId: bereich && ordner && bereich.key !== "kosten" && bereich.key !== "allgemein" && bereich.key !== "eingang"
        ? ordner.key
        : "",
    ordner: bereich?.key === "allgemein" && ordner && ordner.label !== "Ohne Ordner" ? ordner.label : "",
  };

  const gesamtGroesse = index.reduce((s, e) => s + (e.groesseBytes ?? 0), 0);
  const ordnerNamen = allgemeineOrdnerNamen(index);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Dokumente</h1>
        <p className="text-sm text-neutral-400">
          Alle hochgeladenen Dateien an einem Ort — {index.length} Dateien, {formatBytes(gesamtGroesse)}. Neue Dokumente
          kommen in den <strong>Eingang</strong>: die Texterkennung liest Rechnungen und Bescheide (Aussteller, Rechnungsnummer,
          Betrag …), die Seite „Details“ schlägt eine passende Kostenposition oder Mieterakte vor, und die Zuordnung ist
          einmalig und danach fest. Die übrigen Ordner ergeben sich aus dem Bezug (Mieterakte je Mietvertrag, Einheit,
          Kostenjahr, Dienstleister, Ticket); Unkategorisiertes legst du in frei benannten Ordnern ab. Mit „Art“ lässt sich die
          Liste filtern. Kostenbelege lassen sich nicht löschen, nur ausblenden. Die Kontoauszug-Dateien der Importe stehen
          nicht hier, sondern unter Kontoauszug → Importe.
        </p>
      </div>

      {editierbar && (
        <div className="mb-6">
          {/* key: bei Ordnerwechsel Formular mit neuer Vorbelegung aufbauen */}
          <DokumentUpload
            key={`${bereich?.key ?? ""}/${ordner?.key ?? ""}`}
            ordnerNamen={ordnerNamen}
            vorgabe={vorgabe}
          />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/dokumente" className={!alleAnsicht ? "font-medium text-white" : LINK}>
          Ordner
        </Link>
        <Link href="/dokumente?ansicht=alle" className={alleAnsicht ? "font-medium text-white" : LINK}>
          Alle Dokumente
        </Link>
        {!alleAnsicht && bereich && (
          <span className="text-neutral-500">
            /{" "}
            <Link href={`/dokumente?bereich=${bereich.key}`} className={LINK}>
              {bereich.label}
            </Link>
            {ordner && <> / <span className="text-neutral-300">{ordner.label}</span></>}
          </span>
        )}
      </div>

      {eingangAnsicht && editierbar && sichtbar.length > 0 && <SichereVorschlaegeKnopf />}

      {alleAnsicht || eingangAnsicht || (bereich && ordner) ? (
        <DokumentTabelle
          rows={rows}
          zeigeBereich={alleAnsicht}
          ordnerNamen={ordnerNamen}
          editierbar={editierbar}
        />
      ) : bereich ? (
        ordnerListe.length === 0 ? (
          <p className="text-sm text-neutral-500">In „{bereich.label}“ liegen noch keine Dokumente.</p>
        ) : (
          <>
            {bereich.key === "mietvertraege" && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="text-neutral-500">Mietverhältnis:</span>
                {(
                  [
                    ["alle", "Alle", ordnerListe.length],
                    ["aktuell", "Laufend", ordnerListe.filter((o) => o.vertragStatus !== "BEENDET").length],
                    ["beendet", "Beendet", ordnerListe.filter((o) => o.vertragStatus === "BEENDET").length],
                  ] as const
                ).map(([key, label, anzahl]) => (
                  <Link
                    key={key}
                    href={key === "alle" ? "/dokumente?bereich=mietvertraege" : `/dokumente?bereich=mietvertraege&status=${key}`}
                    className={`rounded-full border px-2.5 py-1 ${
                      statusFilter === key
                        ? "border-white text-white"
                        : "border-neutral-700 text-neutral-300 hover:border-neutral-500 hover:text-white"
                    }`}
                  >
                    {label} ({anzahl})
                  </Link>
                ))}
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {sichtbareOrdner.map((o) => (
                <Ordnerkarte
                  key={o.key}
                  href={`/dokumente?bereich=${bereich.key}&ordner=${encodeURIComponent(o.key)}`}
                  titel={o.label}
                  anzahl={o.anzahl}
                  groesse={o.groesse}
                  gedimmt={o.vertragStatus === "BEENDET"}
                  badge={o.vertragStatus === "BEENDET" ? "beendet" : o.vertragStatus === "GEPLANT" ? "geplant" : undefined}
                />
              ))}
            </div>
          </>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BEREICHE.map((b) => {
            const vonBereich = index.filter((e) => e.bereich === b.key);
            // Leere Bereiche blenden wir aus; hochladen kann man über das Formular oben trotzdem dorthin.
            if (vonBereich.length === 0) return null;
            return (
              <Ordnerkarte
                key={b.key}
                href={`/dokumente?bereich=${b.key}`}
                titel={b.label}
                anzahl={vonBereich.length}
                groesse={vonBereich.reduce((s, z) => s + (z.groesseBytes ?? 0), 0)}
                hinweis={b.hinweis}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
