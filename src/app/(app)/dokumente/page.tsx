import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { BEREICHE, formatBytes, type BereichKey } from "@/lib/dokumente-anzeige";
import {
  allgemeineOrdnerNamen,
  ladeBezugOptionen,
  ladeDokumente,
  ordnerVonBereich,
} from "@/lib/dokumente-uebersicht";
import { DokumentUpload } from "./dokument-upload";
import { DokumentTabelle, type DokumentRow } from "./dokument-tabelle";

const LINK = "text-neutral-400 hover:text-white hover:underline";

function Ordnerkarte({ href, titel, anzahl, groesse, hinweis }: { href: string; titel: string; anzahl: number; groesse: number; hinweis?: string }) {
  return (
    <Link href={href} className="rounded-lg border border-neutral-800 p-4 hover:border-neutral-600 hover:bg-neutral-900">
      <div className="flex items-start gap-3">
        <span aria-hidden className="text-xl leading-none">📁</span>
        <div className="min-w-0">
          <div className="truncate font-medium text-white" title={titel}>{titel}</div>
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

export default async function DokumentePage({
  searchParams,
}: {
  searchParams: Promise<{ bereich?: string; ordner?: string; ansicht?: string }>;
}) {
  const { bereich: bereichParam, ordner: ordnerParam, ansicht } = await searchParams;
  const [user, zeilen] = await Promise.all([getCurrentUser(), ladeDokumente()]);
  const editierbar = user?.role !== "GAST";
  const optionen = editierbar ? await ladeBezugOptionen() : null;

  const bereich = BEREICHE.find((b) => b.key === bereichParam) ?? null;
  const alleAnsicht = ansicht === "alle";
  const ordnerListe = bereich ? ordnerVonBereich(zeilen, bereich.key) : [];
  const ordner = bereich && ordnerParam !== undefined ? ordnerListe.find((o) => o.key === ordnerParam) ?? null : null;

  const sichtbar = alleAnsicht
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
  }));

  // Upload vorbelegen mit dem gerade geöffneten Ordner.
  const vorBereich: BereichKey | null = bereich?.key ?? null;
  const vorgabe = {
    bereich: vorBereich && vorBereich !== "kosten" ? vorBereich : ("allgemein" as const),
    bezugId: bereich && ordner && bereich.key !== "kosten" && bereich.key !== "allgemein" ? ordner.key : "",
    ordner: bereich?.key === "allgemein" && ordner && ordner.label !== "Ohne Ordner" ? ordner.label : "",
  };

  const gesamtGroesse = zeilen.reduce((s, z) => s + (z.groesseBytes ?? 0), 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Dokumente</h1>
        <p className="text-sm text-neutral-400">
          Alle hochgeladenen Dateien an einem Ort — {zeilen.length} Dateien, {formatBytes(gesamtGroesse)}. Die Ordner
          ergeben sich aus dem Bezug (Mietvertrag, Einheit, Kostenjahr, Dienstleister, Ticket); Allgemeines legst du in
          frei benannten Ordnern ab. Der Bezug ist fest: ein Dokument lässt sich nicht in einen anderen Mietvertrag o.ä.
          verschieben, dafür neu hochladen und das alte löschen (nur der Ordner von „Allgemein“ ist änderbar).
        </p>
      </div>

      {editierbar && optionen && (
        <div className="mb-6">
          {/* key: bei Ordnerwechsel Formular mit neuer Vorbelegung aufbauen */}
          <DokumentUpload
            key={`${bereich?.key ?? ""}/${ordner?.key ?? ""}`}
            optionen={optionen}
            ordnerNamen={allgemeineOrdnerNamen(zeilen)}
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

      {alleAnsicht || (bereich && ordner) ? (
        <DokumentTabelle
          rows={rows}
          zeigeBereich={alleAnsicht}
          ordnerNamen={allgemeineOrdnerNamen(zeilen)}
          editierbar={editierbar}
        />
      ) : bereich ? (
        ordnerListe.length === 0 ? (
          <p className="text-sm text-neutral-500">In „{bereich.label}“ liegen noch keine Dokumente.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ordnerListe.map((o) => (
              <Ordnerkarte
                key={o.key}
                href={`/dokumente?bereich=${bereich.key}&ordner=${encodeURIComponent(o.key)}`}
                titel={o.label}
                anzahl={o.anzahl}
                groesse={o.groesse}
              />
            ))}
          </div>
        )
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BEREICHE.map((b) => {
            const vonBereich = zeilen.filter((z) => z.bereich === b.key);
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
