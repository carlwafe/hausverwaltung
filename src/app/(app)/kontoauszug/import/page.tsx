"use client";

import { Fragment, useActionState, useState } from "react";
import Link from "next/link";
import {
  previewImport,
  commitZahlungen,
  commitKosten,
  commitMietweiterleitungen,
  commitKautionsbuchungen,
} from "./actions";
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

// Jede Zeile bekommt genau eine primäre Hinweis-Kategorie (die Art der Buchung — Fehler,
// Eigentümer, Rücklastschrift, …) nach Priorität, plus unabhängig davon null oder mehrere
// Zusatz-Tags (Dedup-Warnungen), die zusätzlich zur Kategorie angezeigt werden. Eine
// Rücklastschrift, die schon als Zahlung existiert, zeigt so z.B. "Rücklastschrift" +
// "Bereits importiert (als Zahlung)" gleichzeitig, statt dass der Dedup-Hinweis von der
// Kategorie verdeckt wird.
type ZahlungHinweisKategorie =
  | "fehler"
  | "eigentuemer"
  | "kaution"
  | "pruefen"
  | "mehrdeutig"
  | "rueckbuchung"
  | "vorschlag";

type ZahlungHinweisTag = "bereits_importiert" | "bereits_als_kosten_importiert";

type ZahlungHinweisFilter = "alle" | ZahlungHinweisKategorie | ZahlungHinweisTag;

function ermittleZahlungHinweis(
  r: Pick<
    ParsedZahlungRow,
    | "errors"
    | "eigentuemerBuchung"
    | "kaution"
    | "ignorieren"
    | "rueckbuchung"
    | "mehrdeutig"
    | "vorgeschlagenerMietvertragId"
  >,
): ZahlungHinweisKategorie {
  if (r.errors.length > 0) return "fehler";
  if (r.eigentuemerBuchung) return "eigentuemer";
  if (r.kaution) return "kaution";
  if (r.ignorieren) return "pruefen";
  if (r.rueckbuchung) return "rueckbuchung";
  if (r.mehrdeutig) return "mehrdeutig";
  if (r.vorgeschlagenerMietvertragId) return "vorschlag";
  return "pruefen";
}

function ermittleZahlungTags(
  bereitsImportiert: boolean,
  bereitsAlsKostenImportiert: boolean,
): ZahlungHinweisTag[] {
  const tags: ZahlungHinweisTag[] = [];
  // Gilt unabhängig von der Kategorie: sowohl eine normale ausgehende Buchung, die schon als
  // Kostenposition erfasst ist, als auch z.B. eine Rücklastschrift oder Gutschrift, die
  // ebenfalls schon dort steht.
  if (bereitsAlsKostenImportiert) tags.push("bereits_als_kosten_importiert");
  if (bereitsImportiert) tags.push("bereits_importiert");
  return tags;
}

const ZAHLUNG_HINWEIS_LABELS: Record<ZahlungHinweisKategorie | ZahlungHinweisTag, string> = {
  fehler: "Fehler",
  eigentuemer: "Eigentümer-Buchung",
  kaution: "Kaution",
  pruefen: "Bitte prüfen",
  mehrdeutig: "Mehrdeutig, bitte prüfen",
  rueckbuchung: "Rücklastschrift",
  vorschlag: "Vorschlag übernommen",
  bereits_importiert: "Bereits importiert (als Zahlung)",
  bereits_als_kosten_importiert: "Bereits importiert (als Kosten)",
};

const ZAHLUNG_HINWEIS_FARBEN: Record<ZahlungHinweisKategorie | ZahlungHinweisTag, string> = {
  fehler: "text-red-400",
  eigentuemer: "text-neutral-500",
  kaution: "text-blue-400",
  pruefen: "text-neutral-500",
  mehrdeutig: "text-amber-400",
  rueckbuchung: "text-red-400",
  vorschlag: "text-green-400",
  bereits_importiert: "text-amber-400",
  bereits_als_kosten_importiert: "text-green-400",
};

const ZAHLUNG_HINWEIS_OPTIONEN: { value: ZahlungHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: ZAHLUNG_HINWEIS_LABELS.vorschlag },
  { value: "pruefen", label: ZAHLUNG_HINWEIS_LABELS.pruefen },
  { value: "mehrdeutig", label: ZAHLUNG_HINWEIS_LABELS.mehrdeutig },
  { value: "rueckbuchung", label: ZAHLUNG_HINWEIS_LABELS.rueckbuchung },
  { value: "bereits_importiert", label: ZAHLUNG_HINWEIS_LABELS.bereits_importiert },
  {
    value: "bereits_als_kosten_importiert",
    label: ZAHLUNG_HINWEIS_LABELS.bereits_als_kosten_importiert,
  },
  { value: "eigentuemer", label: ZAHLUNG_HINWEIS_LABELS.eigentuemer },
  { value: "kaution", label: ZAHLUNG_HINWEIS_LABELS.kaution },
  { value: "fehler", label: ZAHLUNG_HINWEIS_LABELS.fehler },
];

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

// Prüft, ob eine Buchung bereits als Kostenposition importiert wurde — gleicher Dedup-Schlüssel
// wie kostenDedupSchluessel in actions.ts (Empfänger|Datum|Betrag), nur mit umgedrehtem
// Vorzeichen: Kostenposition.betrag ist dort immer der negierte Rohbetrag (positiv bei
// ausgehenden Kosten, NEGATIV bei einer Gutschrift/Rücküberweisung), während Zahlungen hier das
// Vorzeichen der Rohbuchung unverändert behalten. Ein einfaches Math.abs() auf beiden Seiten
// würde für ausgehende Kosten zufällig passen, für Gutschriften aber nie matchen (-11,69 in
// Kosten vs. abs(11,69) hier) — deshalb bewusst negieren statt abs, das passt für beide Fälle.
function pruefeAlsKostenImportiert(
  bestehendeKosten: Set<string>,
  name: string,
  datum: string | null,
  betrag: number | null,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeKosten.has(`${name.trim().toLowerCase()}|${datum}|${(-betrag).toFixed(2)}`);
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
    r.errors.length === 0 &&
    !r.kaution &&
    Boolean(gewaehlterMietvertragId) &&
    !(skipDuplicates && duplikat);
  return { ...r, gewaehlterMietvertragId, periodeMonat: monat, periodeJahr: jahr, ausgewaehlt };
}

function matchesZahlungHinweisFilter(
  r: ZahlungEditRow,
  bereitsImportiert: boolean,
  bereitsAlsKostenImportiert: boolean,
  filter: ZahlungHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  const tags: (ZahlungHinweisKategorie | ZahlungHinweisTag)[] = ermittleZahlungTags(
    bereitsImportiert,
    bereitsAlsKostenImportiert,
  );
  // Ein Tag-Filter (z.B. "bereits importiert") zeigt jede Zeile mit diesem Tag, egal welche
  // Kategorie sie sonst hat. Ein Kategorie-Filter (z.B. "Bitte prüfen") zeigt dagegen nur
  // "unbelastete" Zeilen ohne Tag — eine Zeile mit Tag ist bereits erledigt/dupliziert und
  // gehört ausschließlich in die Tag-gefilterte Ansicht, nicht zusätzlich in die Kategorie.
  if (tags.includes(filter)) return true;
  return ermittleZahlungHinweis(r) === filter && tags.length === 0;
}

function ZahlungenSektion({
  rows,
  kandidaten,
  bestehendeZahlungenListe,
  bestehendeKostenListe,
  importBatchId,
}: {
  rows: ParsedZahlungRow[];
  kandidaten: { id: string; label: string }[];
  bestehendeZahlungenListe: string[];
  bestehendeKostenListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitZahlungen, null);
  const bestehendeZahlungen = new Set(bestehendeZahlungenListe);
  const bestehendeKosten = new Set(bestehendeKostenListe);
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

  function istBereitsAlsKostenImportiert(r: ZahlungEditRow): boolean {
    return pruefeAlsKostenImportiert(bestehendeKosten, r.name, r.datum, r.betrag);
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
    matchesZahlungHinweisFilter(r, istBereitsImportiert(r), istBereitsAlsKostenImportiert(r), hinweisFilter),
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
              const bereitsAlsKostenImportiert = istBereitsAlsKostenImportiert(r);
              const kannAuswaehlen = r.errors.length === 0 && !r.kaution && Boolean(r.gewaehlterMietvertragId);
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
                            ausgewaehlt: Boolean(e.target.value) && r.errors.length === 0 && !r.kaution,
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
                      {(() => {
                        const kategorie = ermittleZahlungHinweis(r);
                        if (kategorie === "fehler") {
                          return <span className="text-red-400">{r.errors.join("; ")}</span>;
                        }
                        const tags = ermittleZahlungTags(bereitsImportiert, bereitsAlsKostenImportiert);
                        const wirdUebersprungen = bereitsImportiert && !r.ausgewaehlt;
                        return (
                          <>
                            <span className={ZAHLUNG_HINWEIS_FARBEN[kategorie]}>
                              {ZAHLUNG_HINWEIS_LABELS[kategorie]}
                            </span>
                            {tags.map((tag) => (
                              <span key={tag} className={`ml-1 ${ZAHLUNG_HINWEIS_FARBEN[tag]}`}>
                                {ZAHLUNG_HINWEIS_LABELS[tag]}
                                {tag === "bereits_importiert" && wirdUebersprungen ? " – wird übersprungen" : ""}
                              </span>
                            ))}
                          </>
                        );
                      })()}
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

// Gleiches Prinzip wie bei den Zahlungen (ermittleZahlungHinweis oben): jede Zeile bekommt
// genau eine primäre Kategorie nach Priorität, plus unabhängig davon null oder mehrere
// Zusatz-Tags (Dedup-Warnungen) — z.B. zeigt eine Gutschrift, die schon als Kostenposition
// existiert, "Gutschrift" + "Bereits importiert (als Kosten)" gleichzeitig.
type KostenHinweisKategorie =
  | "fehler"
  | "eigentuemer"
  | "kaution"
  | "eingehend"
  | "gutschrift"
  | "rueckbuchung"
  | "vorschlag"
  | "pruefen";

type KostenHinweisTag = "bereits_importiert" | "bereits_als_zahlung_importiert" | "bereits_als_kaution_importiert";

type KostenHinweisFilter = "alle" | KostenHinweisKategorie | KostenHinweisTag;

function ermittleKostenHinweis(
  r: Pick<
    ParsedKostenRow,
    | "errors"
    | "eigentuemerBuchung"
    | "kaution"
    | "ignorieren"
    | "gutschrift"
    | "rueckbuchung"
    | "vorgeschlageneKostenartId"
    | "vorgeschlageneGebaeudeAuswahl"
  >,
): KostenHinweisKategorie {
  if (r.errors.length > 0) return "fehler";
  if (r.eigentuemerBuchung) return "eigentuemer";
  if (r.kaution) return "kaution";
  if (r.ignorieren) return "eingehend";
  if (r.gutschrift) return "gutschrift";
  if (r.rueckbuchung) return "rueckbuchung";
  return hatVollstaendigenVorschlag(r) ? "vorschlag" : "pruefen";
}

function ermittleKostenTags(
  bereitsImportiert: boolean,
  bereitsAlsZahlungImportiert: boolean,
  bereitsAlsKautionImportiert: boolean,
): KostenHinweisTag[] {
  const tags: KostenHinweisTag[] = [];
  // Gilt unabhängig von der Kategorie: sowohl eine ignorierte eingehende Buchung (vermutlich
  // Miete) als auch z.B. eine Rücklastschrift, Gutschrift oder Kaution, die ebenfalls schon
  // anderswo importiert wurde.
  if (bereitsAlsZahlungImportiert) tags.push("bereits_als_zahlung_importiert");
  if (bereitsAlsKautionImportiert) tags.push("bereits_als_kaution_importiert");
  if (bereitsImportiert) tags.push("bereits_importiert");
  return tags;
}

const KOSTEN_HINWEIS_LABELS: Record<KostenHinweisKategorie | KostenHinweisTag, string> = {
  fehler: "Fehler",
  eigentuemer: "Eigentümer-Buchung",
  kaution: "Kaution",
  eingehend: "Eingehend, bitte prüfen",
  gutschrift: "Gutschrift",
  rueckbuchung: "Rücklastschrift",
  vorschlag: "Vorschlag übernommen",
  pruefen: "Bitte prüfen",
  bereits_importiert: "Bereits importiert (als Kosten)",
  bereits_als_zahlung_importiert: "Bereits importiert (als Zahlung)",
  bereits_als_kaution_importiert: "Bereits importiert (als Kaution)",
};

const KOSTEN_HINWEIS_FARBEN: Record<KostenHinweisKategorie | KostenHinweisTag, string> = {
  fehler: "text-red-400",
  eigentuemer: "text-neutral-500",
  kaution: "text-blue-400",
  eingehend: "text-neutral-500",
  gutschrift: "text-blue-400",
  rueckbuchung: "text-red-400",
  vorschlag: "text-green-400",
  pruefen: "text-amber-400",
  bereits_importiert: "text-amber-400",
  bereits_als_zahlung_importiert: "text-green-400",
  bereits_als_kaution_importiert: "text-green-400",
};

const KOSTEN_HINWEIS_OPTIONEN: { value: KostenHinweisFilter; label: string }[] = [
  { value: "alle", label: "Alle Hinweise" },
  { value: "vorschlag", label: KOSTEN_HINWEIS_LABELS.vorschlag },
  { value: "pruefen", label: KOSTEN_HINWEIS_LABELS.pruefen },
  { value: "gutschrift", label: KOSTEN_HINWEIS_LABELS.gutschrift },
  { value: "rueckbuchung", label: KOSTEN_HINWEIS_LABELS.rueckbuchung },
  { value: "eingehend", label: KOSTEN_HINWEIS_LABELS.eingehend },
  { value: "bereits_als_zahlung_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_als_zahlung_importiert },
  { value: "bereits_als_kaution_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_als_kaution_importiert },
  { value: "bereits_importiert", label: KOSTEN_HINWEIS_LABELS.bereits_importiert },
  { value: "eigentuemer", label: KOSTEN_HINWEIS_LABELS.eigentuemer },
  { value: "kaution", label: KOSTEN_HINWEIS_LABELS.kaution },
  { value: "fehler", label: KOSTEN_HINWEIS_LABELS.fehler },
];

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

// Prüft, ob eine eingehende, ignorierte Buchung bereits als Zahlung importiert wurde. Zahlung
// hat (anders als Kostenposition.empfaenger) keine eigene Empfänger-Spalte, deshalb hier
// bewusst nur Datum+Betrag als Schlüssel — etwas großzügiger als der empfänger-basierte
// Schlüssel bei Kosten, reicht aber für einen Hinweis-Badge. Betragshöhe ohne Vorzeichen, siehe
// Kommentar zu bestehendeZahlungenDatumBetrag in actions.ts.
function pruefeAlsZahlungImportiert(
  bestehendeZahlungen: Set<string>,
  datum: string | null,
  betrag: number | null,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeZahlungen.has(`${datum}|${Math.abs(betrag).toFixed(2)}`);
}

// Gleicher Schlüssel wie datumBetragZweckSchluessel in actions.ts (Datum|Betrag|Verwendungszweck,
// ohne Empfänger). Vorzeichen umgedreht statt Betrag genommen — Kostenposition.betrag ist hier
// der negierte Rohbetrag (siehe pruefeAlsKostenImportiert oben), KautionBuchung.betrag behält
// dagegen das Rohvorzeichen der Buchung unverändert.
function pruefeAlsKautionImportiert(
  bestehendeKautionsbuchungen: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehendeKautionsbuchungen.has(`${datum}|${(-betrag).toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
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
  bereitsAlsZahlungImportiert: boolean,
  bereitsAlsKautionImportiert: boolean,
  filter: KostenHinweisFilter,
): boolean {
  if (filter === "alle") return true;
  const tags: (KostenHinweisKategorie | KostenHinweisTag)[] = ermittleKostenTags(
    bereitsImportiert,
    bereitsAlsZahlungImportiert,
    bereitsAlsKautionImportiert,
  );
  // Gleiches Prinzip wie bei den Zahlungen: ein Tag-Filter zeigt jede Zeile mit diesem Tag,
  // ein Kategorie-Filter dagegen nur "unbelastete" Zeilen ohne Tag.
  if (tags.includes(filter)) return true;
  return ermittleKostenHinweis(r) === filter && tags.length === 0;
}

function KostenSektion({
  rows,
  kostenarten,
  gebaeude,
  bestehendeKostenListe,
  bestehendeZahlungenListe,
  bestehendeKautionListe,
  importBatchId,
}: {
  rows: ParsedKostenRow[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  gebaeude: {
    id: string;
    label: string;
    strasse: string;
    hausnummer: string;
    haus: { id: string } | null;
    kostengruppen: { id: string; bezeichnung: string }[];
  }[];
  bestehendeKostenListe: string[];
  bestehendeZahlungenListe: string[];
  bestehendeKautionListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitKosten, null);
  const bestehendeKosten = new Set(bestehendeKostenListe);
  const bestehendeZahlungen = new Set(bestehendeZahlungenListe);
  const bestehendeKaution = new Set(bestehendeKautionListe);
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

  function istBereitsAlsZahlungImportiert(r: KostenEditRow): boolean {
    return pruefeAlsZahlungImportiert(bestehendeZahlungen, r.datum, r.betrag);
  }

  function istBereitsAlsKautionImportiert(r: KostenEditRow): boolean {
    return pruefeAlsKautionImportiert(bestehendeKaution, r.datum, r.betrag, r.verwendungszweck);
  }

  const gefilterteRows = editRows.filter((r) =>
    matchesKostenHinweisFilter(
      r,
      istBereitsImportiert(r),
      istBereitsAlsZahlungImportiert(r),
      istBereitsAlsKautionImportiert(r),
      hinweisFilter,
    ),
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
              const bereitsAlsZahlungImportiert = istBereitsAlsZahlungImportiert(r);
              const bereitsAlsKautionImportiert = istBereitsAlsKautionImportiert(r);
              const kannAuswaehlen = r.errors.length === 0 && Boolean(r.gewaehlteKostenartId);
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
                      {(() => {
                        const kategorie = ermittleKostenHinweis(r);
                        if (kategorie === "fehler") {
                          return <span className="text-red-400">{r.errors.join("; ")}</span>;
                        }
                        const tags = ermittleKostenTags(
                          bereitsImportiert,
                          bereitsAlsZahlungImportiert,
                          bereitsAlsKautionImportiert,
                        );
                        return (
                          <>
                            <span className={KOSTEN_HINWEIS_FARBEN[kategorie]}>
                              {KOSTEN_HINWEIS_LABELS[kategorie]}
                            </span>
                            {tags.map((tag) => (
                              <span key={tag} className={`ml-1 ${KOSTEN_HINWEIS_FARBEN[tag]}`}>
                                {KOSTEN_HINWEIS_LABELS[tag]}
                              </span>
                            ))}
                          </>
                        );
                      })()}
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

// ---------- Mietweiterleitungen ----------

type MietweiterleitungEditRow = ParsedZahlungRow & { ausgewaehlt: boolean };

// Kein Empfänger im Schlüssel — die Gegenpartei ist bei jeder Zeile dieselbe Eigentümerin,
// Datum+Betrag+Verwendungszweck reichen zur Unterscheidung (gleicher Schlüssel wie
// mietweiterleitungDedupSchluessel in actions.ts).
function pruefeMietweiterleitungDuplikat(
  bestehend: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

function toMietweiterleitungEditRow(r: ParsedZahlungRow, bestehend: Set<string>): MietweiterleitungEditRow {
  const duplikat = pruefeMietweiterleitungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  return { ...r, ausgewaehlt: r.errors.length === 0 && !duplikat };
}

function MietweiterleitungenSektion({
  rows,
  bestehendeListe,
  importBatchId,
}: {
  rows: ParsedZahlungRow[];
  bestehendeListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitMietweiterleitungen, null);
  const bestehend = new Set(bestehendeListe);
  const [editRows, setEditRows] = useState<MietweiterleitungEditRow[]>(() =>
    rows.map((r) => toMietweiterleitungEditRow(r, bestehend)),
  );
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<MietweiterleitungEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: MietweiterleitungEditRow): boolean {
    return pruefeMietweiterleitungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  }

  const auswaehlbareRows = editRows.filter((r) => r.errors.length === 0);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    setEditRows((rs) => rs.map((r) => (r.errors.length === 0 ? { ...r, ausgewaehlt: checked } : r)));
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.name,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  if (commitMessage) {
    return (
      <div>
        <h2 className="mb-2 text-lg font-medium text-white">Mietweiterleitungen</h2>
        <p className="mb-2 text-sm text-green-400">{commitMessage}</p>
        <Link href="/mietweiterleitungen" className="text-sm underline">
          Zu den Mietweiterleitungen
        </Link>
      </div>
    );
  }

  if (editRows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-white">
        Mietweiterleitungen ({editRows.length} Buchung{editRows.length === 1 ? "" : "en"})
      </h2>
      <p className="mb-3 text-sm text-neutral-300">
        Geldbewegungen zwischen Konto und Eigentümerin — keine Miete, keine Kosten.{" "}
        {importierbareRows.length} werden importiert.
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
              <th className="px-3 py-2">Verwendungszweck</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {editRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
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
                        disabled={r.errors.length > 0}
                        onChange={(e) => updateRow(r.rowNumber, { ausgewaehlt: e.target.checked })}
                        className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:opacity-30"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-white">{r.datum ?? "–"}</td>
                    <td className="px-3 py-1.5 text-white">{r.betrag !== null ? formatEuro(r.betrag) : "–"}</td>
                    <td
                      className="max-w-[280px] truncate px-3 py-1.5 text-neutral-300"
                      title={`${r.verwendungszweck} ${r.name}`}
                    >
                      {r.verwendungszweck || r.name || "–"}
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 && <span className="text-red-400">{r.errors.join("; ")}</span>}
                      {r.errors.length === 0 && bereitsImportiert && (
                        <span className="text-amber-400">bereits importiert</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={6} />}
                </Fragment>
              );
            })}
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
          {commitPending ? "Importiere…" : `${importierbareRows.length} Mietweiterleitungen importieren`}
        </button>
      </form>
    </div>
  );
}

// ---------- Kaution ----------

type KautionEditRow = ParsedZahlungRow & { gewaehlterMietvertragId: string; ausgewaehlt: boolean };

// Gleicher Schlüssel wie datumBetragZweckSchluessel in actions.ts — kein Empfänger, da der
// Verwendungszweck (der i.d.R. den Mieternamen enthält) präziser ist als der oft nur
// "Eigentümerin/Kautionskonto"-lautende Empfänger.
function pruefeKautionsbuchungDuplikat(
  bestehend: Set<string>,
  datum: string | null,
  betrag: number | null,
  verwendungszweck: string,
): boolean {
  if (!datum || betrag === null) return false;
  return bestehend.has(`${datum}|${betrag.toFixed(2)}|${verwendungszweck.trim().toLowerCase()}`);
}

function toKautionEditRow(r: ParsedZahlungRow, bestehend: Set<string>): KautionEditRow {
  const duplikat = pruefeKautionsbuchungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  return {
    ...r,
    gewaehlterMietvertragId: r.vorgeschlagenerMietvertragId ?? "",
    ausgewaehlt: r.errors.length === 0 && !duplikat,
  };
}

function KautionSektion({
  rows,
  kandidaten,
  bestehendeListe,
  importBatchId,
}: {
  rows: ParsedZahlungRow[];
  kandidaten: { id: string; label: string }[];
  bestehendeListe: string[];
  importBatchId: string;
}) {
  const [commitMessage, commitAction, commitPending] = useActionState(commitKautionsbuchungen, null);
  const bestehend = new Set(bestehendeListe);
  const [editRows, setEditRows] = useState<KautionEditRow[]>(() =>
    rows.map((r) => toKautionEditRow(r, bestehend)),
  );
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  function updateRow(rowNumber: number, patch: Partial<KautionEditRow>) {
    setEditRows((rs) => rs.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));
  }

  function istBereitsImportiert(r: KautionEditRow): boolean {
    return pruefeKautionsbuchungDuplikat(bestehend, r.datum, r.betrag, r.verwendungszweck);
  }

  const auswaehlbareRows = editRows.filter((r) => r.errors.length === 0);
  const alleAusgewaehlt = auswaehlbareRows.length > 0 && auswaehlbareRows.every((r) => r.ausgewaehlt);

  function toggleAll(checked: boolean) {
    setEditRows((rs) => rs.map((r) => (r.errors.length === 0 ? { ...r, ausgewaehlt: checked } : r)));
  }

  const importierbareRows = editRows.filter((r) => r.ausgewaehlt);
  const rowsForCommit = importierbareRows.map((r) => ({
    mietvertragId: r.gewaehlterMietvertragId,
    datum: r.datum,
    betrag: r.betrag,
    empfaenger: r.name,
    verwendungszweck: r.verwendungszweck,
    rohdaten: r.rohdaten,
  }));

  if (commitMessage) {
    return (
      <div>
        <h2 className="mb-2 text-lg font-medium text-white">Kaution</h2>
        <p className="mb-2 text-sm text-green-400">{commitMessage}</p>
        <Link href="/kautionen" className="text-sm underline">
          Zu den Kautionen
        </Link>
      </div>
    );
  }

  if (editRows.length === 0) return null;

  return (
    <div>
      <h2 className="mb-3 text-lg font-medium text-white">
        Kaution ({editRows.length} Buchung{editRows.length === 1 ? "" : "en"})
      </h2>
      <p className="mb-3 text-sm text-neutral-300">
        Kautionszahlungen/-rückzahlungen — keine Miete, keine Mietweiterleitung.{" "}
        {importierbareRows.length} werden importiert.
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
              <th className="px-3 py-2">Verwendungszweck</th>
              <th className="px-3 py-2">Mietvertrag</th>
              <th className="px-3 py-2">Hinweis</th>
              <th className="px-3 py-2">Rohdaten</th>
            </tr>
          </thead>
          <tbody>
            {editRows.map((r) => {
              const bereitsImportiert = istBereitsImportiert(r);
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
                        disabled={r.errors.length > 0}
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
                        onChange={(e) => updateRow(r.rowNumber, { gewaehlterMietvertragId: e.target.value })}
                        className="w-full rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
                      >
                        <option value="">– keinem Mietvertrag zuordnen –</option>
                        {kandidaten.map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-1.5 text-xs">
                      {r.errors.length > 0 && <span className="text-red-400">{r.errors.join("; ")}</span>}
                      {r.errors.length === 0 && r.mehrdeutig && (
                        <span className="text-amber-400">mehrdeutig, bitte prüfen</span>
                      )}
                      {r.errors.length === 0 && !r.mehrdeutig && !r.gewaehlterMietvertragId && (
                        <span className="text-neutral-500">kein Treffer</span>
                      )}
                      {r.errors.length === 0 && bereitsImportiert && (
                        <span className="ml-1 text-amber-400">bereits importiert</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5">
                      <RohdatenToggleButton
                        expanded={expanded}
                        onClick={() => setExpandedRow(expanded ? null : r.rowNumber)}
                      />
                    </td>
                  </tr>
                  {expanded && <RohdatenZeile rohdaten={r.rohdaten} colSpan={7} />}
                </Fragment>
              );
            })}
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
          {commitPending ? "Importiere…" : `${importierbareRows.length} Kautionsbuchungen importieren`}
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
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-white">Kontoauszug importieren</h1>
        <Link href="/kontoauszug/importe" className="text-sm text-neutral-400 underline hover:text-white">
          Bisherige Importe verwalten
        </Link>
      </div>
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
            bestehendeKostenListe={preview.bestehendeKosten}
            importBatchId={preview.importBatchId}
          />

          <KostenSektion
            key={`kosten-${preview.importBatchId}`}
            rows={preview.kostenRows}
            kostenarten={preview.kostenarten}
            gebaeude={preview.gebaeude}
            bestehendeKostenListe={preview.bestehendeKosten}
            bestehendeZahlungenListe={preview.bestehendeZahlungenDatumBetrag}
            bestehendeKautionListe={preview.bestehendeKautionsbuchungen}
            importBatchId={preview.importBatchId}
          />

          <MietweiterleitungenSektion
            key={`mietweiterleitungen-${preview.importBatchId}`}
            rows={preview.zahlungenRows.filter((r) => r.eigentuemerBuchung)}
            bestehendeListe={preview.bestehendeMietweiterleitungen}
            importBatchId={preview.importBatchId}
          />

          <KautionSektion
            key={`kaution-${preview.importBatchId}`}
            rows={preview.zahlungenRows.filter((r) => r.kaution)}
            kandidaten={preview.mietvertragKandidaten}
            bestehendeListe={preview.bestehendeKautionsbuchungen}
            importBatchId={preview.importBatchId}
          />
        </div>
      )}
    </div>
  );
}
