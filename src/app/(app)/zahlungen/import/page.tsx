"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult } from "./actions";
import type { ParsedZahlungRow } from "@/lib/import/zahlungen-import";

const MONATE = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

type EditRow = ParsedZahlungRow & {
  gewaehlterMietvertragId: string; // "" = ignorieren
  periodeMonat: number;
  periodeJahr: number;
};

function toEditRow(r: ParsedZahlungRow): EditRow {
  const [jahr, monat] = r.datum ? r.datum.split("-").map(Number) : [new Date().getFullYear(), 1];
  return {
    ...r,
    gewaehlterMietvertragId: r.ignorieren || !r.vorgeschlagenerMietvertragId
      ? r.vorgeschlagenerMietvertragId ?? ""
      : r.vorgeschlagenerMietvertragId,
    periodeMonat: monat,
    periodeJahr: jahr,
  };
}

export default function ZahlungenImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [commitMessage, commitAction, commitPending] = useActionState(commitImport, null);
  const [lastPreview, setLastPreview] = useState<PreviewResult | null>(null);
  const [editRows, setEditRows] = useState<EditRow[] | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);

  const hasPreview = preview !== null && !("error" in preview);
  const kandidaten = hasPreview ? preview.kandidaten : [];
  const bestehendeZahlungen = hasPreview ? new Set(preview.bestehendeZahlungen) : new Set<string>();

  if (preview !== lastPreview) {
    setLastPreview(preview);
    setEditRows(hasPreview ? preview.rows.map(toEditRow) : null);
  }

  function updateRow(index: number, patch: Partial<EditRow>) {
    setEditRows((rows) => (rows ? rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) : rows));
  }

  function istBereitsImportiert(r: EditRow): boolean {
    if (!r.gewaehlterMietvertragId || !r.datum || r.betrag === null) return false;
    return bestehendeZahlungen.has(`${r.gewaehlterMietvertragId}|${r.datum}|${r.betrag.toFixed(2)}`);
  }

  const anzahlBereitsImportiert = editRows?.filter(istBereitsImportiert).length ?? 0;

  const importierbareRows =
    editRows?.filter(
      (r) =>
        r.gewaehlterMietvertragId &&
        r.datum &&
        r.betrag !== null &&
        !r.errors.length &&
        !(skipDuplicates && istBereitsImportiert(r)),
    ) ?? [];

  const rowsForCommit = importierbareRows.map((r) => ({
    mietvertragId: r.gewaehlterMietvertragId,
    datum: r.datum,
    betrag: r.betrag,
    periodeMonat: r.periodeMonat,
    periodeJahr: r.periodeJahr,
    verwendungszweck: r.verwendungszweck,
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Zahlungen aus Kontoauszug importieren</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Export deines Kontos hochladen. Eingehende Buchungen werden automatisch
        anhand von Betrag, Verwendungszweck und Absendername den Mietverträgen zugeordnet —
        ausgehende Buchungen werden ignoriert. Vor dem Import kannst du jede Zuordnung noch
        anpassen.
      </p>

      {!commitMessage && (
        <form action={previewAction} className="mb-8 flex items-end gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="file">
              Datei
            </label>
            <div className="relative inline-block">
              <input
                id="file"
                name="file"
                type="file"
                accept=".csv,.xlsx,.xls"
                required
                onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
              <div className="pointer-events-none inline-flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white">
                {fileName ?? "Datei auswählen…"}
              </div>
            </div>
          </div>
          <button
            type="submit"
            disabled={previewPending}
            className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {previewPending ? "Analysiere…" : "Datei analysieren"}
          </button>
        </form>
      )}

      {preview && "error" in preview && <p className="mb-4 text-sm text-red-400">{preview.error}</p>}

      {editRows && !commitMessage && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-neutral-300">
              {editRows.length} Buchung(en) gefunden — {importierbareRows.length} werden
              importiert
              {anzahlBereitsImportiert > 0 &&
                ` (${anzahlBereitsImportiert} bereits vorhanden${skipDuplicates ? ", übersprungen" : ""})`}
              .
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => setSkipDuplicates(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-transparent"
              />
              Bereits importierte überspringen
            </label>
          </div>

          <div className="mb-4 max-h-[480px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Betrag</th>
                  <th className="px-3 py-2">Verwendungszweck / Name</th>
                  <th className="px-3 py-2">Mietvertrag</th>
                  <th className="px-3 py-2">Periode</th>
                  <th className="px-3 py-2">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r, i) => {
                  const bereitsImportiert = istBereitsImportiert(r);
                  const wirdUebersprungen = bereitsImportiert && skipDuplicates;
                  return (
                    <tr
                      key={r.rowNumber}
                      className={`border-t border-neutral-800 ${
                        r.errors.length > 0 ? "bg-red-950/40" : wirdUebersprungen ? "opacity-50" : ""
                      }`}
                    >
                      <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                      <td className="px-3 py-1.5 text-white">
                        {r.betrag !== null ? formatEuro(r.betrag) : "–"}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                        title={`${r.verwendungszweck} ${r.name}`}
                      >
                        {r.verwendungszweck || r.name || "–"}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={r.gewaehlterMietvertragId}
                          disabled={wirdUebersprungen}
                          onChange={(e) => updateRow(i, { gewaehlterMietvertragId: e.target.value })}
                          className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-50"
                        >
                          <option value="">– ignorieren –</option>
                          {kandidaten.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex gap-1">
                          <select
                            value={r.periodeMonat}
                            disabled={wirdUebersprungen}
                            onChange={(e) => updateRow(i, { periodeMonat: Number(e.target.value) })}
                            className="rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-50"
                          >
                            {MONATE.map((m, idx) => (
                              <option key={m} value={idx + 1}>
                                {m}
                              </option>
                            ))}
                          </select>
                          <input
                            type="number"
                            value={r.periodeJahr}
                            disabled={wirdUebersprungen}
                            onChange={(e) => updateRow(i, { periodeJahr: Number(e.target.value) })}
                            className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-50"
                          />
                        </div>
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {r.errors.length > 0 && (
                          <span className="text-red-400">{r.errors.join("; ")}</span>
                        )}
                        {r.errors.length === 0 && r.ignorieren && (
                          <span className="text-neutral-500">ausgehend</span>
                        )}
                        {r.errors.length === 0 && !r.ignorieren && r.mehrdeutig && (
                          <span className="text-amber-400">mehrdeutig</span>
                        )}
                        {r.errors.length === 0 &&
                          !r.ignorieren &&
                          !r.vorgeschlagenerMietvertragId &&
                          !r.mehrdeutig &&
                          !bereitsImportiert && <span className="text-neutral-500">kein Treffer</span>}
                        {bereitsImportiert && (
                          <span className="ml-1 text-amber-400">
                            bereits importiert{wirdUebersprungen ? " – wird übersprungen" : ""}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <form action={commitAction}>
            <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
            <button
              type="submit"
              disabled={commitPending || importierbareRows.length === 0}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {commitPending ? "Importiere…" : `${importierbareRows.length} Zahlungen importieren`}
            </button>
          </form>
        </div>
      )}

      {commitMessage && (
        <div>
          <p className="mb-4 text-sm text-green-400">{commitMessage}</p>
          <Link href="/zahlungen" className="text-sm underline">
            Zu den Zahlungen
          </Link>
        </div>
      )}
    </div>
  );
}
