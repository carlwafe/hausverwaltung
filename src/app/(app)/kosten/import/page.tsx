"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { previewImport, commitImport, type PreviewResult } from "./actions";
import type { ParsedKostenRow } from "@/lib/import/kosten-import";
import { RohdatenDialog } from "@/components/rohdaten-dialog";

const HINWEIS_OPTIONEN = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: "Vorschlag übernommen" },
  { value: "pruefen", label: "Bitte prüfen" },
  { value: "fehler", label: "Fehler" },
  { value: "eingehend", label: "Eingehend / ignoriert" },
  { value: "bereits_importiert", label: "Bereits importiert" },
] as const;

type HinweisFilter = (typeof HINWEIS_OPTIONEN)[number]["value"];

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

type EditRow = ParsedKostenRow & {
  gewaehlteKostenartId: string;
  gewaehltesGebaeudeId: string;
  jahrEingabe: number;
  ausgewaehlt: boolean;
};

function pruefeDuplikat(bestehend: Set<string>, empfaenger: string, datum: string | null, betrag: number | null) {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${empfaenger.trim().toLowerCase()}|${datum}|${betrag.toFixed(2)}`);
}

function toEditRow(r: ParsedKostenRow, bestehendeKosten: Set<string>): EditRow {
  const hatVollstaendigenVorschlag = Boolean(
    r.vorgeschlageneKostenartId && r.vorgeschlagenesGebaeudeId,
  );
  const duplikat = pruefeDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag);
  return {
    ...r,
    gewaehlteKostenartId: r.vorgeschlageneKostenartId ?? "",
    gewaehltesGebaeudeId: r.vorgeschlagenesGebaeudeId ?? "",
    jahrEingabe: r.jahr ?? new Date().getFullYear(),
    // Nur automatisch anhaken, wenn Kostenart UND Gebäude eindeutig vorgeschlagen wurden — alles
    // andere (u.a. einmalige Reparaturrechnungen ohne Historie) muss bewusst bestätigt werden.
    ausgewaehlt: r.errors.length === 0 && !r.ignorieren && hatVollstaendigenVorschlag && !duplikat,
  };
}

function matchesHinweisFilter(r: EditRow, bereitsImportiert: boolean, filter: HinweisFilter): boolean {
  switch (filter) {
    case "alle":
      return true;
    case "fehler":
      return r.errors.length > 0;
    case "eingehend":
      return r.errors.length === 0 && r.ignorieren;
    case "bereits_importiert":
      return bereitsImportiert;
    case "vorschlag":
      return (
        r.errors.length === 0 &&
        !r.ignorieren &&
        Boolean(r.vorgeschlageneKostenartId && r.vorgeschlagenesGebaeudeId)
      );
    case "pruefen":
      return (
        r.errors.length === 0 &&
        !r.ignorieren &&
        !(r.vorgeschlageneKostenartId && r.vorgeschlagenesGebaeudeId)
      );
  }
}

export default function KostenImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [commitMessage, commitAction, commitPending] = useActionState(commitImport, null);
  const [lastPreview, setLastPreview] = useState<PreviewResult | null>(null);
  const [editRows, setEditRows] = useState<EditRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [hinweisFilter, setHinweisFilter] = useState<HinweisFilter>("alle");

  const hasPreview = preview !== null && !("error" in preview);
  const kostenarten = hasPreview ? preview.kostenarten : [];
  const gebaeude = hasPreview ? preview.gebaeude : [];
  const bestehendeKosten = hasPreview ? new Set(preview.bestehendeKosten) : new Set<string>();

  if (preview !== lastPreview) {
    setLastPreview(preview);
    setEditRows(hasPreview ? preview.rows.map((r) => toEditRow(r, bestehendeKosten)) : null);
  }

  function updateRow(rowNumber: number, patch: Partial<EditRow>) {
    setEditRows((rows) =>
      rows ? rows.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)) : rows,
    );
  }

  function istBereitsImportiert(r: EditRow): boolean {
    return pruefeDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag);
  }

  const gefilterteRows =
    editRows?.filter((r) => matchesHinweisFilter(r, istBereitsImportiert(r), hinweisFilter)) ?? [];

  const importierbareRows = editRows?.filter((r) => r.ausgewaehlt && r.gewaehlteKostenartId) ?? [];

  const rowsForCommit = importierbareRows.map((r) => ({
    kostenartId: r.gewaehlteKostenartId,
    gebaeudeId: r.gewaehltesGebaeudeId || null,
    jahr: r.jahrEingabe,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.empfaenger,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kosten aus Kontoauszug importieren</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Export deines Kontos hochladen. Ausgehende Buchungen werden als
        Kostenpositionen vorgeschlagen — wiederkehrende Zahlungen an einen bereits bekannten
        Empfänger (z.B. Versicherung, Hausmeister) werden automatisch mit der zuletzt genutzten
        Kostenart vorbelegt und direkt zum Import ausgewählt. Alles andere, insbesondere
        einmalige Reparaturrechnungen, bleibt unausgewählt und muss manuell geprüft und einer
        Kostenart zugeordnet werden. Ein Gebäude ist optional — Kosten, die das ganze Objekt
        betreffen (z.B. Bankgebühren, Verwaltungskosten), lässt man auf &quot;Objekt gesamt&quot;.
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
              importiert.{" "}
              {gefilterteRows.length !== editRows.length &&
                `${gefilterteRows.length} davon nach Filter angezeigt.`}
            </p>
            <select
              value={hinweisFilter}
              onChange={(e) => setHinweisFilter(e.target.value as HinweisFilter)}
              className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
            >
              {HINWEIS_OPTIONEN.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4 max-h-[480px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="sticky top-0 border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-3 py-2" />
                  <th className="px-3 py-2">Datum</th>
                  <th className="px-3 py-2">Betrag</th>
                  <th className="px-3 py-2">Empfänger / Verwendungszweck</th>
                  <th className="px-3 py-2">Kostenart</th>
                  <th className="px-3 py-2">Gebäude</th>
                  <th className="px-3 py-2">Jahr</th>
                  <th className="px-3 py-2">Hinweis</th>
                  <th className="px-3 py-2">Rohdaten</th>
                </tr>
              </thead>
              <tbody>
                {gefilterteRows.map((r) => {
                  const bereitsImportiert = istBereitsImportiert(r);
                  const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlteKostenartId);
                  const hatVollstaendigenVorschlag = Boolean(
                    r.vorgeschlageneKostenartId && r.vorgeschlagenesGebaeudeId,
                  );
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
                          onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                          className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                      <td className="px-3 py-1.5 text-white">
                        {r.betrag !== null ? formatEuro(r.betrag) : "–"}
                      </td>
                      <td
                        className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                        title={`${r.empfaenger} ${r.verwendungszweck}`}
                      >
                        {r.empfaenger || r.verwendungszweck || "–"}
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={r.gewaehlteKostenartId}
                          disabled={r.ignorieren || r.errors.length > 0}
                          onChange={(e) =>
                            updateRow(r.rowNumber, {
                              gewaehlteKostenartId: e.target.value,
                              ausgewaehlt: Boolean(e.target.value),
                            })
                          }
                          className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                        >
                          <option value="">– bitte wählen –</option>
                          {kostenarten.map((k) => (
                            <option key={k.id} value={k.id}>
                              {k.name}
                              {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <select
                          value={r.gewaehltesGebaeudeId}
                          disabled={r.ignorieren || r.errors.length > 0}
                          onChange={(e) =>
                            updateRow(r.rowNumber, { gewaehltesGebaeudeId: e.target.value })
                          }
                          className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                        >
                          <option value="">– Objekt gesamt –</option>
                          {gebaeude.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-1.5">
                        <input
                          type="number"
                          value={r.jahrEingabe}
                          disabled={r.ignorieren || r.errors.length > 0}
                          onChange={(e) =>
                            updateRow(r.rowNumber, { jahrEingabe: Number(e.target.value) })
                          }
                          className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                        />
                      </td>
                      <td className="px-3 py-1.5 text-xs">
                        {r.errors.length > 0 && (
                          <span className="text-red-400">{r.errors.join("; ")}</span>
                        )}
                        {r.errors.length === 0 && r.ignorieren && (
                          <span className="text-neutral-500">
                            {r.eigentuemerBuchung
                              ? "Eigentümer-Buchung"
                              : r.rueckbuchung
                                ? "Rücklastschrift"
                                : "eingehend"}
                          </span>
                        )}
                        {r.errors.length === 0 && !r.ignorieren && hatVollstaendigenVorschlag && (
                          <span className="text-green-400">Vorschlag übernommen</span>
                        )}
                        {r.errors.length === 0 && !r.ignorieren && !hatVollstaendigenVorschlag && (
                          <span className="text-amber-400">bitte prüfen</span>
                        )}
                        {bereitsImportiert && (
                          <span className="ml-1 text-amber-400">bereits importiert</span>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        <RohdatenDialog rohdaten={r.rohdaten} />
                      </td>
                    </tr>
                  );
                })}
                {gefilterteRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-3 py-8 text-center text-neutral-500">
                      Keine Buchungen für diesen Filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <form action={commitAction}>
            <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
            <input type="hidden" name="importBatchId" value={hasPreview ? preview.importBatchId : ""} />
            <button
              type="submit"
              disabled={commitPending || importierbareRows.length === 0}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
            >
              {commitPending ? "Importiere…" : `${importierbareRows.length} Kostenpositionen importieren`}
            </button>
          </form>
        </div>
      )}

      {commitMessage && (
        <div>
          <p className="mb-4 text-sm text-green-400">{commitMessage}</p>
          <Link href="/kosten" className="text-sm underline">
            Zu den Kosten
          </Link>
        </div>
      )}
    </div>
  );
}
