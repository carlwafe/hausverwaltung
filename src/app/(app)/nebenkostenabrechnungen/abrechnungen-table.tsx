"use client";

import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { KARTE_KENNZEICHEN, KarteKopf, KarteMeta, KarteWerte } from "@/components/karte";
import { formatEuro } from "@/lib/dokumente-anzeige";

export type AbrechnungZeile = {
  id: string;
  jahr: number;
  status: string;
  manuell: boolean;
  /** Fertig formatierte Daten (de-DE) — die Tabelle rechnet nicht mit ihnen. */
  versendetAm: string | null;
  erstelltAm: string;
  positionen: number;
  kostenanteil: number;
  vorauszahlung: number;
  /** Vorauszahlung − Kosten, wie gespeichert: positiv = Guthaben der Mieter. */
  saldo: number;
};

const STATUS: Record<string, { label: string; klasse: string }> = {
  ENTWURF: { label: "Entwurf", klasse: "bg-amber-500/10 text-amber-400" },
  FINAL: { label: "Final", klasse: "bg-green-500/10 text-green-400" },
};

function StatusKennzeichen({ row }: { row: AbrechnungZeile }) {
  const status = STATUS[row.status] ?? { label: row.status, klasse: "bg-neutral-800 text-neutral-300" };
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${KARTE_KENNZEICHEN} ${status.klasse}`}>{status.label}</span>
      {row.manuell && (
        <span
          title="Manuell geführt: Positionen von Hand, „Neu berechnen“ ist gesperrt."
          className={`${KARTE_KENNZEICHEN} bg-violet-500/10 text-violet-400`}
        >
          manuell
        </span>
      )}
    </span>
  );
}

const LEER = <span className="text-neutral-500">–</span>;

/** Betrag einer Abrechnung; ohne Positionen gibt es nichts zu summieren. */
function betrag(row: AbrechnungZeile, wert: number) {
  return row.positionen === 0 ? LEER : formatEuro(wert);
}

const BETRAG_SPALTE = { align: "right" as const, className: "whitespace-nowrap tabular-nums" };

const COLUMNS: Column<AbrechnungZeile>[] = [
  {
    key: "jahr",
    label: "Jahr",
    render: (r) => (
      <Link prefetch={false} href={`/nebenkostenabrechnungen/${r.id}`} className={`${TABELLEN_LINK} text-base tabular-nums`}>
        {r.jahr}
      </Link>
    ),
  },
  { key: "status", label: "Status", render: (r) => <StatusKennzeichen row={r} /> },
  {
    key: "versendet",
    label: "Versendet",
    title: "Datum, an dem die Abrechnung an die Mieter verschickt wurde.",
    className: "whitespace-nowrap",
    render: (r) => r.versendetAm ?? <span className="text-neutral-500">noch nicht</span>,
  },
  {
    key: "positionen",
    label: "Positionen",
    ...BETRAG_SPALTE,
    render: (r) => (r.positionen === 0 ? LEER : r.positionen),
  },
  { key: "kostenanteil", label: "Kosten", ...BETRAG_SPALTE, render: (r) => betrag(r, r.kostenanteil) },
  { key: "vorauszahlung", label: "Vorauszahlung", ...BETRAG_SPALTE, render: (r) => betrag(r, r.vorauszahlung) },
  {
    key: "saldo",
    label: "Saldo",
    title: "Vorauszahlung − Kosten über alle Positionen: positiv = Guthaben der Mieter, negativ = Nachzahlungen.",
    ...BETRAG_SPALTE,
    render: (r) => betrag(r, r.saldo),
  },
  {
    key: "erstellt",
    label: "Erstellt",
    align: "right",
    className: "whitespace-nowrap",
    render: (r) => <span className="text-neutral-400">{r.erstelltAm}</span>,
  },
];

export function AbrechnungenTable({ rows }: { rows: AbrechnungZeile[] }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={rows}
      emptyMessage="Noch keine Abrechnung angelegt."
      rowHref={(r) => `/nebenkostenabrechnungen/${r.id}`}
      mobileCard={(r) => (
        <>
          <KarteKopf titel={<span className="tabular-nums">{r.jahr}</span>} wert={<StatusKennzeichen row={r} />} />
          <KarteMeta>
            <span>{r.versendetAm ? `Versendet am ${r.versendetAm}` : "Noch nicht versendet"}</span>
            <span>·</span>
            <span>{r.positionen === 0 ? "keine Positionen" : `${r.positionen} Positionen`}</span>
          </KarteMeta>
          <KarteWerte
            werte={
              r.positionen === 0
                ? []
                : [
                    { label: "Kosten", wert: formatEuro(r.kostenanteil) },
                    { label: "Vorauszahlung", wert: formatEuro(r.vorauszahlung) },
                    { label: "Saldo", wert: formatEuro(r.saldo) },
                  ]
            }
          />
        </>
      )}
    />
  );
}
