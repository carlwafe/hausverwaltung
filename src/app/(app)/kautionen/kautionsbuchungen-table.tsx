"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { aktualisiereKautionsbuchungKategorie, deleteKautionsbuchungen } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type KautionBuchungKategorie =
  | "EINZAHLUNG_MIETER"
  | "ANLAGE"
  | "AUFLOESUNG"
  | "AUSZAHLUNG_MIETER"
  | "NICHT_ZUGEORDNET";

const KATEGORIE_LABEL: Record<KautionBuchungKategorie, string> = {
  EINZAHLUNG_MIETER: "Einzahlung Mieter",
  ANLAGE: "Anlage (aufs Kautionskonto)",
  AUFLOESUNG: "Auflösung (vom Kautionskonto)",
  AUSZAHLUNG_MIETER: "Auszahlung Mieter",
  NICHT_ZUGEORDNET: "Nicht zugeordnet",
};

export type KautionsbuchungRow = {
  id: string;
  mietvertragId: string | null;
  einheitBezeichnung: string | null;
  mieterNamen: string | null;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
  kategorie: KautionBuchungKategorie;
};

function KategorieZelle({ k }: { k: KautionsbuchungRow }) {
  const [pending, startTransition] = useTransition();
  return (
    <select
      value={k.kategorie}
      disabled={pending}
      onChange={(e) =>
        startTransition(() =>
          aktualisiereKautionsbuchungKategorie(k.id, e.target.value as KautionBuchungKategorie),
        )
      }
      className={`rounded-md border px-1.5 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-50 ${
        k.kategorie === "NICHT_ZUGEORDNET"
          ? "border-amber-800 bg-amber-500/10 text-amber-300"
          : "border-neutral-700 bg-transparent text-white"
      }`}
    >
      {(Object.keys(KATEGORIE_LABEL) as KautionBuchungKategorie[]).map((kat) => (
        <option key={kat} value={kat} className="bg-neutral-900 text-white">
          {KATEGORIE_LABEL[kat]}
        </option>
      ))}
    </select>
  );
}

const columns: Column<KautionsbuchungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum,
    render: (k) => formatDate(k.datum),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (k) => k.betrag,
    render: (k) => formatEuro(k.betrag),
  },
  {
    key: "mietvertrag",
    label: "Mietvertrag",
    sortValue: (k) => k.mieterNamen ?? "",
    searchValue: (k) => k.mieterNamen ?? "",
    render: (k) =>
      k.mietvertragId ? (
        <Link href={`/mietvertraege/${k.mietvertragId}`} className="hover:underline">
          {k.einheitBezeichnung} — {k.mieterNamen}
        </Link>
      ) : (
        <span className="text-neutral-500">nicht zugeordnet</span>
      ),
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (k) => k.verwendungszweck ?? "",
    searchValue: (k) => k.verwendungszweck ?? "",
    render: (k) => k.verwendungszweck || "–",
  },
  {
    key: "kategorie",
    label: "Kategorie",
    sortValue: (k) => KATEGORIE_LABEL[k.kategorie],
    searchValue: (k) => KATEGORIE_LABEL[k.kategorie],
    render: (k) => <KategorieZelle k={k} />,
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (k, { expanded, toggleExpanded }) =>
      k.rohdaten ? (
        <RohdatenToggleButton expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span className="text-xs text-neutral-600">manuell</span>
      ),
  },
];

export function KautionsbuchungenTable({ rows }: { rows: KautionsbuchungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<KautionsbuchungRow[]>([]);
  const [pending, startTransition] = useTransition();
  const nichtZugeordnet = rows.filter((r) => r.kategorie === "NICHT_ZUGEORDNET").length;

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Buchung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      await deleteKautionsbuchungen(ausgewaehlt.map((r) => r.id));
      setAusgewaehlt([]);
    });
  }

  return (
    <div>
      {nichtZugeordnet > 0 && (
        <p className="mb-3 text-sm text-amber-400">
          {nichtZugeordnet} Buchung{nichtZugeordnet === 1 ? "" : "en"} noch ohne Kategorie — bitte in der
          Tabelle nachtragen.
        </p>
      )}
      {ausgewaehlt.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
          <span className="text-sm text-neutral-300">{ausgewaehlt.length} ausgewählt</span>
          <button
            type="button"
            onClick={loeschen}
            disabled={pending}
            className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
          >
            {pending ? "Lösche…" : "Ausgewählte löschen"}
          </button>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Noch keine Kautionsbuchungen aus Kontoauszug importiert."
        searchPlaceholder="Kautionsbuchungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        renderExpanded={(k, colSpan) =>
          k.rohdaten ? (
            <RohdatenZeile
              rohdaten={k.rohdaten}
              colSpan={colSpan}
              downloadHref={k.importBatchId ? `/api/import-batches/${k.importBatchId}/download` : undefined}
              downloadLabel={`Originaldatei herunterladen${k.importDateiname ? ` (${k.importDateiname})` : ""}`}
            />
          ) : null
        }
      />
    </div>
  );
}
