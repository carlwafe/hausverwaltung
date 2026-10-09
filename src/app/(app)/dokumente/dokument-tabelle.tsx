"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { BelegDatumFeld } from "@/components/belege-sektion";
import { aendereArt, aendereOrdner, deleteDokument } from "./actions";
import {
  ART_OPTIONEN,
  BEREICHE,
  artLabel,
  formatBytes,
  formatDate,
  type BereichKey,
} from "@/lib/dokumente-anzeige";

export type DokumentRow = {
  id: string;
  dateiname: string;
  groesseBytes: number | null;
  belegDatum: string | null;
  createdAt: string;
  hochgeladenVon: string | null;
  bereich: BereichKey;
  ordnerLabel: string;
  bezugLabel: string;
  bezugHref: string | null;
  vertragStatus: "AKTIV" | "GEPLANT" | "BEENDET" | null;
  revalidatePath: string;
  /** Kontoauszug-Dateien aus den Importen: nur ansehen. */
  schreibgeschuetzt: boolean;
  downloadHref: string;
  art: string | null;
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
        className="w-40 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
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
      className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs text-white"
    >
      <option value="">–</option>
      {ART_OPTIONEN.map((a) => (
        <option key={a.key} value={a.key}>
          {a.label}
        </option>
      ))}
    </select>
  );
}

export function DokumentTabelle({
  rows,
  zeigeBereich,
  ordnerNamen,
  editierbar,
}: {
  rows: DokumentRow[];
  /** In der Gesamtansicht zusätzlich eine Bereichs-Spalte. */
  zeigeBereich: boolean;
  ordnerNamen: string[];
  /** Gäste dürfen nur ansehen. */
  editierbar: boolean;
}) {
  const spalten: Column<DokumentRow>[] = [
    {
      key: "datei",
      label: "Datei",
      render: (d) => (
        <a
          href={d.downloadHref}
          className="block max-w-[340px] text-white [overflow-wrap:anywhere] hover:underline"
          title={d.dateiname}
        >
          {d.dateiname}
        </a>
      ),
      sortValue: (d) => d.dateiname.toLowerCase(),
      searchValue: (d) => d.dateiname,
    },
    ...(zeigeBereich
      ? [
          {
            key: "bereich",
            label: "Bereich",
            render: (d: DokumentRow) => (
              <span className="text-neutral-300">
                {bereichLabel(d.bereich)}
              </span>
            ),
            sortValue: (d: DokumentRow) => bereichLabel(d.bereich),
            searchValue: (d: DokumentRow) => bereichLabel(d.bereich),
          } satisfies Column<DokumentRow>,
        ]
      : []),
    {
      key: "bezug",
      label: "Zugeordnet zu",
      render: (d) =>
        d.bezugHref ? (
          <Link
            href={d.bezugHref}
            className="block max-w-[260px] text-neutral-300 [overflow-wrap:anywhere] hover:text-white hover:underline"
            title={d.bezugLabel}
          >
            {d.bezugLabel}
            {d.vertragStatus === "BEENDET" && <span className="ml-1.5 text-xs text-neutral-500">(beendet)</span>}
          </Link>
        ) : editierbar ? (
          <OrdnerFeld
            id={d.id}
            wert={d.ordnerLabel === "Ohne Ordner" ? "" : d.ordnerLabel}
          />
        ) : (
          <span className="text-neutral-300">{d.ordnerLabel}</span>
        ),
      sortValue: (d) =>
        d.bezugLabel.toLowerCase() + d.ordnerLabel.toLowerCase(),
      searchValue: (d) => `${d.bezugLabel} ${d.ordnerLabel}${d.vertragStatus === "BEENDET" ? " beendet" : ""}`,
    },
    {
      key: "art",
      label: "Art",
      render: (d) =>
        editierbar && !d.schreibgeschuetzt ? (
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
        editierbar && !d.schreibgeschuetzt ? (
          <BelegDatumFeld
            id={d.id}
            wert={d.belegDatum ? new Date(d.belegDatum) : null}
            revalidatePath={d.revalidatePath}
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
      key: "upload",
      label: "Upload",
      render: (d) => (
        <span
          className="whitespace-nowrap text-xs text-neutral-500"
          title={d.hochgeladenVon ?? undefined}
        >
          {formatDate(new Date(d.createdAt))}
        </span>
      ),
      sortValue: (d) => d.createdAt,
      searchValue: (d) => d.hochgeladenVon ?? "",
    },
    {
      key: "groesse",
      label: "Größe",
      align: "right",
      render: (d) => (
        <span className="whitespace-nowrap text-xs text-neutral-500">
          {formatBytes(d.groesseBytes)}
        </span>
      ),
      sortValue: (d) => d.groesseBytes ?? 0,
    },
    ...(editierbar
      ? [
          {
            key: "aktionen",
            label: "",
            align: "right",
            render: (d: DokumentRow) =>
              d.schreibgeschuetzt ? null : (
                <DeleteButton
                  size="sm"
                  action={deleteDokument.bind(null, d.id, d.revalidatePath)}
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
        emptyMessage="Keine Dokumente."
        searchPlaceholder="Dateiname, Ordner oder Bezug suchen…"
        defaultSort={{ key: "belegdatum", dir: "desc" }}
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
