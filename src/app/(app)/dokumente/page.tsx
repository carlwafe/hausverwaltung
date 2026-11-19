import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { ART_GRUPPEN, ART_OPTIONEN, BEREICHE, HAUPTORDNER, OBJEKT_ARTEN, artLabel, formatBytes, hauptordnerVonBereich, inHauptordner, type BereichKey } from "@/lib/dokumente-anzeige";
import {
  allgemeineOrdnerNamen,
  ladeDokumentIndex,
  ladeDokumente,
  ordnerVonBereich,
} from "@/lib/dokumente-uebersicht";
import { DokumentUpload } from "./dokument-upload";
import { SichereVorschlaegeKnopf } from "./sichere-vorschlaege-knopf";
import { KiPruefungKnopf } from "./ki-pruefung-knopf";
import { prisma } from "@/lib/prisma";
import { EINGANG_OFFEN_WHERE } from "@/lib/dokument-eingang-offen";
import { DokumentTabelle, type DokumentRow } from "./dokument-tabelle";

const LINK = "text-neutral-400 hover:text-white hover:underline";

const ABSCHNITT_TITEL: Record<BereichKey, string> = {
  eingang: "Eingang",
  mietvertraege: "Je Mietvertrag",
  einheiten: "Je Einheit",
  haus: "Je Haus",
  gebaeude: "Je Gebäude",
  kosten: "Je Kostenjahr",
  dienstleister: "Je Dienstleister",
  tickets: "Je Ticket",
  allgemein: "Frei benannte Ordner (ohne Bezug)",
};

// Kurztext je Hauptordner (die ausführliche Fassung steht in `HAUPTORDNER.hinweis`).
const HAUPT_KURZ: Record<string, string> = {
  eingang: "Noch nicht abgelegt",
  kosten: "Rechnungen, Bescheide, Abrechnungen",
  mietverhaeltnisse: "Verträge, Schreiben, Protokolle",
  objekt: "Häuser, Gebäude, Einheiten",
  sonstiges: "Tickets und freie Ordner",
};

// Strich-Symbole der Hauptordner (24er Raster, `currentColor`) — je Ordner ein eigenes Motiv statt eines Ordner-Symbols.
const HAUPT_SYMBOL: Record<string, string> = {
  eingang: "M3 13l3-8h12l3 8v6H3v-6z M3 13h5l1 3h6l1-3h5",
  kosten: "M6 3h12v18l-3-2-3 2-3-2-3 2V3z M9 8h6 M9 12h6",
  mietverhaeltnisse: "M15.5 8a3.5 3.5 0 1 1-7 0 3.5 3.5 0 0 1 7 0z M5 20c0-3.5 3-6 7-6s7 2.5 7 6",
  objekt: "M4 11l8-7 8 7 M6 10v10h12V10 M10 20v-6h4v6",
  sonstiges: "M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z",
};

/** Große Kachel eines Hauptordners auf der Startseite: Symbol, Name, Kurztext, Anzahl. */
function Hauptkachel({ href, schluessel, titel, anzahl, hervorgehoben }: { href: string; schluessel: string; titel: string; anzahl: number; hervorgehoben?: boolean }) {
  return (
    <Link href={href} className="group flex items-center gap-4 rounded-xl border border-neutral-800 p-5 hover:border-neutral-600 hover:bg-neutral-900">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-neutral-800 text-neutral-400 group-hover:text-white">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
          <path d={HAUPT_SYMBOL[schluessel]} />
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-white">{titel}</span>
        <span className="block truncate text-xs text-neutral-500">{hervorgehoben ? "Zu prüfen" : HAUPT_KURZ[schluessel]}</span>
      </span>
      <span className={`text-2xl font-semibold tabular-nums ${hervorgehoben ? "text-amber-400" : "text-white"}`}>{anzahl}</span>
    </Link>
  );
}

/** Zeile eines Unterordners: Name links, Anzahl der Dateien rechts — ohne Symbol und Zusatztext. */
function Ordnerzeile({
  href,
  titel,
  unter,
  anzahl,
  gedimmt,
  badge,
}: {
  href: string;
  titel: string;
  /** Zweite, kleine Zeile (z.B. Mieter unter der Einheit). */
  unter?: string;
  anzahl: number;
  /** Z.B. beendete Mietverträge: optisch zurückgenommen. */
  gedimmt?: boolean;
  badge?: string;
}) {
  return (
    <Link
      href={href}
      title={unter ? `${titel} (${unter})` : titel}
      className={`flex items-center gap-3 rounded-lg border border-neutral-800 px-4 py-3 hover:border-neutral-600 hover:bg-neutral-900 ${gedimmt ? "opacity-60" : ""}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-white">{titel}</span>
        {unter && <span className="block truncate text-xs text-neutral-500">{unter}</span>}
      </span>
      {badge && <span className="shrink-0 rounded-full border border-neutral-700 px-2 py-0.5 text-[10px] uppercase text-neutral-400">{badge}</span>}
      <span className="shrink-0 text-sm tabular-nums text-neutral-500" title={`${anzahl} ${anzahl === 1 ? "Datei" : "Dateien"}`}>
        {anzahl}
      </span>
    </Link>
  );
}

/** „Einheit (Mieter)“ → Einheit als Titel, Mieter klein darunter; andere Namen bleiben einzeilig. */
function zweizeilig(label: string): { titel: string; unter?: string } {
  const m = label.match(/^(.*) \(([^()]+)\)$/);
  return m ? { titel: m[1], unter: m[2] } : { titel: label };
}

const RASTER = "grid gap-2 sm:grid-cols-2 lg:grid-cols-3";
const ABSCHNITT = "mb-2 text-xs font-medium uppercase text-neutral-500";

// Die Regel-Erkennung läuft beim Hochladen in derselben Anfrage; die KI-Prüfung (Claude) per Knopf, bis zu 6 Dokumente pro Klick.
export const maxDuration = 60;

export default async function DokumentePage({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string; ordner?: string; ansicht?: string; status?: string; art?: string; gruppe?: string; q?: string }>;
}) {
  const { bereich: bereichParam, ordner: ordnerParam, ansicht, status: statusParam, art: artParam, gruppe: gruppeParam, q } = await searchParams;
  const suche = q?.trim() ?? "";
  const [user, index] = await Promise.all([getCurrentUser(), ladeDokumentIndex()]);
  const editierbar = user?.role !== "GAST";

  const bereich = BEREICHE.find((b) => b.key === bereichParam) ?? null;
  const alleAnsicht = ansicht === "alle";
  const typAnsicht = ansicht === "typ";
  const artGewaehlt = typAnsicht && artParam ? artParam : null;
  // Die Übersicht rechnet nur mit dem schlanken Index; die schweren Zeilen (Mietvertrag, Einheit, Gebäude …)
  // lädt erst der geöffnete Bereich bzw. Ordner. Ist der Ordner leer/unbekannt, zeigt die Seite die Ordnerliste.
  let zeilen = alleAnsicht
    ? await ladeDokumente()
    : artGewaehlt
      ? await ladeDokumente({ art: artGewaehlt })
      : bereich
        ? await ladeDokumente({ bereich: bereich.key, ordnerKey: ordnerParam })
        : [];
  if (!alleAnsicht && !typAnsicht && bereich && ordnerParam !== undefined && zeilen.length === 0) zeilen = await ladeDokumente({ bereich: bereich.key });
  // Hauptordner mit Abschnitten (Kosten, Objekt, Sonstiges): alle Unterordner seiner Bereiche.
  const gruppe = !alleAnsicht && !typAnsicht && !bereich ? (HAUPTORDNER.find((h) => h.key === gruppeParam && h.href.includes("gruppe=")) ?? null) : null;
  const gruppenOrdner = gruppe
    ? await Promise.all(
        gruppe.bereiche.map(async (b) => ({ bereich: b as BereichKey, ordner: ordnerVonBereich(await ladeDokumente({ bereich: b as BereichKey }), b as BereichKey) })),
      )
    : [];
  const ordnerListe = bereich && !typAnsicht ? ordnerVonBereich(zeilen, bereich.key) : [];
  const hauptordner = bereich ? hauptordnerVonBereich(bereich.key) : null;
  // Filter der Mieterakten: laufende (aktiv/geplant) oder beendete Mietverträge; Standard = alle.
  const statusFilter = bereich?.key === "mietvertraege" && (statusParam === "aktuell" || statusParam === "beendet") ? statusParam : "alle";
  const sichtbareOrdner = ordnerListe.filter(
    (o) => statusFilter === "alle" || (statusFilter === "beendet") === (o.vertragStatus === "BEENDET"),
  );
  // „Eingang“ hat keine Unterordner: der Bereich zeigt direkt die Liste.
  const eingangAnsicht = bereich?.key === "eingang" && !typAnsicht;
  const ordner = bereich && ordnerParam !== undefined && !typAnsicht ? ordnerListe.find((o) => o.key === ordnerParam) ?? null : null;

  // Eingang: wie viele Dokumente haben die Regeln nicht sicher erkannt (KI-Prüfung per Knopf)?
  const kiOffen = eingangAnsicht && editierbar ? await prisma.dokument.count({ where: EINGANG_OFFEN_WHERE }) : 0;

  const sichtbar = alleAnsicht || eingangAnsicht || artGewaehlt
    ? zeilen
    : bereich && ordner
      ? zeilen.filter((z) => z.bereich === bereich.key && z.ordnerKey === ordner.key)
      : [];

  const rows: DokumentRow[] = sichtbar.map((z) => ({
    id: z.id,
    dateiname: z.dateiname,
    titel: z.titel,
    groesseBytes: z.groesseBytes,
    belegDatum: z.belegDatum?.toISOString() ?? null,
    createdAt: z.createdAt.toISOString(),
    hochgeladenVon: z.hochgeladenVon,
    bereich: z.bereich,
    ordnerLabel: z.ordnerLabel,
    bezuege: z.bezuege.map((b) => ({ typ: b.typ, label: b.label, href: b.href, beendet: b.vertragStatus === "BEENDET" })),
    hatBuchung: z.hatBuchung,
    art: z.art,
    aussteller: z.aussteller,
    rechnungsnummer: z.rechnungsnummer,
    betrag: z.betrag,
    detailHref: z.detailHref,
  }));

  // Upload: im geöffneten Ordner lässt sich direkt ablegen, sonst geht alles in den Eingang.
  const direktBereiche = ["mietvertraege", "einheiten", "gebaeude", "dienstleister", "tickets"];
  const vorgabe =
    bereich && ordner && !typAnsicht && direktBereiche.includes(bereich.key)
      ? { bereich: bereich.key, bezugId: ordner.key, ordner: "", label: ordner.label }
      : bereich && ordner && !typAnsicht && bereich.key === "allgemein"
        ? { bereich: "allgemein", bezugId: "", ordner: ordner.label !== "Ohne Ordner" ? ordner.label : "", label: ordner.label }
        : null;

  const gesamtGroesse = index.reduce((s, e) => s + (e.groesseBytes ?? 0), 0);
  const ordnerNamen = allgemeineOrdnerNamen(index);
  const ansichtLink = (aktiv: boolean) => `rounded-md px-3 py-1.5 ${aktiv ? "bg-neutral-800 font-medium text-white" : "text-neutral-400 hover:text-white"}`;
  const eingangAnzahl = index.filter((e) => e.bereiche.includes("eingang")).length;
  const tabelleSichtbar = !!(alleAnsicht || eingangAnsicht || artGewaehlt || (bereich && ordner));

  return (
    <div>
      <div className="mb-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-2xl font-semibold text-white">Dokumente</h1>
          <span className="text-sm text-neutral-500">
            {index.length} Dateien · {formatBytes(gesamtGroesse)}
          </span>
        </div>
        <details className="mt-1 text-sm text-neutral-400">
          <summary className="cursor-pointer text-xs text-neutral-500 hover:text-white">So funktioniert die Ablage</summary>
          <ul className="mt-2 max-w-3xl list-disc space-y-1 pl-5">
            <li>Hochladen heißt nur Datei wählen: Die App liest PDFs lokal per Regeln; was sie nicht sicher erkennt, prüft die KI auf Knopfdruck.</li>
            <li>Im <strong>Eingang</strong> bestätigst du die vorgeschlagenen Bezüge. Ein Dokument mit mehreren Bezügen erscheint in jedem passenden Ordner.</li>
            <li>„Haus“ ist das ganze Bauwerk mit mehreren Hausnummern, „Gebäude“ eine einzelne Hausnummer.</li>
            <li>Kostenbelege lassen sich nicht löschen, nur ausblenden. Kontoauszug-Dateien stehen unter Geld → Kontoauszug importieren → Importe.</li>
          </ul>
        </details>
      </div>

      {editierbar && (
        <div className="mb-6">
          {/* key: bei Ordnerwechsel Formular mit neuer Vorbelegung aufbauen */}
          <DokumentUpload key={`${bereich?.key ?? ""}/${ordner?.key ?? ""}`} ordnerNamen={ordnerNamen} vorgabe={vorgabe} />
        </div>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {/* Auf den Übersichten gibt es keine Tabelle (und damit kein Suchfeld): Die Suche öffnet „Alle“ mit dem Begriff. */}
        {!tabelleSichtbar && (
          <form action="/dokumente" className="flex w-full gap-2 sm:w-auto">
            <input type="hidden" name="ansicht" value="alle" />
            <input
              type="search"
              name="q"
              placeholder="Dokument suchen…"
              aria-label="Dokument suchen"
              className="h-10 min-w-0 flex-1 rounded-md border border-neutral-700 bg-transparent px-3 text-sm text-white outline-none focus:border-neutral-400 sm:w-72 sm:flex-none"
            />
            <button type="submit" className="h-10 rounded-md border border-neutral-700 px-4 text-sm text-neutral-200 hover:border-neutral-500 hover:text-white">
              Suchen
            </button>
          </form>
        )}
        {!alleAnsicht && !typAnsicht && (gruppe || bereich) && (
          <span className="text-neutral-500">
            {gruppe ? (
              <span className="text-white">{gruppe.label}</span>
            ) : (
              bereich && (
                <>
                  <Link href={hauptordner?.href ?? `/dokumente?bereich=${bereich.key}`} className={ordner ? LINK : "text-white"}>
                    {hauptordner?.label ?? bereich.label}
                  </Link>
                  {ordner && <> › <span className="text-white">{ordner.label}</span></>}
                </>
              )
            )}
          </span>
        )}
        {artGewaehlt && (
          <span className="text-white">{artGewaehlt === "_ohne" ? "Ohne Typ" : (ART_OPTIONEN.find((a) => a.key === artGewaehlt)?.label ?? artGewaehlt)}</span>
        )}
        <div className="ml-auto inline-flex rounded-lg border border-neutral-800 p-0.5">
          <Link href="/dokumente" className={ansichtLink(!alleAnsicht && !typAnsicht)}>
            Ordner
          </Link>
          <Link href="/dokumente?ansicht=typ" className={ansichtLink(typAnsicht)}>
            Nach Typ
          </Link>
          <Link href="/dokumente?ansicht=alle" className={ansichtLink(alleAnsicht)}>
            Alle
          </Link>
        </div>
      </div>

      {eingangAnsicht && editierbar && sichtbar.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <SichereVorschlaegeKnopf />
          {kiOffen > 0 && <KiPruefungKnopf anzahl={kiOffen} />}
        </div>
      )}

      {tabelleSichtbar ? (
        <DokumentTabelle key={suche} rows={rows} zeigeBereich={alleAnsicht || !!artGewaehlt} ordnerNamen={ordnerNamen} editierbar={editierbar} suche={suche} />
      ) : gruppe ? (
        <div className="space-y-6">
          {/* Leere Abschnitte blenden wir aus (ist der ganze Hauptordner leer, steht er gar nicht erst auf der Startseite). */}
          {gruppenOrdner.filter(({ ordner: liste }) => liste.length > 0).map(({ bereich: b, ordner: liste }) => (
            <div key={b}>
              <h2 className={ABSCHNITT}>{ABSCHNITT_TITEL[b]}</h2>
              <div className={RASTER}>
                {liste.map((o) => (
                  <Ordnerzeile
                    key={o.key}
                    href={`/dokumente?bereich=${b}&ordner=${encodeURIComponent(o.key)}`}
                    titel={o.label}
                    anzahl={o.anzahl}
                    gedimmt={o.vertragStatus === "BEENDET"}
                    badge={o.vertragStatus === "BEENDET" ? "beendet" : undefined}
                  />
                ))}
              </div>
            </div>
          ))}
          {gruppe.arten.length > 0 && (
            <div>
              <h2 className={ABSCHNITT}>Nach Art</h2>
              <div className={RASTER}>
                {OBJEKT_ARTEN.map((art) => {
                  const dok = index.filter((e) => e.art === art && !e.bereiche.includes("eingang"));
                  if (dok.length === 0) return null;
                  return (
                    <Ordnerzeile key={art} href={`/dokumente?ansicht=typ&art=${art}`} titel={artLabel(art)} anzahl={dok.length} />
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : typAnsicht ? (
        <div className="space-y-5">
          {[...ART_GRUPPEN, "Ohne Typ"].map((gruppe) => {
            const karten =
              gruppe === "Ohne Typ"
                ? [{ key: "_ohne", label: "Ohne Typ", anzahl: index.filter((e) => !e.art).length }]
                : ART_OPTIONEN.filter((a) => a.gruppe === gruppe).map((a) => {
                    const dok = index.filter((e) => e.art === a.key);
                    return { key: a.key as string, label: a.label as string, anzahl: dok.length };
                  });
            const sichtbareKarten = karten.filter((k) => k.anzahl > 0);
            if (sichtbareKarten.length === 0) return null;
            return (
              <div key={gruppe}>
                <h2 className={ABSCHNITT}>{gruppe}</h2>
                <div className={RASTER}>
                  {sichtbareKarten.map((k) => (
                    <Ordnerzeile key={k.key} href={`/dokumente?ansicht=typ&art=${k.key}`} titel={k.label} anzahl={k.anzahl} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
            <div className={RASTER}>
              {sichtbareOrdner.map((o) => (
                <Ordnerzeile
                  key={o.key}
                  href={`/dokumente?bereich=${bereich.key}&ordner=${encodeURIComponent(o.key)}`}
                  {...zweizeilig(o.label)}
                  anzahl={o.anzahl}
                  gedimmt={o.vertragStatus === "BEENDET"}
                  badge={o.vertragStatus === "BEENDET" ? "beendet" : o.vertragStatus === "GEPLANT" ? "geplant" : undefined}
                />
              ))}
            </div>
          </>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {HAUPTORDNER.map((h) => {
            const dok = index.filter((e) => inHauptordner(e, h));
            // Leere Hauptordner blenden wir aus.
            if (dok.length === 0) return null;
            return (
<Hauptkachel key={h.key} href={h.href} schluessel={h.key} titel={h.label} anzahl={dok.length} hervorgehoben={h.key === "eingang" && eingangAnzahl > 0} />
            );
          })}
        </div>
      )}
    </div>
  );
}
