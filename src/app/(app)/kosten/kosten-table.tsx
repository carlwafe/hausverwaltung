"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { BelegBadge } from "@/components/beleg-badge";
import type { BelegStatus } from "@/lib/beleg-anzeige";
import { RohdatenToggleButton, RohdatenNachladenZeile } from "@/components/rohdaten-inline";
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
  // Die Bankzeile selbst wird erst beim Aufklappen geladen (RohdatenNachladenZeile).
  hatRohdaten: boolean;
  // Belegprüfung der Nebenkostenabrechnung: Dokument vorhanden / fehlt / „Kein Beleg nötig“ / nicht beleg-pflichtig.
  belegStatus: BelegStatus;
  importBatchId: string | null;
  importDateiname: string | null;
  // Gesetzt, wenn diese Zeile aus dem Aufteilen einer ursprünglich einzelnen Buchung entstanden
  // ist (siehe aufteilen-form.tsx) — alle Zeilen mit demselben Wert gehörten ursprünglich
  // zusammen. Bewusst nur als kleiner Hinweis dargestellt statt die Zeilen zusammenzufassen: eine
  // zusammengefasste Anzeige (z.B. "2 Kostenarten") wäre über die Kostenart-Suche nicht mehr
  // auffindbar — "Hausmeister" suchen würde die Buchung dann nicht mehr finden.
  aufteilungGruppeId: string | null;
  // Gesetzt bei einer virtuellen Gutschrift — Gegenbuchung zu einer Kautionsbuchung der Kategorie
  // VIRTUELLE_AUSZAHLUNG, ohne eigenen Kontofluss (siehe Kostenposition.virtuelleKautionBuchungId).
  virtuelleKautionBuchungId: string | null;
};

const columns: Column<KostenpositionRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum ?? "",
    render: (k) => (
      <Link prefetch={false} href={`/kosten/${k.id}`} className={TABELLEN_LINK}>
        {formatDate(k.datum)}
      </Link>
    ),
  },
  {
    key: "gebaeude",
    label: "Gebäude",
    sortValue: (k) => k.gebaeudeLabel,
    searchValue: (k) => k.gebaeudeLabel,
    // Feste Breite; der Zusatz hinter „ — “ (die Einheit, siehe gebaeudeOderHausLabel) steht klein darunter.
    render: (k) => {
      const [haupt, ...rest] = k.gebaeudeLabel.split(" — ");
      const zusatz = rest.join(" — ");
      return (
        <div className="w-36">
          {haupt}
          {zusatz && (
            <div title={zusatz} className="truncate text-xs text-neutral-400">
              {zusatz}
            </div>
          )}
        </div>
      );
    },
  },
  {
    key: "kostenart",
    label: "Kostenart",
    sortValue: (k) => k.kostenartName,
    searchValue: (k) => k.kostenartName,
    // Feste Breite; ein Klammerzusatz im Namen („… (über Techem verrechnet)“) steht klein darunter.
    render: (k) => {
      const klammer = k.kostenartName.match(/^(.+?)\s*\((.+)\)$/);
      return (
        <div className="w-40">
          {klammer ? klammer[1] : k.kostenartName}
          {k.aufteilungGruppeId && (
            <span
              title="Teil einer aufgeteilten Buchung"
              className="ml-1.5 inline-block rounded-full bg-blue-500/10 px-1.5 text-xs text-blue-400"
            >
              ✂
            </span>
          )}
          {k.virtuelleKautionBuchungId && (
            <span
              title="Virtuelle Gutschrift — keine eigene Kontobewegung, verrechnet mit einer Kaution"
              className="ml-1.5 inline-block rounded-full bg-purple-500/10 px-1.5 text-xs text-purple-400"
            >
              V
            </span>
          )}
          {klammer && <div className="text-xs text-neutral-400">{klammer[2]}</div>}
        </div>
      );
    },
  },
  {
    // Wie auf der Handy-Karte: nur ein Kennzeichen, wenn es zutrifft — leer = nicht umlagefähig.
    key: "umlagefaehig",
    label: "Uml.",
    title: "Umlagefähig (Kostenart wird in der Nebenkostenabrechnung auf die Mieter umgelegt)",
    sortValue: (k) => (k.umlagefaehig ? 1 : 0),
    render: (k) =>
      k.umlagefaehig ? (
        <span title="Umlagefähig" className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
          Ja
        </span>
      ) : null,
  },
  {
    key: "beleg",
    label: "Beleg",
    sortValue: (k) => ({ FEHLT: 0, AUSNAHME: 1, BELEGT: 2, ENTFAELLT: 3 })[k.belegStatus],
    render: (k) => <BelegBadge status={k.belegStatus} />,
  },
  {
    key: "betrag",
    label: "Betrag",
    align: "right",
    className: "whitespace-nowrap tabular-nums",
    sortValue: (k) => k.betrag,
    render: (k) => formatEuro(k.betrag),
  },
  {
    // Empfänger und Beschreibung teilen sich die Füllspalte (je eine Zeile, abgeschnitten): Zwei eigene
    // Freitext-Spalten machten die Tabelle breiter als die Seite und die Zeilen drei bis vier Textzeilen
    // hoch. Der volle Text steht im Tooltip und in der aufgeklappten Bankzeile.
    key: "empfaenger",
    label: "Empfänger · Beschreibung",
    title: "Sortiert nach Empfänger",
    fuellend: true,
    sortValue: (k) => k.empfaenger ?? "",
    searchValue: (k) => `${k.empfaenger ?? ""} ${k.beschreibung ?? ""}`,
    render: (k) => (
      <>
        <div title={k.empfaenger ?? undefined} className="truncate">
          {k.empfaenger || "–"}
        </div>
        {k.beschreibung && (
          <div title={k.beschreibung} className="truncate text-xs text-neutral-400">
            {k.beschreibung}
          </div>
        )}
      </>
    ),
  },
  {
    key: "quelle",
    label: "",
    title: "Bankzeile (Rohdaten)",
    render: (k, { expanded, toggleExpanded }) =>
      k.hatRohdaten ? (
        <RohdatenToggleButton symbol expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span title="Manuell erfasst — keine Bankzeile" className="flex h-7 w-7 items-center justify-center text-xs text-neutral-600">
          –
        </span>
      ),
  },
];

// Karte fürs Handy (unter md statt der Tabellenzeile, siehe `mobileCard` an DataTable): Kostenart und
// Betrag groß, darunter Empfänger, dann Datum/Gebäude/Umlage/Beleg und klein die Beschreibung. Ohne
// Links und Knöpfe — die ganze Karte führt zur Kostenposition. „Umlagefähig“ erscheint nur, wenn es
// zutrifft; ohne Kennzeichen ist die Position nicht umlagefähig.
function KostenKarte({ k }: { k: KostenpositionRow }) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span className="text-base font-medium leading-snug text-white">
          {k.kostenartName}
          {k.aufteilungGruppeId && (
            <span className="ml-1.5 inline-block rounded-full bg-blue-500/10 px-1.5 text-xs text-blue-400">✂</span>
          )}
          {k.virtuelleKautionBuchungId && (
            <span className="ml-1.5 inline-block rounded-full bg-purple-500/10 px-1.5 text-xs text-purple-400">V</span>
          )}
        </span>
        <span className="shrink-0 whitespace-nowrap text-base font-medium tabular-nums text-white">
          {formatEuro(k.betrag)}
        </span>
      </div>
      {k.empfaenger && <div className="mt-0.5 text-sm text-neutral-300">{k.empfaenger}</div>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-400">
        <span>
          {k.datum ? formatDate(k.datum) : k.jahr} · {k.gebaeudeLabel}
        </span>
        {k.umlagefaehig && (
          <span className="whitespace-nowrap rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">
            umlagefähig
          </span>
        )}
        {k.belegStatus === "FEHLT" ? (
          <span className="whitespace-nowrap rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">
            ⚠ Beleg fehlt
          </span>
        ) : (
          k.belegStatus !== "ENTFAELLT" && <BelegBadge status={k.belegStatus} />
        )}
      </div>
      {k.beschreibung && <div className="mt-1 truncate text-xs text-neutral-500">{k.beschreibung}</div>}
    </>
  );
}

const csvSpalten: CsvSpalte<KostenpositionRow>[] = [
  { label: "Datum", wert: (k) => formatDatumFuerCsv(k.datum) },
  { label: "Gebäude", wert: (k) => k.gebaeudeLabel },
  { label: "Kostenart", wert: (k) => k.kostenartName },
  { label: "Umlagefähig", wert: (k) => (k.umlagefaehig ? "Ja" : "Nein") },
  { label: "Beleg", wert: (k) => ({ BELEGT: "Ja", AUSNAHME: "Kein Beleg nötig", FEHLT: "Fehlt", ENTFAELLT: "" })[k.belegStatus] },
  { label: "Betrag", wert: (k) => formatEuroFuerCsv(k.betrag) },
  { label: "Empfänger", wert: (k) => k.empfaenger ?? "" },
  { label: "Beschreibung", wert: (k) => k.beschreibung ?? "" },
];

export function KostenTable({ rows }: { rows: KostenpositionRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<KostenpositionRow[]>([]);
  const [pending, startTransition] = useTransition();
  const kostenartOptionen = [...new Set(rows.map((r) => r.kostenartName))]
    .sort((a, b) => a.localeCompare(b, "de"))
    .map((name) => ({ value: name, label: name }));

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
        rows={rows}
        emptyMessage="Noch keine Kostenpositionen erfasst."
        searchPlaceholder="Kosten durchsuchen…"
        selectable
        kompakt
        rowHref={(k) => `/kosten/${k.id}`}
        mobileCard={(k) => <KostenKarte k={k} />}
        mobileSort={{
          standardLabel: "neueste zuerst",
          optionen: [
            { label: "älteste zuerst", key: "datum", dir: "asc" },
            { label: "höchster Betrag", key: "betrag", dir: "desc" },
            { label: "niedrigster Betrag", key: "betrag", dir: "asc" },
            { label: "Kostenart A–Z", key: "kostenart", dir: "asc" },
            { label: "Empfänger A–Z", key: "empfaenger", dir: "asc" },
          ],
        }}
        onSelectionChange={setAusgewaehlt}
        dateValue={(k) => k.datum}
        selectFilter={{
          label: "Kostenart",
          value: (k) => k.kostenartName,
          options: kostenartOptionen,
          placeholder: "Alle Kostenarten",
        }}
        selectFilter2={{
          label: "Umlage / Beleg",
          placeholder: "Alle Positionen",
          matches: (k, wert) =>
            (wert === "umlagefaehig" && k.umlagefaehig) ||
            (wert === "ohne-beleg" && k.belegStatus === "FEHLT") ||
            (wert === "ohne-beleg-umlage" && k.umlagefaehig && k.belegStatus === "FEHLT") ||
            (wert === "mit-beleg" && (k.belegStatus === "BELEGT" || k.belegStatus === "AUSNAHME")),
          options: [
            { value: "ohne-beleg", label: "Beleg fehlt" },
            { value: "ohne-beleg-umlage", label: "Umlagefähig – Beleg fehlt" },
            { value: "mit-beleg", label: "Beleg vorhanden / nicht nötig" },
            { value: "umlagefaehig", label: "Alle umlagefähigen anzeigen" },
          ],
        }}
        renderExpanded={(k, colSpan) =>
          k.hatRohdaten ? (
            <RohdatenNachladenZeile
              buchungId={k.id}
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
