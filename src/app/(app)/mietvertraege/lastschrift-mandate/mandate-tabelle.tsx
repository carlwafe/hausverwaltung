"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { mandatsreferenz } from "@/lib/sepa-mandat";
import type { MandatZeile } from "@/lib/mandat-laden";

const leer = <span className="text-neutral-600">–</span>;
const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));
const wegText = (w: MandatZeile["zahlungsweg"]) => (w === "LASTSCHRIFT" ? "Lastschrift" : w === "UEBERWEISUNG" ? "Überweisung" : null);

const columns: Column<MandatZeile>[] = [
  {
    key: "einheit",
    label: "Einheit",
    render: (z) => (
      <Link prefetch={false} href={`/mietvertraege/${z.id}`} className="font-medium text-white hover:underline">
        {z.einheit}
      </Link>
    ),
    sortValue: (z) => z.einheitRang,
    searchValue: (z) => z.einheit,
  },
  {
    key: "mieter",
    label: "Mieter",
    render: (z) => <span className="text-neutral-300">{z.mieterNamen || "– ohne Mieter –"}</span>,
    sortValue: (z) => z.mieterNamen,
    searchValue: (z) => z.mieterNamen,
  },
  {
    key: "mandat",
    label: "Mandat",
    render: (z) => (
      <Link
        href={`/mietvertraege/${z.id}/lastschrift-mandat`}
        prefetch={false}
        className="inline-block whitespace-nowrap rounded-md border border-neutral-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
      >
        Erstellen
      </Link>
    ),
  },
  {
    key: "zahlungsweg",
    label: "Zahlungsweg",
    render: (z) => (wegText(z.zahlungsweg) ? <span className="text-neutral-300">{wegText(z.zahlungsweg)}</span> : <span className="text-xs text-neutral-500">nicht erfasst</span>),
    sortValue: (z) => z.zahlungsweg ?? "",
  },
  {
    key: "referenz",
    label: "Mandatsreferenz",
    title: "Vorschlag, je Einheit vergeben; nichts gespeichert",
    render: (z) => <span className="font-mono text-xs text-neutral-400">{mandatsreferenz(z.einheit)}</span>,
  },
  {
    key: "beginn",
    label: "Mietbeginn",
    render: (z) => (
      <span className="text-neutral-300">
        {z.beginn ? formatDate(z.beginn) : leer}
        {z.geplant && <span className="ml-1 text-xs text-amber-400">geplant</span>}
      </span>
    ),
    sortValue: (z) => z.beginn ?? "",
  },
];

const selectKlasse =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-neutral-400";

type Ansicht = "alle" | "LASTSCHRIFT" | "UEBERWEISUNG" | "offen";

export function MandateTabelle({ alle }: { alle: MandatZeile[] }) {
  const [ansicht, setAnsicht] = useState<Ansicht>("alle");
  const [auswahl, setAuswahl] = useState<MandatZeile[]>([]);

  const rows = useMemo(
    () =>
      alle.filter((z) => {
        if (ansicht === "alle") return true;
        if (ansicht === "offen") return z.zahlungsweg === null;
        return z.zahlungsweg === ansicht;
      }),
    [alle, ansicht],
  );
  const ids = auswahl.filter((z) => rows.some((r) => r.id === z.id)).map((z) => z.id);

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400">
        <label className="flex items-center gap-2">
          Zahlungsweg
          <select value={ansicht} onChange={(e) => setAnsicht(e.target.value as Ansicht)} className={selectKlasse}>
            <option value="alle">alle</option>
            <option value="LASTSCHRIFT">Lastschrift</option>
            <option value="UEBERWEISUNG">Überweisung</option>
            <option value="offen">nicht erfasst</option>
          </select>
        </label>
        {ansicht !== "alle" && (
          <span className="text-xs text-neutral-500">
            {rows.length} von {alle.length} Verträgen
          </span>
        )}
        {ids.length > 0 ? (
          <Link
            prefetch={false}
            href={`/mietvertraege/lastschrift-mandate/drucken?ids=${ids.join(",")}`}
            className="rounded-md bg-white px-3 py-1.5 text-sm font-medium text-black hover:bg-neutral-200"
          >
            {ids.length} ausgewählte Mandate drucken
          </Link>
        ) : (
          <span className="text-xs text-neutral-500">Zeilen ankreuzen, um mehrere Mandate in einem Druckvorgang zu erstellen.</span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        selectable
        onSelectionChange={setAuswahl}
        emptyMessage="Keine Mietverträge."
        defaultSort={{ key: "einheit" }}
      />
    </>
  );
}
