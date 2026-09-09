"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { deleteKostenpositionen } from "./actions";
import {
  exportiereAlsCsv,
  formatDatumFuerCsv,
  formatEuroFuerCsv,
  heutigesDatumFuerDateiname,
  type CsvSpalte,
} from "@/lib/export-csv";

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
  // Gesetzt, wenn diese Zeile eine von mehreren zusammengehörigen Positionen aus dem Aufteilen
  // einer ursprünglich einzelnen Buchung ist (siehe aufteilen-form.tsx) — dann werden alle
  // Zeilen mit demselben Wert zu einer Zeile zusammengefasst dargestellt.
  aufteilungGruppeId: string | null;
};

type KostenpositionAnzeigeRow = KostenpositionRow & {
  aufteilung?: KostenpositionRow[];
};

/** Fasst Zeilen mit derselben aufteilungGruppeId zu einer Anzeige-Zeile zusammen. */
function gruppiereAufteilungen(rows: KostenpositionRow[]): KostenpositionAnzeigeRow[] {
  const gruppen = new Map<string, KostenpositionRow[]>();
  const ergebnis: KostenpositionAnzeigeRow[] = [];

  for (const r of rows) {
    if (!r.aufteilungGruppeId) {
      ergebnis.push(r);
      continue;
    }
    const bestehende = gruppen.get(r.aufteilungGruppeId);
    if (bestehende) {
      bestehende.push(r);
    } else {
      const liste = [r];
      gruppen.set(r.aufteilungGruppeId, liste);
      ergebnis.push(r); // Platzhalter, wird unten durch die zusammengefasste Version ersetzt
    }
  }

  return ergebnis.map((r) => {
    if (!r.aufteilungGruppeId) return r;
    const teile = gruppen.get(r.aufteilungGruppeId)!;
    if (teile[0].id !== r.id) return r; // nur die erste Zeile jeder Gruppe wird dargestellt
    const betrag = teile.reduce((s, t) => s + t.betrag, 0);
    const umlagefaehig = teile.every((t) => t.umlagefaehig);
    return {
      ...r,
      kostenartName: `${teile.length} Kostenarten (aufgeteilt)`,
      umlagefaehig,
      betrag,
      aufteilung: teile,
    };
  });
}

function AufteilungZeile({ teile, colSpan }: { teile: KostenpositionRow[]; colSpan: number }) {
  return (
    <tr className="border-b border-neutral-800 bg-neutral-950/60">
      <td colSpan={colSpan} className="px-4 py-3">
        <p className="mb-2 text-xs font-medium text-neutral-400">Aufgeteilt in:</p>
        <table className="w-full text-xs">
          <tbody>
            {teile.map((t) => (
              <tr key={t.id} className="border-t border-neutral-800/60 first:border-t-0">
                <td className="py-1 pr-3">
                  <Link href={`/kosten/${t.id}`} className="text-neutral-300 hover:underline">
                    {t.kostenartName}
                  </Link>
                  {!t.umlagefaehig && <span className="ml-2 text-neutral-600">(nicht umlagefähig)</span>}
                </td>
                <td className="py-1 pr-3 text-neutral-300">{t.beschreibung || "–"}</td>
                <td className="py-1 text-right text-neutral-300">{formatEuro(t.betrag)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </td>
    </tr>
  );
}

const columns: Column<KostenpositionAnzeigeRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum ?? "",
    render: (k) =>
      k.aufteilung ? (
        formatDate(k.datum)
      ) : (
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
    render: (k, { expanded, toggleExpanded }) => {
      if (k.aufteilung) {
        return (
          <button
            type="button"
            onClick={toggleExpanded}
            className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-400 hover:bg-blue-500/20"
          >
            Aufgeteilt ({k.aufteilung.length}) {expanded ? "▲" : "▼"}
          </button>
        );
      }
      return k.rohdaten ? (
        <RohdatenToggleButton expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span className="text-xs text-neutral-600">manuell</span>
      );
    },
  },
];

const csvSpalten: CsvSpalte<KostenpositionRow>[] = [
  { label: "Datum", wert: (k) => formatDatumFuerCsv(k.datum) },
  { label: "Gebäude", wert: (k) => k.gebaeudeLabel },
  { label: "Kostenart", wert: (k) => k.kostenartName },
  { label: "Umlagefähig", wert: (k) => (k.umlagefaehig ? "Ja" : "Nein") },
  { label: "Betrag", wert: (k) => formatEuroFuerCsv(k.betrag) },
  { label: "Empfänger", wert: (k) => k.empfaenger ?? "" },
  { label: "Beschreibung", wert: (k) => k.beschreibung ?? "" },
];

export function KostenTable({ rows }: { rows: KostenpositionRow[] }) {
  const anzeigeRows = gruppiereAufteilungen(rows);
  const [ausgewaehlt, setAusgewaehlt] = useState<KostenpositionAnzeigeRow[]>([]);
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
    // Eine aufgeteilte Zeile steht für mehrere echte Kostenpositionen — alle davon löschen,
    // nicht nur die als Zeile angezeigte erste.
    const ids = ausgewaehlt.flatMap((r) => (r.aufteilung ? r.aufteilung.map((t) => t.id) : [r.id]));
    startTransition(async () => {
      await deleteKostenpositionen(ids);
      setAusgewaehlt([]);
    });
  }

  function exportieren() {
    exportiereAlsCsv(`kosten-${heutigesDatumFuerDateiname()}.csv`, csvSpalten, ausgewaehlt);
  }

  return (
    <div>
      {ausgewaehlt.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
          <span className="text-sm text-neutral-300">{ausgewaehlt.length} ausgewählt</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={exportieren}
              className="rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-neutral-200 hover:bg-neutral-800"
            >
              Ausgewählte als CSV exportieren
            </button>
            <button
              type="button"
              onClick={loeschen}
              disabled={pending}
              className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
            >
              {pending ? "Lösche…" : "Ausgewählte löschen"}
            </button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={anzeigeRows}
        emptyMessage="Noch keine Kostenpositionen erfasst."
        searchPlaceholder="Kosten durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        renderExpanded={(k, colSpan) => {
          if (k.aufteilung) return <AufteilungZeile teile={k.aufteilung} colSpan={colSpan} />;
          return k.rohdaten ? (
            <RohdatenZeile
              rohdaten={k.rohdaten}
              colSpan={colSpan}
              downloadHref={k.importBatchId ? `/api/import-batches/${k.importBatchId}/download` : undefined}
              downloadLabel={`Originaldatei herunterladen${k.importDateiname ? ` (${k.importDateiname})` : ""}`}
            />
          ) : null;
        }}
      />
    </div>
  );
}
