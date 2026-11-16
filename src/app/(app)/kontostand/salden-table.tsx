"use client";

import { DataTable, type Column } from "@/components/data-table";
import { KARTE_KENNZEICHEN, KarteKopf, KarteWerte } from "@/components/karte";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));
}

export type SaldoRow = {
  id: string;
  datum: string;
  anfang: number | null;
  umsatz: number;
  anzahl: number;
  /** Kontostand laut Bank am Ende des Tages. */
  bank: number;
  /** Stand laut Buchungen der App am Ende des Tages (relativ zum ersten Bankstand). */
  app: number;
  /** Buchungen minus Bank (0 = stimmt). */
  differenz: number;
  /** Die Differenz hat sich an diesem Tag gegenüber dem Tag davor geändert — hier fehlt oder stimmt eine Buchung nicht. */
  neu: boolean;
};

const stimmt = (z: SaldoRow) => Math.abs(z.differenz) < 0.005;

const columns: Column<SaldoRow>[] = [
  { key: "datum", label: "Tag", sortValue: (z) => z.datum, render: (z) => formatDate(z.datum) },
  {
    key: "anfang",
    label: "Anfang",
    align: "right",
    sortValue: (z) => z.anfang ?? 0,
    render: (z) => <span className="text-neutral-400">{z.anfang === null ? "–" : formatEuro(z.anfang)}</span>,
  },
  {
    key: "umsatz",
    label: "Umsätze",
    align: "right",
    title: "Summe der Umsätze dieses Tages laut Datei",
    sortValue: (z) => z.umsatz,
    render: (z) => (
      <span className={z.umsatz < 0 ? "text-red-400" : "text-green-400"}>
        {formatEuro(z.umsatz)} <span className="text-xs text-neutral-500">({z.anzahl})</span>
      </span>
    ),
  },
  {
    key: "bank",
    label: "Kontostand Bank",
    align: "right",
    sortValue: (z) => z.bank,
    render: (z) => <span className="font-medium text-white">{formatEuro(z.bank)}</span>,
  },
  {
    key: "app",
    label: "Laut Buchungen",
    align: "right",
    title: "Stand, den die in der App erfassten Buchungen ergeben (ab dem Bankstand des ersten Tages gerechnet)",
    sortValue: (z) => z.app,
    render: (z) => <span className="text-neutral-200">{formatEuro(z.app)}</span>,
  },
  {
    key: "differenz",
    label: "Differenz",
    align: "right",
    title: "Buchungen minus Bank: positiv = in der App fehlen Ausgaben oder es sind zu viele Einnahmen erfasst, negativ = umgekehrt",
    sortValue: (z) => z.differenz,
    render: (z) =>
      stimmt(z) ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">stimmt</span>
      ) : (
        <span className="text-red-400">{formatEuro(z.differenz)}</span>
      ),
  },
];

export function SaldenTable({ rows }: { rows: SaldoRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Salden gespeichert."
      searchPlaceholder="Tage durchsuchen (z.B. 03.2026)…"
      defaultSort={{ key: "datum", dir: "desc" }}
      zeilenSchritt={50}
      rowClassName={(z) => (stimmt(z) ? "" : "bg-red-500/5")}
      selectFilter={{
        label: "Ergebnis",
        placeholder: "Alle Tage",
        value: (z) => (stimmt(z) ? "stimmt" : z.neu ? "neu" : "abweichung"),
        options: [
          { value: "neu", label: "Hier beginnt eine Abweichung" },
          { value: "abweichung", label: "Weiter mit Abweichung" },
          { value: "stimmt", label: "Stimmt" },
        ],
      }}
      mobileCard={(z) => (
        <>
          <KarteKopf
            titel={formatDate(z.datum)}
            wert={
              stimmt(z) ? (
                <span className={`${KARTE_KENNZEICHEN} bg-green-500/10 text-green-400`}>stimmt</span>
              ) : (
                formatEuro(z.differenz)
              )
            }
            wertKlasse={stimmt(z) ? "text-white" : "text-red-400"}
            wertLabel={stimmt(z) ? undefined : "Differenz"}
          />
          <KarteWerte
            werte={[
              { label: "Bank", wert: formatEuro(z.bank) },
              { label: "Buchungen", wert: formatEuro(z.app) },
              { label: `Umsätze (${z.anzahl})`, wert: formatEuro(z.umsatz), klasse: z.umsatz < 0 ? "text-red-400" : "text-green-400" },
            ]}
          />
        </>
      )}
    />
  );
}
