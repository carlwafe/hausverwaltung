"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { BelegDatumFeld } from "@/components/belege-sektion";
import { aendereArt, aendereOrdner, blendeDokumentAus, deleteDokument } from "./actions";
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
        <div className="max-w-[340px]">
          <a
            href={`/api/dokumente/${d.id}/download`}
            className="block text-white [overflow-wrap:anywhere] hover:underline"
            title={d.dateiname}
          >
            {d.titel ?? d.dateiname}
          </a>
          {d.titel && <span className="block text-xs text-neutral-500 [overflow-wrap:anywhere]">{d.dateiname}</span>}
        </div>
      ),
      sortValue: (d) => (d.titel ?? d.dateiname).toLowerCase(),
      searchValue: (d) => `${d.titel ?? ""} ${d.dateiname}`,
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
        d.bezuege.length > 0 ? (
          <div className="flex max-w-[280px] flex-col gap-0.5">
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
        ),
      sortValue: (d) => (d.bezuege.map((b) => b.label).join(" ") || d.ordnerLabel).toLowerCase(),
      searchValue: (d) =>
        `${d.bezuege.map((b) => b.label).join(" ")} ${d.ordnerLabel}${d.bezuege.some((b) => b.beendet) ? " beendet" : ""}`,
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
      key: "aussteller",
      label: "Aussteller",
      render: (d) => (
        <span className="block max-w-[180px] text-xs text-neutral-300 [overflow-wrap:anywhere]" title={d.rechnungsnummer ? `Rechnungsnr. ${d.rechnungsnummer}` : undefined}>
          {d.aussteller ?? "–"}
        </span>
      ),
      sortValue: (d) => (d.aussteller ?? "").toLowerCase(),
      searchValue: (d) => `${d.aussteller ?? ""} ${d.rechnungsnummer ?? ""}`,
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
    {
      key: "details",
      label: "",
      align: "right",
      render: (d) => (
        <Link href={d.detailHref} prefetch={false} className="whitespace-nowrap text-xs text-neutral-400 hover:text-white hover:underline">
          Details
        </Link>
      ),
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
