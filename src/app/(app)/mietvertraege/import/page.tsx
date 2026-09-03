"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult } from "./actions";
import type { ParsedVertragRow } from "@/lib/import/mietvertraege-import";

type EditRow = ParsedVertragRow & {
  gewaehlteEinheitId: string; // "" = ignorieren
  beginnEdit: string;
  endeEdit: string;
  kaltmieteEdit: string;
  nebenkostenEdit: string;
  ausgewaehlt: boolean;
};

function toEditRow(r: ParsedVertragRow, skipDuplicates: boolean): EditRow {
  const gewaehlteEinheitId = r.errors.length === 0 ? (r.einheitId ?? "") : "";
  const ausgewaehlt =
    r.errors.length === 0 && Boolean(gewaehlteEinheitId) && !(skipDuplicates && r.bereitsVorhanden);
  return {
    ...r,
    gewaehlteEinheitId,
    beginnEdit: r.beginn ?? "",
    endeEdit: r.ende ?? "",
    kaltmieteEdit: r.kaltmiete !== null ? String(r.kaltmiete) : "",
    nebenkostenEdit: String(r.nebenkostenVorauszahlung ?? 0),
    ausgewaehlt,
  };
}

export default function MietvertraegeImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [commitMessage, commitAction, commitPending] = useActionState(commitImport, null);
  const [lastPreview, setLastPreview] = useState<PreviewResult | null>(null);
  const [editRows, setEditRows] = useState<EditRow[] | null>(null);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [fileName, setFileName] = useState<string | null>(null);

  const hasPreview = preview !== null && !("error" in preview);
  const einheiten = hasPreview ? preview.einheiten : [];

  if (preview !== lastPreview) {
    setLastPreview(preview);
    setEditRows(hasPreview ? preview.rows.map((r) => toEditRow(r, skipDuplicates)) : null);
  }

  function updateRow(index: number, patch: Partial<EditRow>) {
    setEditRows((rows) => (rows ? rows.map((r, i) => (i === index ? { ...r, ...patch } : r)) : rows));
  }

  function handleSkipDuplicatesChange(checked: boolean) {
    setSkipDuplicates(checked);
    setEditRows((rows) =>
      rows
        ? rows.map((r) =>
            r.bereitsVorhanden && r.errors.length === 0 && r.gewaehlteEinheitId
              ? { ...r, ausgewaehlt: !checked }
              : r,
          )
        : rows,
    );
  }

  const auswaehlbareRows =
    editRows?.filter((r) => r.errors.length === 0 && r.gewaehlteEinheitId) ?? [];
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    setEditRows((rows) =>
      rows
        ? rows.map((r) =>
            r.errors.length === 0 && r.gewaehlteEinheitId ? { ...r, ausgewaehlt: checked } : r,
          )
        : rows,
    );
  }

  const importierbareRows = editRows?.filter((r) => r.ausgewaehlt) ?? [];

  const rowsForCommit = importierbareRows.map((r) => ({
    einheitId: r.gewaehlteEinheitId,
    mieter: r.mieterEintraege.map((m) => ({
      mieterId: m.mieterId,
      vorname: m.vorname,
      nachname: m.nachname,
    })),
    beginn: r.beginnEdit,
    ende: r.endeEdit || null,
    kaltmiete: Number(r.kaltmieteEdit),
    nebenkostenVorauszahlung: Number(r.nebenkostenEdit || 0),
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">
        Mietverträge (und Mieter) importieren
      </h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Datei mit einer Zeile pro Mietverhältnis hochladen — z.B. mit Spalten für
        Hausnummer, Wohnungsbezeichnung, Mietername, Mietbeginn und Kaltmiete. Die Zeilen müssen
        nicht vollständig sein; unvollständige Zeilen werden markiert und können übersprungen
        werden. Mieter, die noch nicht existieren, werden automatisch angelegt.
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
              {editRows.length} Zeile(n) gefunden — {importierbareRows.length} werden importiert.
            </p>
            <label className="flex items-center gap-2 text-sm text-neutral-300">
              <input
                type="checkbox"
                checked={skipDuplicates}
                onChange={(e) => handleSkipDuplicatesChange(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-transparent"
              />
              Bereits importierte überspringen
            </label>
          </div>

          <div className="mb-4 max-h-[520px] overflow-auto rounded-lg border border-neutral-800">
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
                  <th className="px-3 py-2">Einheit</th>
                  <th className="px-3 py-2">Mieter</th>
                  <th className="px-3 py-2">Beginn</th>
                  <th className="px-3 py-2">Ende</th>
                  <th className="px-3 py-2">Kaltmiete</th>
                  <th className="px-3 py-2">NK</th>
                  <th className="px-3 py-2">Hinweis</th>
                </tr>
              </thead>
              <tbody>
                {editRows.map((r, i) => {
                  const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlteEinheitId);
                  return (
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
                          disabled={!kannAuswaehlen}
                          onChange={(e) => updateRow(i, { ausgewaehlt: e.target.checked })}
                          className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-white">{r.rowNumber}</td>
                      <td className="px-3 py-1.5">
                        <select
                          value={r.gewaehlteEinheitId}
                          onChange={(e) =>
                            updateRow(i, {
                              gewaehlteEinheitId: e.target.value,
                              ausgewaehlt: Boolean(e.target.value) && r.errors.length === 0,
                            })
                          }
                          className="w-40 rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                        >
                          <option value="">– ignorieren –</option>
                          {einheiten.map((e) => (
                            <option key={e.id} value={e.id}>
                              {e.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5 text-white">
                        {r.mieterEintraege.length === 0
                          ? "–"
                          : r.mieterEintraege.map((m, idx) => (
                              <div key={idx}>
                                {m.vorname} {m.nachname}{" "}
                                <span className={m.mieterId ? "text-neutral-500" : "text-amber-400"}>
                                  {m.mieterId ? "(vorhanden)" : "(neu)"}
                                </span>
                              </div>
                            ))}
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={r.beginnEdit}
                          onChange={(e) => updateRow(i, { beginnEdit: e.target.value })}
                          className="w-32 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="date"
                          value={r.endeEdit}
                          onChange={(e) => updateRow(i, { endeEdit: e.target.value })}
                          className="w-32 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={r.kaltmieteEdit}
                          onChange={(e) => updateRow(i, { kaltmieteEdit: e.target.value })}
                          className="w-20 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          step="0.01"
                          value={r.nebenkostenEdit}
                          onChange={(e) => updateRow(i, { nebenkostenEdit: e.target.value })}
                          className="w-20 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {r.errors.length > 0 && (
                          <span className="text-red-400">{r.errors.join("; ")}</span>
                        )}
                        {r.bereitsVorhanden && (
                          <span className="ml-1 text-amber-400">
                            bereits importiert{!r.ausgewaehlt ? " – wird übersprungen" : ""}
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
              {commitPending ? "Importiere…" : `${importierbareRows.length} Mietverträge importieren`}
            </button>
          </form>
        </div>
      )}

      {commitMessage && (
        <div>
          <p className="mb-4 text-sm text-green-400">{commitMessage}</p>
          <Link href="/mietvertraege" className="text-sm underline">
            Zu den Mietverträgen
          </Link>
        </div>
      )}
    </div>
  );
}
