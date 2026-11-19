"use client";

import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { DeleteButton } from "@/components/delete-button";
import {
  pruefeCamtMonatVollstaendigkeit,
  pruefeImportVollstaendigkeit,
  raeumeVerwaisteImporteAuf,
} from "./actions";
import type { CamtMonatsErgebnis, VollstaendigkeitsErgebnis } from "@/lib/import/vollstaendigkeit";
import { jahrAusDateiname } from "@/lib/dokumente-anzeige";
import { KarteKopf, KarteMeta } from "@/components/karte";

function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type GruppierterImportRow = {
  /** = pruefBatchId bzw. „camt:yyyy-mm“ bei einer Monatszeile; DataTable braucht ein id-Feld. */
  id: string;
  dateiname: string;
  erstelltAm: string;
  anzahlZeilen: number | null;
  anzahlZahlungen: number;
  anzahlKosten: number;
  anzahlMietweiterleitungen: number;
  anzahlKautionsbuchungen: number;
  /** Bewusst nicht weiter verfolgte Buchungen (siehe SonstigeBuchung), z.B. eine
   * Betriebskostenabrechnungs-Rückzahlung für ein Jahr ohne Abrechnung in dieser App. */
  anzahlSonstige: number;
  /** Beim Import bewusst als "nicht kategorisiert" geparkt (siehe NichtZugeordneteBuchung) —
   * zählt als erklärt, nicht als offen, solange die Zeile nicht wieder gelöscht wird. */
  anzahlNichtZugeordnet: number;
  /** Wie oft dieselbe Datei hochgeladen und dabei etwas übernommen wurde. */
  anzahlImporte: number;
  /** Batch, dessen gespeicherte Datei für den Vollständigkeits-Check gelesen wird (der neueste). */
  pruefBatchId: string;
  /** Nur Monatszeilen der CAMT-Importe (yyyy-mm): geprüft werden alle Dateien des Monats zusammen. */
  camtMonat?: string;
  /** Dateinamen der CAMT-Importe, die zur Monatszeile gehören. */
  dateien?: string[];
};

type Ergebnis = VollstaendigkeitsErgebnis | CamtMonatsErgebnis | { error: string };

function formatTag(iso: string) {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

/** Abgleich einer Monatsprüfung mit den Tagessalden der Bank. */
function BankAbgleich({ bank }: { bank: CamtMonatsErgebnis["bank"] }) {
  const dateienText = `${bank.dateien} Datei${bank.dateien === 1 ? "" : "en"}`;
  if (bank.bankTage === 0) {
    return <p className="mt-1 text-xs text-neutral-500">{dateienText} · keine Bank-Salden für diesen Monat gespeichert</p>;
  }
  const sauber = bank.abweichendeTage.length === 0 && bank.luecken.length === 0;
  return (
    <div className="mt-1 text-xs">
      <p className={sauber ? "text-neutral-400" : "text-amber-400"}>
        {dateienText} · Bank-Tage bis {formatTag(bank.bisTag!)}
        {sauber ? " · Tagessummen stimmen mit der Bank überein" : ""}
      </p>
      {bank.luecken.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 text-amber-400">
          {bank.luecken.map((l) => (
            <li key={l.von}>
              Saldo-Lücke zwischen {formatTag(l.von)} und {formatTag(l.bis)} — dort fehlt eine Tagesdatei
            </li>
          ))}
        </ul>
      )}
      {bank.abweichendeTage.length > 0 && (
        <ul className="mt-0.5 space-y-0.5 text-amber-400">
          {bank.abweichendeTage.map((t) => (
            <li key={t.datum}>
              {formatTag(t.datum)}: Bank {formatEuro(t.bank)}, in den Importen {formatEuro(t.dateien)}
              {t.dateien === 0 ? " — Tag nie übernommen" : ""}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function VollstaendigkeitsZelle({
  ergebnis,
  pending,
  onPruefen,
}: {
  ergebnis: Ergebnis | null;
  pending: boolean;
  onPruefen: () => void;
}) {
  if (!ergebnis) {
    return (
      <button
        type="button"
        disabled={pending}
        onClick={onPruefen}
        className="text-xs text-neutral-400 underline hover:text-white disabled:opacity-50"
      >
        {pending ? "Prüfe…" : "Vollständigkeit prüfen"}
      </button>
    );
  }

  if ("error" in ergebnis) {
    return <span className="text-xs text-red-400">{ergebnis.error}</span>;
  }

  const bank = "bank" in ergebnis ? <BankAbgleich bank={ergebnis.bank} /> : null;

  if (ergebnis.ungeklaert.length === 0 && ergebnis.doppelteBuchungen.length === 0) {
    return (
      <div>
        <span className="text-xs text-green-400">Vollständig ({ergebnis.gesamt} Zeilen zugeordnet)</span>
        {bank}
      </div>
    );
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
      {bank}
    </div>
  );
}

function zuordnungsTeile(r: GruppierterImportRow): { label: string; anzahl: number }[] {
  return [
    { label: "Zahlungen", anzahl: r.anzahlZahlungen },
    { label: "Kosten", anzahl: r.anzahlKosten },
    { label: "Mietweiterleitungen", anzahl: r.anzahlMietweiterleitungen },
    { label: "Kaution", anzahl: r.anzahlKautionsbuchungen },
    { label: "Sonstige", anzahl: r.anzahlSonstige },
    { label: "Geparkt", anzahl: r.anzahlNichtZugeordnet },
  ].filter((t) => t.anzahl > 0);
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

  // Ergebnisse je Zeile (r.id): eine Datei bzw. bei CAMT-Monatszeilen alle Dateien des Monats.
  function pruefeEinzeln(r: GruppierterImportRow) {
    const key = r.id;
    setPendingIds((s) => new Set(s).add(key));
    startTransition(async () => {
      const ergebnis = r.camtMonat
        ? await pruefeCamtMonatVollstaendigkeit(r.camtMonat)
        : await pruefeImportVollstaendigkeit(r.pruefBatchId);
      setErgebnisse((m) => new Map(m).set(key, ergebnis));
      setPendingIds((s) => {
        const next = new Set(s);
        next.delete(key);
        return next;
      });
    });
  }

  function pruefeAusgewaehlte() {
    for (const r of ausgewaehlt) {
      if (!ergebnisse.has(r.id) && !pendingIds.has(r.id)) {
        pruefeEinzeln(r);
      }
    }
  }

  const offeneAuswahl = ausgewaehlt.filter((r) => !ergebnisse.has(r.id) && !pendingIds.has(r.id)).length;
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
      searchValue: (r) => [r.dateiname, ...(r.dateien ?? [])].join(" "),
      render: (r) => (
        <span className="text-white" title={r.dateien?.join("\n")}>
          {r.dateiname}
          {r.camtMonat ? (
            <span className="ml-1 text-xs text-neutral-500">
              ({r.anzahlImporte} XML-Import{r.anzahlImporte === 1 ? "" : "e"})
            </span>
          ) : (
            r.anzahlImporte > 1 && <span className="ml-1 text-xs text-neutral-500">({r.anzahlImporte}x importiert)</span>
          )}
        </span>
      ),
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
      key: "zuordnung",
      label: "Zugeordnet",
      sortValue: (r) => zuordnungsTeile(r).reduce((summe, t) => summe + t.anzahl, 0),
      render: (r) => {
        const teile = zuordnungsTeile(r);
        if (teile.length === 0) return <span className="text-neutral-500">–</span>;
        return (
          <span className="text-xs text-neutral-300">
            {teile.map((t) => `${t.anzahl} ${t.label}`).join(" · ")}
          </span>
        );
      },
    },
    {
      key: "vollstaendigkeit",
      label: "Vollständigkeit",
      render: (r) => (
        <VollstaendigkeitsZelle
          ergebnis={ergebnisse.get(r.id) ?? null}
          pending={pendingIds.has(r.id)}
          onPruefen={() => pruefeEinzeln(r)}
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

      {/* Mehrfachauswahl gibt es nur in der Tabelle (ab md). */}
      <div className="mb-3 hidden items-center justify-end gap-3 md:flex">
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
        mobileCardInteraktiv
        mobileCard={(r) => {
          const teile = zuordnungsTeile(r);
          return (
            <>
              <KarteKopf
                titel={r.dateiname}
                wert={r.anzahlZeilen !== null ? `${r.anzahlZeilen} Zeilen` : undefined}
                wertKlasse="text-neutral-300"
              />
              <KarteMeta>
                <span>
                  importiert am {formatDatum(r.erstelltAm)}
                  {r.camtMonat
                    ? ` (${r.anzahlImporte} XML-Import${r.anzahlImporte === 1 ? "" : "e"})`
                    : r.anzahlImporte > 1 && ` (${r.anzahlImporte}x)`}
                </span>
              </KarteMeta>
              {teile.length > 0 && (
                <div className="mt-1 text-xs text-neutral-400">{teile.map((t) => `${t.anzahl} ${t.label}`).join(" · ")}</div>
              )}
              <div className="mt-2">
                <VollstaendigkeitsZelle
                  ergebnis={ergebnisse.get(r.id) ?? null}
                  pending={pendingIds.has(r.id)}
                  onPruefen={() => pruefeEinzeln(r)}
                />
              </div>
            </>
          );
        }}
        mobileSort={{
          standardLabel: "neueste zuerst",
          optionen: [
            { label: "älteste zuerst", key: "erstelltAm", dir: "asc" },
            { label: "Dateiname A–Z", key: "dateiname", dir: "asc" },
          ],
        }}
      />
    </div>
  );
}
