"use client";

import { Fragment, useActionState, useState } from "react";
import Link from "next/link";
import { previewImport, commitZahlungen, commitKosten } from "./actions";
import type { ParsedZahlungRow } from "@/lib/import/zahlungen-import";
import type { ParsedKostenRow } from "@/lib/import/kosten-import";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { gruppiereKostenarten } from "@/lib/kostenart-gruppen";
import { gruppiereGebaeude } from "@/lib/gebaeude-gruppen";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const MONATE = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

// ---------- Zahlungen ----------

const ZAHLUNG_HINWEIS_OPTIONEN = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "mehrdeutig", label: "Mehrdeutig" },
  { value: "kein_treffer", label: "Kein Treffer" },
  { value: "fehler", label: "Fehler" },
  { value: "rueckbuchung", label: "Rücklastschrift" },
  { value: "ausgehend", label: "Ausgehend" },
  { value: "eigentuemer", label: "Eigentümer-Buchung" },
  { value: "bereits_importiert", label: "Bereits importiert" },
] as const;

type ZahlungHinweisFilter = (typeof ZAHLUNG_HINWEIS_OPTIONEN)[number]["value"];

type ZahlungEditRow = ParsedZahlungRow & {
  gewaehlterMietvertragId: string;
  periodeMonat: number;
  periodeJahr: number;
  ausgewaehlt: boolean;
};

function pruefeZahlungDuplikat(
  bestehendeZahlungen: Set<string>,
  mietvertragId: string,
  datum: string | null,
  betrag: number | null,
): boolean {
  if (!mietvertragId || !datum || betrag === null) return false;
  return bestehendeZahlungen.has(`${mietvertragId}|${datum}|${betrag.toFixed(2)}`);
}

function toZahlungEditRow(
  r: ParsedZahlungRow,
  bestehendeZahlungen: Set<string>,
  skipDuplicates: boolean,
): ZahlungEditRow {
  const [jahr, monat] = r.datum ? r.datum.split("-").map(Number) : [new Date().getFullYear(), 1];
  const gewaehlterMietvertragId = r.vorgeschlagenerMietvertragId ?? "";
  const duplikat = pruefeZahlungDuplikat(bestehendeZahlungen, gewaehlterMietvertragId, r.datum, r.betrag);
  const ausgewaehlt =
    r.errors.length === 0 && Boolean(gewaehlterMietvertragId) && !(skipDuplicates && duplikat);
  return { ...r, gewaehlterMietvertragId, periodeMonat: monat, periodeJahr: jahr, ausgewaehlt };
}

function matchesZahlungHinweisFilter(
  r: ZahlungEditRow,
  bereitsImportiert: boolean,
  filter: ZahlungHinweisFilter,
): boolean {
  switch (filter) {
    case "alle":
      return true;
    case "fehler":
      return r.errors.length > 0;
    case "eigentuemer":
      return r.errors.length === 0 && r.eigentuemerBuchung;
    case "ausgehend":
      return r.errors.length === 0 && !r.eigentuemerBuchung && r.ignorieren;
    case "rueckbuchung":
      return r.errors.length === 0 && r.rueckbuchung;
    case "mehrdeutig":
      return r.errors.length === 0 && !r.ignorieren && r.mehrdeutig;
    case "kein_treffer":
      return (
        r.errors.length === 0 &&
        !r.ignorieren &&
        !r.vorgeschlagenerMietvertragId &&
        !r.mehrdeutig &&
        !bereitsImportiert
      );
    case "bereits_importiert":
      return bereitsImportiert;
  }
}

function ZahlungenSektion({
  rows,
  kandidaten,
  bestehendeZahlungenListe,
  importBatchId,
}: {
  rows: ParsedZahlungRow[];
  kandidaten: { id: string; label: string }[];
  bestehendeZahlungenListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitZahlungen, null);
  const bestehendeZahlungen = new Set(bestehendeZahlungenListe);
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [editRows, setEditRows] = useState<ZahlungEditRow[]>(() =>
    rows.map((r) => toZahlungEditRow(r, bestehendeZahlungen, skipDuplicates)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<ZahlungHinweisFilter>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<ZahlungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: ZahlungEditRow): boolean {
    return pruefeZahlungDuplikat(bestehendeZahlungen, r.gewaehlterMietvertragId, r.datum, r.betrag);
  }

  function handleSkipDuplicatesChange(checked: boolean) {
    setSkipDuplicates(checked);
    setEditRows((rs) =>
      rs.map((r) =>
        istBereitsImportiert(r) && r.errors.length === 0 && r.gewaehlterMietvertragId
          ? { ...r, ausgewaehlt: !checked }
          : r,
      ),
    );
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesZahlungHinweisFilter(r, istBereitsImportiert(r), hinweisFilter),
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0 && r.gewaehlterMietvertragId);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) =>
        sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 && r.gewaehlterMietvertragId
          ? { ...r, ausgewaehlt: checked }
          : r,
      ),
    );
  }

  const anzahlBereitsImportiert = editRows.filter(istBereitsImportiert).length;
  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    mietvertragId: r.gewaehlterMietvertragId,
    datum: r.datum,
    betrag: r.betrag,
    periodeMonat: r.periodeMonat,
    periodeJahr: r.periodeJahr,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  if (commitMessage) {
    return (
      <div>
        <h2 className="mb-2 text-lg font-medium text-white">Zahlungen</h2>
        <p className="mb-2 text-sm text-green-400">{commitMessage}</p>
        <Link href="/zahlungen" className="text-sm underline">
          Zu den Zahlungen
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Zahlungen ({editRows.length} eingehende Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <div className="flex items-center gap-4">
          <select
            value={hinweisFilter}
            onChange={(e) => setHinweisFilter(e.target.value as ZahlungHinweisFilter)}
            className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
          >
            {ZAHLUNG_HINWEIS_OPTIONEN.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
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
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        {importierbareRows.length} werden importiert
        {anzahlBereitsImportiert > 0 &&
          ` (${anzahlBereitsImportiert} bereits vorhanden${skipDuplicates ? ", übersprungen" : ""})`}
        .{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
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
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Betrag</th>
              <th className="px-3 py-2">Verwendungszweck / Name</th>
              <th className="px-3 py-2">Mietvertrag</th>
              <th className="px-3 py-2">Periode</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {gefilterteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlterMietvertragId);
              const expanded = expandedRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr
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
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[220px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5">
                      <select
                        value={r.gewaehlterMietvertragId}
                        onChange={(e) =>
                          updateRow(r.rowNumber, {
                            gewaehlterMietvertragId: e.target.value,
                            ausgewaehlt: Boolean(e.target.value) && r.errors.length === 0,
                          })
                        }
                        className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
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
                          onChange={(e) => updateRow(r.rowNumber, { periodeMonat: Number(e.target.value) })}
                          className="rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
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
                          onChange={(e) => updateRow(r.rowNumber, { periodeJahr: Number(e.target.value) })}
                          className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
                        />
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 && <span className="text-red-400">{r.errors.join("; ")}</span>}
                      {r.errors.length === 0 && r.eigentuemerBuchung && (
                        <span className="text-neutral-500">Eigentümer-Buchung</span>
                      )}
                      {r.errors.length === 0 && !r.eigentuemerBuchung && r.ignorieren && (
                        <span className="text-neutral-500">ausgehend</span>
                      )}
                      {r.errors.length === 0 && r.rueckbuchung && (
                        <span className="text-red-400">Rücklastschrift</span>
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
                          bereits importiert{!r.ausgewaehlt ? " – wird übersprungen" : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={8} />}
                </Fragment>
              );
            })}
            {gefilterteRows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-neutral-500">
                  Keine Buchungen für diesen Filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <form action={commitAction}>
        <input type="hidden" name="rows" value={JSON.stringify(rowsForCommit)} />
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Zahlungen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Kosten ----------

const KOSTEN_HINWEIS_OPTIONEN = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: "Vorschlag übernommen" },
  { value: "vorschlag_bereits_importiert", label: "Vorschlag übernommen (bereits importiert)" },
  { value: "pruefen", label: "Bitte prüfen" },
  { value: "pruefen_bereits_importiert", label: "Bitte prüfen (bereits importiert)" },
  { value: "gutschrift", label: "Gutschrift" },
  { value: "fehler", label: "Fehler" },
  { value: "eingehend", label: "Ignoriert (Eigentümer/unbekannt eingehend)" },
  { value: "bereits_importiert", label: "Bereits importiert (alle)" },
] as const;

type KostenHinweisFilter = (typeof KOSTEN_HINWEIS_OPTIONEN)[number]["value"];

type KostenEditRow = ParsedKostenRow & {
  gewaehlteKostenartId: string;
  gewaehltesGebaeudeId: string;
  jahrEingabe: number;
  ausgewaehlt: boolean;
};

// Ein Vorschlag gilt als vollständig, sobald eine Kostenart feststeht und die Gebäude-Frage
// sicher beantwortet ist — auch wenn die Antwort "kein Gebäude" lautet (z.B. objektweite
// Bankgebühren oder Hausmeisterkosten). Nur eine nicht ermittelbare Gebäudezuordnung
// (vorgeschlageneGebaeudeAuswahl === undefined) macht den Vorschlag unvollständig.
function hatVollstaendigenVorschlag(
  r: Pick<ParsedKostenRow, "vorgeschlageneKostenartId" | "vorgeschlageneGebaeudeAuswahl">,
): boolean {
  return Boolean(r.vorgeschlageneKostenartId) && r.vorgeschlageneGebaeudeAuswahl !== undefined;
}

function pruefeKostenDuplikat(
  bestehend: Set<string>,
  empfaenger: string,
  datum: string | null,
  betrag: number | null,
) {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${empfaenger.trim().toLowerCase()}|${datum}|${betrag.toFixed(2)}`);
}

function toKostenEditRow(r: ParsedKostenRow, bestehendeKosten: Set<string>): KostenEditRow {
  const duplikat = pruefeKostenDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag);
  return {
    ...r,
    gewaehlteKostenartId: r.vorgeschlageneKostenartId ?? "",
    gewaehltesGebaeudeId: r.vorgeschlageneGebaeudeAuswahl ?? "",
    jahrEingabe: r.jahr ?? new Date().getFullYear(),
    ausgewaehlt: r.errors.length === 0 && !r.ignorieren && hatVollstaendigenVorschlag(r) && !duplikat,
  };
}

function matchesKostenHinweisFilter(
  r: KostenEditRow,
  bereitsImportiert: boolean,
  filter: KostenHinweisFilter,
): boolean {
  switch (filter) {
    case "alle":
      return true;
    case "fehler":
      return r.errors.length > 0;
    case "eingehend":
      return r.errors.length === 0 && r.ignorieren;
    case "bereits_importiert":
      return bereitsImportiert;
    case "gutschrift":
      return r.errors.length === 0 && !r.ignorieren && r.gutschrift;
    case "vorschlag":
      return r.errors.length === 0 && !r.ignorieren && hatVollstaendigenVorschlag(r) && !bereitsImportiert;
    case "vorschlag_bereits_importiert":
      return r.errors.length === 0 && !r.ignorieren && hatVollstaendigenVorschlag(r) && bereitsImportiert;
    case "pruefen":
      return r.errors.length === 0 && !r.ignorieren && !hatVollstaendigenVorschlag(r) && !bereitsImportiert;
    case "pruefen_bereits_importiert":
      return r.errors.length === 0 && !r.ignorieren && !hatVollstaendigenVorschlag(r) && bereitsImportiert;
  }
}

function KostenSektion({
  rows,
  kostenarten,
  gebaeude,
  bestehendeKostenListe,
  importBatchId,
}: {
  rows: ParsedKostenRow[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  gebaeude: { id: string; label: string; strasse: string; hausnummer: string; haus: { id: string } | null }[];
  bestehendeKostenListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitKosten, null);
  const bestehendeKosten = new Set(bestehendeKostenListe);
  const [editRows, setEditRows] = useState<KostenEditRow[]>(() =>
    rows.map((r) => toKostenEditRow(r, bestehendeKosten)),
  );
  const [hinweisFilter, setHinweisFilter] = useState<KostenHinweisFilter>("alle");
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.name);
  const gebaeudeGruppen = gruppiereGebaeude(gebaeude);

  function updateRow(rowNumber: number, patch: Partial<KostenEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: KostenEditRow): boolean {
    return pruefeKostenDuplikat(bestehendeKosten, r.empfaenger, r.datum, r.betrag);
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesKostenHinweisFilter(r, istBereitsImportiert(r), hinweisFilter),
  );
  const auswaehlbareRows = gefilterteRows.filter((r) => r.errors.length === 0 && r.gewaehlteKostenartId);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    const sichtbareRowNumbers = new Set(gefilterteRows.map((r) => r.rowNumber));
    setEditRows((rs) =>
      rs.map((r) =>
        sichtbareRowNumbers.has(r.rowNumber) && r.errors.length === 0 && r.gewaehlteKostenartId
          ? { ...r, ausgewaehlt: checked }
          : r,
      ),
    );
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt && r.gewaehlteKostenartId);
  const rowsForCommit = importierbareRows.map((r) => ({
    kostenartId: r.gewaehlteKostenartId,
    gebaeudeAuswahl: r.gewaehltesGebaeudeId,
    jahr: r.jahrEingabe,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.empfaenger,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  if (commitMessage) {
    return (
      <div>
        <h2 className="mb-2 text-lg font-medium text-white">Kosten</h2>
        <p className="mb-2 text-sm text-green-400">{commitMessage}</p>
        <Link href="/kosten" className="text-sm underline">
          Zu den Kosten
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">
          Kosten ({editRows.length} ausgehende Buchung{editRows.length === 1 ? "" : "en"})
        </h2>
        <select
          value={hinweisFilter}
          onChange={(e) => setHinweisFilter(e.target.value as KostenHinweisFilter)}
          className="rounded-md border border-neutral-700 bg-transparent px-2 py-1.5 text-sm text-white outline-none focus:border-neutral-400"
        >
          {KOSTEN_HINWEIS_OPTIONEN.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <p className="mb-3 text-sm text-neutral-300">
        {importierbareRows.length} werden importiert.{" "}
        {gefilterteRows.length !== editRows.length && `${gefilterteRows.length} davon nach Filter angezeigt.`}
      </p>

      <div className="mb-4 max-h-[420px] overflow-auto rounded-lg border border-neutral-800 pb-32">
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
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Betrag</th>
              <th className="px-3 py-2">Empfänger / Verwendungszweck</th>
              <th className="px-3 py-2">Kostenart</th>
              <th className="min-w-[140px] px-3 py-2">Gebäude</th>
              <th className="px-3 py-2">Jahr</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {gefilterteRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
              const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlteKostenartId);
              const vollstaendigerVorschlag = hatVollstaendigenVorschlag(r);
              const expanded = expandedRow === r.rowNumber;
              return (
                <Fragment key={r.rowNumber}>
                  <tr
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
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
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
                        {kostenartGruppen.map((gruppe) =>
                          gruppe.label ? (
                            <optgroup key={gruppe.label} label={gruppe.label}>
                              {gruppe.items.map((k) => (
                                <option key={k.id} value={k.id}>
                                  {k.name}
                                  {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                                </option>
                              ))}
                            </optgroup>
                          ) : (
                            gruppe.items.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name}
                                {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                              </option>
                            ))
                          ),
                        )}
                      </select>
                    </td>
                    <td className="min-w-[140px] px-3 py-1.5">
                      <select
                        value={r.gewaehltesGebaeudeId}
                        disabled={r.ignorieren || r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { gewaehltesGebaeudeId: e.target.value })}
                        className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                      >
                        <option value="">– Objekt gesamt –</option>
                        {gebaeudeGruppen.map((gruppe) => (
                          <optgroup key={gruppe.label} label={gruppe.label}>
                            {gruppe.optionen.map((g) => (
                              <option key={g.value} value={g.value}>
                                {g.label}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        type="number"
                        value={r.jahrEingabe}
                        disabled={r.ignorieren || r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { jahrEingabe: Number(e.target.value) })}
                        className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400 disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 && <span className="text-red-400">{r.errors.join("; ")}</span>}
                      {r.errors.length === 0 && r.ignorieren && (
                        <span className="text-neutral-500">
                          {r.eigentuemerBuchung ? "Eigentümer-Buchung" : "eingehend"}
                        </span>
                      )}
                      {r.errors.length === 0 && !r.ignorieren && r.gutschrift && (
                        <span className="mr-1 text-blue-400">Gutschrift</span>
                      )}
                      {r.errors.length === 0 && !r.ignorieren && r.rueckbuchung && (
                        <span className="mr-1 text-red-400">Rücklastschrift</span>
                      )}
                      {r.errors.length === 0 && !r.ignorieren && vollstaendigerVorschlag && (
                        <span className="text-green-400">Vorschlag übernommen</span>
                      )}
                      {r.errors.length === 0 && !r.ignorieren && !vollstaendigerVorschlag && (
                        <span className="text-amber-400">bitte prüfen</span>
                      )}
                      {bereitsImportiert && <span className="ml-1 text-amber-400">bereits importiert</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={9} />}
                </Fragment>
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
        <input type="hidden" name="importBatchId" value={importBatchId} />
        <button
          type="submit"
          disabled={commitPending || importierbareRows.length === 0}
          className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {commitPending ? "Importiere…" : `${importierbareRows.length} Kostenpositionen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Seite ----------

export default function KontoauszugImportPage() {
  const [preview, previewAction, previewPending] = useActionState(previewImport, null);
  const [fileName, setFileName] = useState<string | null>(null);

  const hasPreview = preview !== null && !("error" in preview);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kontoauszug importieren</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        CSV- oder Excel-Export deines Kontos einmal hochladen — eingehende Buchungen werden unten
        als Zahlungen vorgeschlagen (Zuordnung zu Mietverträgen), ausgehende Buchungen als Kosten
        (Zuordnung zu Kostenarten und Gebäuden). Eingehende Gutschriften/Rücküberweisungen von
        einem bereits bekannten Kosten-Empfänger (z.B. eine Techem-Erstattung) erscheinen ebenfalls
        bei den Kosten, als negativer Betrag zur Minderung der Kostenart. Beide Bereiche kannst du
        unabhängig voneinander prüfen und importieren.
      </p>

      {!hasPreview && (
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

      {hasPreview && (
        <div className="space-y-10">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="text-sm text-neutral-400 underline hover:text-white"
          >
            Andere Datei importieren
          </button>

          <ZahlungenSektion
            key={`zahlungen-${preview.importBatchId}`}
            rows={preview.zahlungenRows}
            kandidaten={preview.mietvertragKandidaten}
            bestehendeZahlungenListe={preview.bestehendeZahlungen}
            importBatchId={preview.importBatchId}
          />

          <KostenSektion
            key={`kosten-${preview.importBatchId}`}
            rows={preview.kostenRows}
            kostenarten={preview.kostenarten}
            gebaeude={preview.gebaeude}
            bestehendeKostenListe={preview.bestehendeKosten}
            importBatchId={preview.importBatchId}
          />
        </div>
      )}
    </div>
  );
}
