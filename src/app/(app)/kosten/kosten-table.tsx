"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { deleteKostenpositionen } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string | null) {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type KostenpositionRow = {
  id: string;
  jahr: number;
  // Nur bei aus einem Kontoauszug importierten Positionen bekannt (manuell erfasste kennen nur
  // das Jahr).
  datum: string | null;
  gebaeudeLabel: string;
  kostenartName: string;
  umlagefaehig: boolean;
  betrag: number;
  empfaenger: string | null;
  beschreibung: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

const columns: Column<KostenpositionRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum ?? "",
    render: (k) => (
      <Link href={`/kosten/${k.id}`} className="font-medium hover:underline">
        {formatDate(k.datum)}
      </Link>
    ),
  },
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (k) => k.gebaeudeLabel,
    searchValue: (k) => k.gebaeudeLabel,
    render: (k) => k.gebaeudeLabel,
  },
  {
    key: "kostenart",
    label: "Kostenart",
    sortValue: (k) => k.kostenartName,
    searchValue: (k) => k.kostenartName,
    render: (k) => k.kostenartName,
  },
  {
    key: "umlagefaehig",
    label: "Umlagefähig",
    sortValue: (k) => (k.umlagefaehig ? 1 : 0),
    render: (k) =>
      k.umlagefaehig ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Ja</span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Nein</span>
      ),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (k) => k.betrag,
    render: (k) => formatEuro(k.betrag),
  },
  {
    key: "empfaenger",
    label: "Empfänger",
    sortValue: (k) => k.empfaenger ?? "",
    searchValue: (k) => k.empfaenger ?? "",
    render: (k) => k.empfaenger || "–",
  },
  {
    key: "beschreibung",
    label: "Beschreibung",
    searchValue: (k) => k.beschreibung ?? "",
    render: (k) => k.beschreibung || "–",
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

export function KostenTable({ rows }: { rows: KostenpositionRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<KostenpositionRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (
      !confirm(
        `${ausgewaehlt.length} Kostenposition(en) wirklich unwiderruflich löschen?`,
      )
    ) {
      return;
    }
    startTransition(async () => {
      await deleteKostenpositionen(ausgewaehlt.map((r) => r.id));
      setAusgewaehlt([]);
    });
  }

  return (
    <div>
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
        emptyMessage="Noch keine Kostenpositionen erfasst."
        searchPlaceholder="Kosten durchsuchen…"
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
