"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { BelegDatumFeld } from "@/components/belege-sektion";
import { aendereArt, aendereOrdner, blendeDokumentAus, deleteDokument } from "./actions";
import { HerunterladenLink, dokumentAnsehenUrl, dokumentHerunterladenUrl } from "@/components/dokument-links";
import { KARTE_AKTION, KarteAktionen, KarteKopf, KarteMeta, KarteZeile } from "@/components/karte";
import {
  ART_GRUPPEN,
  ART_OPTIONEN,
  BEREICHE,
  artLabel,
  formatBytes,
  formatDate,
  formatEuro,
  type BereichKey,
} from "@/lib/dokumente-anzeige";

export type DokumentRow = {
  id: string;
  dateiname: string;
  titel: string | null;
  groesseBytes: number | null;
  belegDatum: string | null;
  createdAt: string;
  hochgeladenVon: string | null;
  /** Bereich, unter dem das Dokument in dieser Ansicht steht (bei mehreren Bezügen der erste). */
  bereich: BereichKey;
  ordnerLabel: string;
  /** Alle Bezüge (Spalte „Zugeordnet zu“). */
  bezuege: { typ: string; label: string; href: string; beendet: boolean }[];
  /** Kostenbelege lassen sich nicht löschen, nur ausblenden. */
  hatBuchung: boolean;
  art: string | null;
  aussteller: string | null;
  rechnungsnummer: string | null;
  betrag: number | null;
  detailHref: string;
};

const bereichLabel = (k: BereichKey) =>
  BEREICHE.find((b) => b.key === k)?.label ?? k;

// Ordner eines allgemeinen Dokuments direkt in der Zeile änderbar (leer = „Ohne Ordner“).
function OrdnerFeld({ id, wert }: { id: string; wert: string }) {
  const [aktuell, setAktuell] = useState(wert);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <input
        value={aktuell}
        list="dokument-ordner-zeile"
        disabled={pending}
        maxLength={80}
        placeholder="Ohne Ordner"
        onChange={(e) => setAktuell(e.target.value)}
        onBlur={() => {
          if (aktuell.trim() === wert) return;
          startTransition(() => aendereOrdner(id, aktuell));
        }}
        className="w-36 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
      />
    </>
  );
}

// Dokumentart direkt in der Zeile änderbar.
function ArtFeld({ id, wert }: { id: string; wert: string | null }) {
  const [aktuell, setAktuell] = useState(wert ?? "");
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={aktuell}
      disabled={pending}
      onChange={(e) => {
        setAktuell(e.target.value);
        startTransition(() => aendereArt(id, e.target.value));
      }}
      title={wert ? artLabel(wert) : undefined}
      className="w-24 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
    >
      <option value="">–</option>
      {ART_GRUPPEN.map((g) => (
        <optgroup key={g} label={g}>
          {ART_OPTIONEN.filter((a) => a.gruppe === g).map((a) => (
            <option key={a.key} value={a.key}>
              {a.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// Karte fürs Handy (siehe `mobileCard` an DataTable): Tippen öffnet die Detailseite, der Knopf die Datei.
// Art, Belegdatum und Ordner sind hier nur lesbar (ändern in der Tabelle oder auf der Detailseite).
function DokumentKarte({ d }: { d: DokumentRow }) {
  return (
    <>
      <KarteKopf
        titel={
          <Link prefetch={false} href={d.detailHref}>
            {d.titel ?? d.dateiname}
          </Link>
        }
        wert={d.betrag === null ? undefined : formatEuro(d.betrag)}
      />
      <KarteZeile>
        {d.bezuege.length > 0 ? (
          d.bezuege.map((b) => `${b.label}${b.beendet ? " (beendet)" : ""}`).join(" · ")
        ) : d.bereich === "eingang" ? (
          <span className="text-amber-400">Noch nicht abgelegt – prüfen</span>
        ) : (
          d.ordnerLabel
        )}
      </KarteZeile>
      <KarteMeta>
        <span>
          {[
            d.belegDatum ? formatDate(new Date(d.belegDatum)) : `Upload ${formatDate(new Date(d.createdAt))}`,
            d.art ? artLabel(d.art) : null,
            d.aussteller,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </KarteMeta>
      <KarteAktionen>
        <a href={dokumentAnsehenUrl(d.id)} target="_blank" rel="noreferrer" className={KARTE_AKTION}>
          Datei ansehen
        </a>
        <a href={dokumentHerunterladenUrl(d.id)} className={KARTE_AKTION}>
          Herunterladen
        </a>
      </KarteAktionen>
    </>
  );
}

export function DokumentTabelle({
  rows,
  zeigeBereich,
  ordnerNamen,
  editierbar,
  suche,
}: {
  rows: DokumentRow[];
  /** In der Gesamtansicht zusätzlich eine Bereichs-Spalte. */
  zeigeBereich: boolean;
  ordnerNamen: string[];
  /** Gäste dürfen nur ansehen. */
  editierbar: boolean;
  /** Suchbegriff aus dem Suchfeld der Übersicht (`?q=`). */
  suche?: string;
}) {
  const spalten: Column<DokumentRow>[] = [
    {
      key: "datei",
      label: "Datei",
      // Füllspalte: nimmt die übrige Breite und macht die Tabelle nie breiter (docs/tickets-logo-design.md).
      fuellend: true,
      render: (d) => (
        <>
          <div className="flex min-w-0 items-center gap-1">
            <a
              href={dokumentAnsehenUrl(d.id)}
              target="_blank"
              rel="noreferrer"
              className="min-w-0 truncate text-white hover:underline"
              title={`${d.titel ? `${d.titel}\n${d.dateiname}` : d.dateiname}\n(im neuen Tab ansehen)`}
            >
              {d.titel ?? d.dateiname}
            </a>
            <HerunterladenLink id={d.id} className="-my-1" />
          </div>
          {/* Zweite Zeile: Dateiname (wenn ein Titel davor steht) und Aussteller — eigene Spalten passten nicht in die Breite. */}
          {(d.titel || d.aussteller) && (
            <span
              className="block truncate text-xs text-neutral-500"
              title={d.rechnungsnummer ? `Rechnungsnr. ${d.rechnungsnummer}` : undefined}
            >
              {[d.titel ? d.dateiname : null, d.aussteller].filter(Boolean).join(" · ")}
            </span>
          )}
        </>
      ),
      sortValue: (d) => (d.titel ?? d.dateiname).toLowerCase(),
      searchValue: (d) => `${d.titel ?? ""} ${d.dateiname} ${d.aussteller ?? ""} ${d.rechnungsnummer ?? ""}`,
    },
    {
      key: "bezug",
      label: "Zugeordnet zu",
      title: zeigeBereich ? "Darunter klein: Bereich der Ablage" : undefined,
      render: (d) => (
        <div className="w-36">
          {d.bezuege.length > 0 ? (
            <div className="flex flex-col gap-0.5">
              {d.bezuege.map((b) => (
                <Link
                  key={`${b.typ}-${b.href}`}
                  href={b.href}
                  prefetch={false}
                  className="text-neutral-300 [overflow-wrap:anywhere] hover:text-white hover:underline"
                  title={b.label}
                >
                  {b.label}
                  {b.beendet && <span className="ml-1.5 text-xs text-neutral-500">(beendet)</span>}
                </Link>
              ))}
            </div>
          ) : d.bereich === "eingang" ? (
            <Link href={d.detailHref} prefetch={false} className="text-xs text-amber-400 hover:underline">
              Noch nicht abgelegt – prüfen
            </Link>
          ) : editierbar ? (
            <OrdnerFeld id={d.id} wert={d.ordnerLabel === "Ohne Ordner" ? "" : d.ordnerLabel} />
          ) : (
            <span className="text-neutral-300">{d.ordnerLabel}</span>
          )}
          {/* In der Gesamtansicht der Bereich klein darunter (statt eigener Spalte). */}
          {zeigeBereich && <span className="mt-0.5 block text-xs text-neutral-500">{bereichLabel(d.bereich)}</span>}
        </div>
      ),
      sortValue: (d) => (d.bezuege.map((b) => b.label).join(" ") || d.ordnerLabel).toLowerCase(),
      searchValue: (d) =>
        `${d.bezuege.map((b) => b.label).join(" ")} ${d.ordnerLabel} ${bereichLabel(d.bereich)}${d.bezuege.some((b) => b.beendet) ? " beendet" : ""}`,
    },
    {
      key: "art",
      label: "Art",
      render: (d) =>
        editierbar ? (
          <ArtFeld id={d.id} wert={d.art} />
        ) : (
          <span className="text-xs text-neutral-300">{artLabel(d.art)}</span>
        ),
      sortValue: (d) => artLabel(d.art),
      searchValue: (d) => artLabel(d.art),
    },
    {
      key: "belegdatum",
      label: "Belegdatum",
      render: (d) =>
        editierbar ? (
          <BelegDatumFeld
            id={d.id}
            wert={d.belegDatum ? new Date(d.belegDatum) : null}
            revalidatePath="/dokumente"
          />
        ) : (
          <span className="text-xs text-neutral-300">
            {d.belegDatum ? formatDate(new Date(d.belegDatum)) : "–"}
          </span>
        ),
      // Ohne Belegdatum nach Upload-Datum, wie in den Beleg-Tabellen der Detailseiten.
      sortValue: (d) => d.belegDatum ?? d.createdAt,
    },
    {
      key: "betrag",
      label: "Betrag",
      align: "right",
      render: (d) => (
        <span className="whitespace-nowrap text-xs text-neutral-300">{d.betrag === null ? "–" : formatEuro(d.betrag)}</span>
      ),
      sortValue: (d) => d.betrag ?? 0,
    },
    {
      key: "upload",
      label: "Upload",
      render: (d) => (
        <div className="whitespace-nowrap text-xs" title={d.hochgeladenVon ?? undefined}>
          <span className="block text-neutral-300">{formatDate(new Date(d.createdAt))}</span>
          <span className="block text-neutral-500">{formatBytes(d.groesseBytes)}</span>
        </div>
      ),
      sortValue: (d) => d.createdAt,
      searchValue: (d) => d.hochgeladenVon ?? "",
    },
    ...(editierbar
      ? [
          {
            key: "aktionen",
            label: "",
            align: "right",
            render: (d: DokumentRow) =>
              d.hatBuchung ? (
                // Löschsperre: Kostenbelege werden nur ausgeblendet (wiederherstellen an der Kostenposition).
                <DeleteButton
                  size="sm"
                  label="Ausblenden"
                  action={blendeDokumentAus.bind(null, d.id, "/dokumente")}
                  confirmText={`„${d.dateiname}“ ausblenden? Der Beleg wird nicht gelöscht und lässt sich an der Kostenposition wiederherstellen.`}
                />
              ) : (
                <DeleteButton
                  size="sm"
                  action={deleteDokument.bind(null, d.id, "/dokumente")}
                  confirmText={`„${d.dateiname}“ wirklich löschen?`}
                />
              ),
          } satisfies Column<DokumentRow>,
        ]
      : []),
  ];

  return (
    <>
      <DataTable
        columns={spalten}
        rows={rows}
        initialQuery={suche}
        emptyMessage="Keine Dokumente."
        searchPlaceholder="Dateiname, Ordner oder Bezug suchen…"
        defaultSort={{ key: "belegdatum", dir: "desc" }}
        kompakt
        rowHref={(d) => d.detailHref}
        mobileCard={(d) => <DokumentKarte d={d} />}
        mobileCardInteraktiv
        mobileSort={{
          standardLabel: "neuestes Belegdatum",
          optionen: [
            { label: "ältestes Belegdatum", key: "belegdatum", dir: "asc" },
            { label: "zuletzt hochgeladen", key: "upload", dir: "desc" },
            { label: "Name A–Z", key: "datei", dir: "asc" },
          ],
        }}
        selectFilter={{
          label: "Art",
          value: (d) => d.art ?? "_ohne",
          placeholder: "Alle Arten",
          options: [
            ...ART_OPTIONEN.map((a) => ({ value: a.key as string, label: a.label })),
            { value: "_ohne", label: "Ohne Art" },
          ],
        }}
      />
      {/* Einmal für alle Zeilen (eine datalist je Zeile würde doppelte IDs erzeugen). */}
      <datalist id="dokument-ordner-zeile">
        {ordnerNamen.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
    </>
  );
}
