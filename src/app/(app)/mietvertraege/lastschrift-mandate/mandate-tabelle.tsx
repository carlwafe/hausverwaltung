"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { mandatsreferenz } from "@/lib/sepa-mandat";
import type { MandatZeile } from "@/lib/mandat-laden";

const leer = <span className="text-neutral-600">–</span>;
const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));
const wegText = (w: MandatZeile["zahlungsweg"]) => (w === "LASTSCHRIFT" ? "Lastschrift" : w === "UEBERWEISUNG" ? "Überweisung" : w === "BEHOERDE" ? "Amt zahlt" : null);

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
    key: "bestehend",
    label: "Bestehendes Mandat",
    title: "Am Mietvertrag erfasstes Mandat (Seite des Mietvertrags → Bearbeiten)",
    render: (z) =>
      z.mandatReferenz ? (
        <span className="text-xs">
          <span className="font-mono text-green-400">{z.mandatReferenz}</span>
          {z.mandatDatum && <span className="ml-2 text-neutral-500">vom {formatDate(z.mandatDatum)}</span>}
        </span>
      ) : (
        <span className="text-xs text-neutral-500">keines erfasst</span>
      ),
    sortValue: (z) => z.mandatReferenz ?? "",
    searchValue: (z) => z.mandatReferenz ?? "",
  },
  {
    key: "mandat",
    label: "Mandat",
    render: (z) => (
      <Link
        href={`/mietvertraege/${z.id}/lastschrift-mandat`}
        prefetch={false}
        title={z.mandatReferenz ? "Es besteht bereits ein Mandat — nur bei geänderter Kontoverbindung oder neuem Gläubiger neu erstellen" : undefined}
        className={`inline-block whitespace-nowrap rounded-md border px-2.5 py-1 text-xs font-medium hover:bg-neutral-800 ${
          z.mandatReferenz ? "border-neutral-800 text-neutral-500" : "border-neutral-600 text-white"
        }`}
      >
        {z.mandatReferenz ? "Neu erstellen" : "Erstellen"}
      </Link>
    ),
  },
  {
    key: "zahler",
    label: "Zahlt die Miete",
    title: "Aus dem Zahlernamen der Mietzahlungen der letzten 12 Monate (nur bei Verträgen ohne erfasstes Mandat)",
    render: (z) =>
      z.zahlerText ? (
        <span className={z.zahler === "AMT" ? "text-amber-300" : "text-neutral-300"}>{z.zahlerText}</span>
      ) : (
        leer
      ),
    sortValue: (z) => z.zahlerText ?? "",
  },
  {
    key: "zahlungsweg",
    label: "Zahlungsweg",
    render: (z) => (wegText(z.zahlungsweg) ? <span className="text-neutral-300">{wegText(z.zahlungsweg)}</span> : <span className="text-xs text-neutral-500">nicht erfasst</span>),
    sortValue: (z) => z.zahlungsweg ?? "",
  },
  {
    key: "referenz",
    label: "Referenz für neues Mandat",
    title: "Vorschlag für ein neues Mandat, je Einheit vergeben; nichts gespeichert",
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

type Ansicht = "alle" | "LASTSCHRIFT" | "UEBERWEISUNG" | "BEHOERDE" | "offen";
type MandatAnsicht = "ohne-selbst" | "ohne-amt" | "mit" | "alle";

export function MandateTabelle({ alle }: { alle: MandatZeile[] }) {
  const [ansicht, setAnsicht] = useState<Ansicht>("alle");
  // Standard: nur Verträge ohne erfasstes Mandat, deren Miete der Mieter selbst zahlt — nur für diese kommt ein neues
  // Mandat in Frage. Verträge, die Jobcenter/Kreis zahlen, stehen im eigenen Filter.
  const [mandatAnsicht, setMandatAnsicht] = useState<MandatAnsicht>("ohne-selbst");
  const [auswahl, setAuswahl] = useState<MandatZeile[]>([]);

  const rows = useMemo(
    () =>
      alle.filter((z) => {
        if (mandatAnsicht === "mit" && !z.mandatReferenz) return false;
        if (mandatAnsicht === "ohne-selbst" && (z.mandatReferenz || z.zahler === "AMT")) return false;
        if (mandatAnsicht === "ohne-amt" && (z.mandatReferenz || z.zahler !== "AMT")) return false;
        if (ansicht === "alle") return true;
        if (ansicht === "offen") return z.zahlungsweg === null;
        return z.zahlungsweg === ansicht;
      }),
    [alle, ansicht, mandatAnsicht],
  );
  const gewaehlt = auswahl.filter((z) => rows.some((r) => r.id === z.id));
  const ids = gewaehlt.map((z) => z.id);
  const mitMandat = gewaehlt.filter((z) => z.mandatReferenz).length;
  const filterAktiv = ansicht !== "alle" || mandatAnsicht !== "alle";

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400">
        <label className="flex items-center gap-2">
          Mandat
          <select value={mandatAnsicht} onChange={(e) => setMandatAnsicht(e.target.value as MandatAnsicht)} className={selectKlasse}>
            <option value="ohne-selbst">ohne Mandat – Mieter zahlt selbst</option>
            <option value="ohne-amt">ohne Mandat – Jobcenter / Kreis zahlt</option>
            <option value="mit">mit erfasstem Mandat</option>
            <option value="alle">alle</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          Zahlungsweg
          <select value={ansicht} onChange={(e) => setAnsicht(e.target.value as Ansicht)} className={selectKlasse}>
            <option value="alle">alle</option>
            <option value="LASTSCHRIFT">Lastschrift</option>
            <option value="UEBERWEISUNG">Überweisung</option>
            <option value="BEHOERDE">Amt zahlt</option>
            <option value="offen">nicht erfasst</option>
          </select>
        </label>
        {filterAktiv && (
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
        {mitMandat > 0 && (
          <span className="text-xs text-amber-400">
            {mitMandat} der ausgewählten Verträge {mitMandat === 1 ? "hat" : "haben"} bereits ein Mandat — ein neues ist meist nicht nötig.
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        selectable
        onSelectionChange={setAuswahl}
        emptyMessage="Keine Mietverträge in dieser Auswahl."
        defaultSort={{ key: "einheit" }}
      />
    </>
  );
}
