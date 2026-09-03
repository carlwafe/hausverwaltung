"use client";

import { useActionState } from "react";
import Link from "next/link";
import { previewImport, commitImport } from "./actions";

const typLabel: Record<string, string> = {
  WOHNUNG: "Wohnung",
  GARAGE: "Garage",
};

export default function EinheitenImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [commitMessage, commitAction, commitPending] = useActionState(commitImport, null);

  const hasPreview = preview !== null && !("error" in preview);
  const validCount = hasPreview ? preview.rows.filter((r) => r.errors.length === 0).length : 0;
  const errorCount = hasPreview ? preview.rows.length - validCount : 0;

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
            <input
              id="file"
              name="file"
              type="file"
              accept=".csv,.xlsx,.xls"
              required
              className="block text-sm"
            />
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

      {hasPreview && !commitMessage && (
        <div>
          <p className="mb-4 text-sm text-neutral-300">
            {preview.rows.length} Zeile(n) gefunden — {validCount} importierbar
            {errorCount > 0 && `, ${errorCount} mit Fehlern (werden übersprungen)`}.
          </p>

          <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
                <tr>
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
                {preview.rows.map((r) => (
                  <tr
                    key={r.rowNumber}
                    className={`border-t border-neutral-800 ${r.errors.length > 0 ? "bg-red-950/40" : ""}`}
                  >
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
            <input type="hidden" name="rows" value={JSON.stringify(preview.rows)} />
            <input type="hidden" name="fileName" value={preview.fileName} />
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
