"use client";

import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import { pruefeImportVollstaendigkeit, raeumeVerwaisteImporteAuf } from "./actions";
import type { VollstaendigkeitsErgebnis } from "@/lib/import/vollstaendigkeit";

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type GruppierterImportRow = {
  /** = pruefBatchId; DataTable braucht ein id-Feld. */
  id: string;
  dateiname: string;
  erstelltAm: string;
  anzahlZeilen: number | null;
  anzahlZahlungen: number;
  anzahlKosten: number;
  anzahlMietweiterleitungen: number;
  anzahlKautionsbuchungen: number;
  /** Bewusst nicht weiter verfolgte Buchungen (siehe SonstigeBuchung), z.B. eine
   * Nebenkostenabrechnungs-Rückzahlung für ein Jahr ohne Abrechnung in dieser App. */
  anzahlSonstige: number;
  /** Beim Import bewusst als "nicht kategorisiert" geparkt (siehe NichtZugeordneteBuchung) —
   * zählt als erklärt, nicht als offen, solange die Zeile nicht wieder gelöscht wird. */
  anzahlNichtZugeordnet: number;
  /** Wie oft dieselbe Datei hochgeladen und dabei etwas übernommen wurde. */
  anzahlImporte: number;
  /** Batch, dessen gespeicherte Datei für den Vollständigkeits-Check gelesen wird (der neueste). */
  pruefBatchId: string;
};

type Ergebnis = VollstaendigkeitsErgebnis | { error: string };

function VollstaendigkeitsZelle({
  batchId,
  ergebnis,
  pending,
  onPruefen,
}: {
  batchId: string;
  ergebnis: Ergebnis | null;
  pending: boolean;
  onPruefen: (batchId: string) => void;
}) {
  if (!ergebnis) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={() => onPruefen(batchId)}
        className="text-xs text-neutral-400 underline hover:text-white disabled:opacity-50"
      >
        {pending ? "Prüfe…" : "Vollständigkeit prüfen"}
      </button>
    );
  }

  if ("error" in ergebnis) {
    return <span className="text-xs text-red-400">{ergebnis.error}</span>;
  }

  if (ergebnis.ungeklaert.length === 0 && ergebnis.doppelteBuchungen.length === 0) {
    return <span className="text-xs text-green-400">Vollständig ({ergebnis.gesamt} Zeilen zugeordnet)</span>;
  }

  return (
    <div className="text-xs">
      {ergebnis.ungeklaert.length > 0 && (
        <>
          <p className="text-amber-400">
            {ergebnis.ungeklaert.length} von {ergebnis.gesamt} Zeilen ungeklärt
          </p>
          <ul className="mt-1 space-y-0.5 text-neutral-400">
            {ergebnis.ungeklaert.map((z) => (
              <li key={z.rowNumber}>
                {z.datum ?? "–"} · {z.betrag !== null ? formatEuro(z.betrag) : "–"} · {z.name || "–"} —{" "}
                {z.verwendungszweck || "–"}
              </li>
            ))}
          </ul>
        </>
      )}
      {ergebnis.doppelteBuchungen.length > 0 && (
        <>
          <p className={ergebnis.ungeklaert.length > 0 ? "mt-2 text-red-400" : "text-red-400"}>
            {ergebnis.doppelteBuchungen.length} Zeile{ergebnis.doppelteBuchungen.length === 1 ? "" : "n"} mehrfach
            erfasst
          </p>
          <ul className="mt-1 space-y-0.5 text-neutral-400">
            {ergebnis.doppelteBuchungen.map((z) => (
              <li key={z.rowNumber}>
                {z.datum ?? "–"} · {z.betrag !== null ? formatEuro(z.betrag) : "–"} · {z.name || "–"} —{" "}
                {z.verwendungszweck || "–"} · in: {z.kategorien.join(" + ")}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/** Jahr aus dem Dateinamen (die CSV-Dateien tragen eine Jahreszahl); ohne → "". */
function jahrAusDateiname(name: string): string {
  return name.match(/(?:19|20)\d{2}/)?.[0] ?? "";
}

export function ImporteTabelle({
  rows,
  verwaisteAnzahl,
}: {
  rows: GruppierterImportRow[];
  verwaisteAnzahl: number;
}) {
  const [ergebnisse, setErgebnisse] = useState<Map<string, Ergebnis>>(new Map());
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [ausgewaehlt, setAusgewaehlt] = useState<GruppierterImportRow[]>([]);
  const [, startTransition] = useTransition();

  function pruefeEinzeln(batchId: string) {
    setPendingIds((s) => new Set(s).add(batchId));
    startTransition(async () => {
      const ergebnis = await pruefeImportVollstaendigkeit(batchId);
      setErgebnisse((m) => new Map(m).set(batchId, ergebnis));
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(batchId);
        return next;
      });
    });
  }

  function pruefeAusgewaehlte() {
    for (const r of ausgewaehlt) {
      if (!ergebnisse.has(r.pruefBatchId) && !pendingIds.has(r.pruefBatchId)) {
        pruefeEinzeln(r.pruefBatchId);
      }
    }
  }

  const offeneAuswahl = ausgewaehlt.filter(
    (r) => !ergebnisse.has(r.pruefBatchId) && !pendingIds.has(r.pruefBatchId),
  ).length;
  const irgendeinePruefungLaeuft = pendingIds.size > 0;

  const jahre = [...new Set(rows.map((r) => jahrAusDateiname(r.dateiname)))]
    .sort()
    .reverse();
  const jahrOptionen = jahre.map((j) => ({ value: j, label: j || "Ohne Jahr" }));

  const columns: Column<GruppierterImportRow>[] = [
    {
      key: "dateiname",
      label: "Datei",
      sortValue: (r) => r.dateiname.toLowerCase(),
      searchValue: (r) => r.dateiname,
      render: (r) => (
        <span className="text-white">
          {r.dateiname}
          {r.anzahlImporte > 1 && (
            <span className="ml-1 text-xs text-neutral-500">({r.anzahlImporte}x importiert)</span>
          )}
        </span>
      ),
    },
    {
      key: "jahr",
      label: "Jahr",
      sortValue: (r) => jahrAusDateiname(r.dateiname),
      render: (r) => <span className="text-neutral-300">{jahrAusDateiname(r.dateiname) || "–"}</span>,
    },
    {
      key: "erstelltAm",
      label: "Importiert am",
      sortValue: (r) => r.erstelltAm,
      render: (r) => <span className="text-white">{formatDatum(r.erstelltAm)}</span>,
    },
    {
      key: "zeilen",
      label: "Zeilen",
      sortValue: (r) => r.anzahlZeilen ?? -1,
      render: (r) => <span className="text-neutral-300">{r.anzahlZeilen ?? "–"}</span>,
    },
    {
      key: "zahlungen",
      label: "Zahlungen",
      sortValue: (r) => r.anzahlZahlungen,
      render: (r) => <span className="text-neutral-300">{r.anzahlZahlungen}</span>,
    },
    {
      key: "kosten",
      label: "Kosten",
      sortValue: (r) => r.anzahlKosten,
      render: (r) => <span className="text-neutral-300">{r.anzahlKosten}</span>,
    },
    {
      key: "weiterleitungen",
      label: "Mietweiterleitungen",
      sortValue: (r) => r.anzahlMietweiterleitungen,
      render: (r) => <span className="text-neutral-300">{r.anzahlMietweiterleitungen}</span>,
    },
    {
      key: "kaution",
      label: "Kaution",
      sortValue: (r) => r.anzahlKautionsbuchungen,
      render: (r) => <span className="text-neutral-300">{r.anzahlKautionsbuchungen}</span>,
    },
    {
      key: "sonstige",
      label: "Sonstige",
      sortValue: (r) => r.anzahlSonstige,
      render: (r) => <span className="text-neutral-300">{r.anzahlSonstige}</span>,
    },
    {
      key: "geparkt",
      label: "Geparkt",
      sortValue: (r) => r.anzahlNichtZugeordnet,
      render: (r) => <span className="text-neutral-300">{r.anzahlNichtZugeordnet}</span>,
    },
    {
      key: "vollstaendigkeit",
      label: "Vollständigkeit",
      render: (r) => (
        <VollstaendigkeitsZelle
          batchId={r.pruefBatchId}
          ergebnis={ergebnisse.get(r.pruefBatchId) ?? null}
          pending={pendingIds.has(r.pruefBatchId)}
          onPruefen={pruefeEinzeln}
        />
      ),
    },
  ];

  return (
    <div>
      {verwaisteAnzahl > 0 && (
        <div className="mb-4 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3">
          <p className="text-sm text-neutral-300">
            {verwaisteAnzahl} gespeicherte Datei{verwaisteAnzahl === 1 ? "" : "en"} von reinen
            Vorschauen ohne übernommene Buchungen — kann gefahrlos gelöscht werden.
          </p>
          <DeleteButton
            action={raeumeVerwaisteImporteAuf}
            confirmText={`${verwaisteAnzahl} verwaiste Import(e) wirklich löschen? Die Originaldateien werden entfernt.`}
            label="Aufräumen"
          />
        </div>
      )}

      <div className="mb-3 flex items-center justify-end gap-3">
        <span className="text-xs text-neutral-500">{ausgewaehlt.length} ausgewählt</span>
        <button
          type="button"
          disabled={offeneAuswahl === 0 || irgendeinePruefungLaeuft}
          onClick={pruefeAusgewaehlte}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs text-neutral-200 hover:bg-neutral-800 disabled:opacity-50"
        >
          {irgendeinePruefungLaeuft ? "Prüfe…" : "Ausgewählte prüfen"}
        </button>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Noch keine Kontoauszug-Importe mit übernommenen Buchungen."
        searchPlaceholder="Datei suchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        selectFilter={{
          label: "Jahr",
          value: (r) => jahrAusDateiname(r.dateiname),
          options: jahrOptionen,
          placeholder: "Alle Jahre",
        }}
        defaultSort={{ key: "erstelltAm", dir: "desc" }}
      />
    </div>
  );
}
