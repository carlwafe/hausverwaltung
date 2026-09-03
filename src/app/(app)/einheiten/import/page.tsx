"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult } from "./actions";
import type { ParsedEinheitRow } from "@/lib/import/einheiten-import";

const typLabel: Record<string, string> = {
  WOHNUNG: "Wohnung",
  GARAGE: "Garage",
};

type EditRow = ParsedEinheitRow & { ausgewaehlt: boolean };

function toEditRow(r: ParsedEinheitRow): EditRow {
  return { ...r, ausgewaehlt: r.errors.length === 0 };
}

export default function EinheitenImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [commitMessage, commitAction, commitPending] = useActionState(commitImport, null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [lastPreview, setLastPreview] = useState<PreviewResult | null>(null);
  const [editRows, setEditRows] = useState<EditRow[] | null>(null);

  const hasPreview = preview !== null && !("error" in preview);

  if (preview !== lastPreview) {
    setLastPreview(preview);
    setEditRows(hasPreview ? preview.rows.map(toEditRow) : null);
  }

  function updateRow(index: number, patch: Partial<EditRow>) {
    setEditRows((rows) => (rows ? rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) : rows));
  }

  const auswaehlbareRows = editRows?.filter((r) => r.errors.length === 0) ?? [];
  const alleAusgewaehlt =
    auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);
  const validCount = editRows?.filter((r) => r.ausgewaehlt).length ?? 0;
  const errorCount = editRows ? editRows.length - auswaehlbareRows.length : 0;

  function toggleAll(checked: boolean) {
    setEditRows((rows) =>
      rows ? rows.map((r) => (r.errors.length === 0 ? { ...r, ausgewaehlt: checked } : r)) : rows,
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Einheiten importieren</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        Excel- (.xlsx) oder CSV-Datei mit einer Zeile pro Einheit hochladen. Spalten für
        Bezeichnung, Typ, Etage und Wohnfläche werden anhand der Spaltenüberschriften
        automatisch erkannt.
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

      {preview && "error" in preview && (
        <p className="mb-4 text-sm text-red-400">{preview.error}</p>
      )}

      {editRows && !commitMessage && (
        <div>
          <p className="mb-4 text-sm text-neutral-300">
            {editRows.length} Zeile(n) gefunden — {validCount} ausgewählt
            {errorCount > 0 && `, ${errorCount} mit Fehlern (nicht auswählbar)`}.
          </p>

          <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={alleAusgewaehlt}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="h-4 w-4 rounded border-neutral-700 bg-transparent"
                    />
                  </th>
                  <th className="px-3 py-2">Zeile</th>
                  <th className="px-3 py-2">Gebäude</th>
                  <th className="px-3 py-2">Bezeichnung</th>
                  <th className="px-3 py-2">Typ</th>
                  <th className="px-3 py-2">Etage</th>
                  <th className="px-3 py-2">Wohnfläche</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r, i) => (
                  <tr
                    key={r.rowNumber}
                    className={`border-t border-neutral-800 ${
                      r.errors.length > 0 ? "bg-red-950/40" : !r.ausgewaehlt ? "opacity-50" : ""
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={r.ausgewaehlt}
                        disabled={r.errors.length > 0}
                        onChange={(e) => updateRow(i, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5">{r.rowNumber}</td>
                    <td className="px-3 py-1.5">
                      {r.strasse} {r.hausnummer}
                    </td>
                    <td className="px-3 py-1.5">{r.bezeichnung || "–"}</td>
                    <td className="px-3 py-1.5">{typLabel[r.typ]}</td>
                    <td className="px-3 py-1.5">{r.etage || "–"}</td>
                    <td className="px-3 py-1.5">{r.wohnflaecheQm ?? "–"}</td>
                    <td className="px-3 py-1.5">
                      {r.errors.length > 0 ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : (
                        <span className="text-green-400">OK</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <form action={commitAction}>
            <input
              type="hidden"
              name="rows"
              value={JSON.stringify(editRows.filter((r) => r.ausgewaehlt))}
            />
            <input type="hidden" name="fileName" value={preview && "fileName" in preview ? preview.fileName : ""} />
            <button
              type="submit"
              disabled={commitPending || validCount === 0}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {commitPending ? "Importiere…" : `${validCount} Einheiten importieren`}
            </button>
          </form>
        </div>
      )}

      {commitMessage && (
        <div>
          <p className="mb-4 text-sm text-green-400">{commitMessage}</p>
          <Link href="/einheiten" className="text-sm underline">
            Zur Einheitenliste
          </Link>
        </div>
      )}
    </div>
  );
}
