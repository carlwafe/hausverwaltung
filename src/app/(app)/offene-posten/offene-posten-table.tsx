"use client";

import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { KarteKopf, KarteMeta, KarteWerte, KarteZeile, saldoFarbe } from "@/components/karte";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type OffenePostenRow = {
  id: string;
  einheit: string;
  einheitRang: number;
  mieter: string;
  status: "AKTIV" | "BEENDET";
  soll: number;
  ist: number;
  saldovortrag: number;
  saldo: number;
  sonderforderung: number;
  // Gutschrift (+) bzw. Belastung (−) aus der unbezahlten bzw. überzahlten BK-Vorauszahlung versendeter
  // Abrechnungen (ab dem Versanddatum); steckt im Saldo.
  nkGegenrechnung: number;
  // Eigener, vom Objekt abweichender Buchhaltungs-Stichtag des Vertrags (formatiertes Datum), sonst null.
  eigenerStichtag: string | null;
};

const BETRAG = { align: "right", className: "whitespace-nowrap tabular-nums" } as const;

// Am Computer darf die Tabelle nicht breiter als die Seite sein (siehe „Tabellen am Computer“ in
// docs/tickets-logo-design.md): Einheit mit fester Breite, Mieter als Füllspalte, kurze Überschriften.
const columns: Column<OffenePostenRow>[] = [
  {
    key: "einheit",
    label: "Einheit",
    sortValue: (z) => z.einheitRang,
    searchValue: (z) => z.einheit,
    render: (z) => (
      // Feste Breite über das div (nicht die Zelle), sonst drückt die Füllspalte die Spalte zusammen.
      <div className="w-24">
        <Link prefetch={false} href={`/mietvertraege/${z.id}`} className={TABELLEN_LINK}>
          {z.einheit}
        </Link>
        {z.eigenerStichtag && (
          <span
            className="block text-xs font-normal text-amber-300"
            title="Dieser Vertrag hat einen eigenen Buchhaltungs-Stichtag (Mietvertrag bearbeiten → Buchhaltung ab); Soll, Ist und Saldovortrag gelten ab diesem Datum."
          >
            Stichtag {z.eigenerStichtag}
          </span>
        )}
      </div>
    ),
  },
  {
    key: "mieter",
    label: "Mieter",
    fuellend: true,
    sortValue: (z) => z.mieter,
    searchValue: (z) => z.mieter,
    render: (z) => (
      <div title={z.mieter} className="truncate">
        {z.mieter}
      </div>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortValue: (z) => z.status,
    searchValue: (z) => (z.status === "AKTIV" ? "Aktiv" : "Beendet"),
    render: (z) => (
      <span className="text-neutral-400">{z.status === "AKTIV" ? "Aktiv" : "Beendet"}</span>
    ),
  },
  {
    key: "soll",
    label: "Soll",
    ...BETRAG,
    sortValue: (z) => z.soll,
    render: (z) => formatEuro(z.soll),
  },
  {
    key: "ist",
    label: "Ist",
    ...BETRAG,
    sortValue: (z) => z.ist,
    render: (z) => formatEuro(z.ist),
  },
  {
    key: "saldovortrag",
    label: "Vortrag",
    title: "Saldovortrag",
    ...BETRAG,
    sortValue: (z) => z.saldovortrag,
    render: (z) =>
      z.saldovortrag === 0 ? (
        <span className="text-neutral-600">–</span>
      ) : (
        <span className={z.saldovortrag < 0 ? "text-red-400" : "text-green-400"}>
          {formatEuro(z.saldovortrag)}
        </span>
      ),
  },
  {
    key: "saldo",
    label: "Saldo",
    ...BETRAG,
    sortValue: (z) => z.saldo,
    render: (z) => (
      <span
        className={`font-medium ${z.saldo < 0 ? "text-red-400" : z.saldo > 0 ? "text-green-400" : "text-white"}`}
      >
        {formatEuro(z.saldo)}
      </span>
    ),
  },
  {
    key: "sonderforderung",
    label: "Sonderford.",
    title: "Davon Sonderforderung: offene Sonderforderungen (z.B. Rücklastschriftgebühren), im Saldo enthalten",
    ...BETRAG,
    sortValue: (z) => z.sonderforderung,
    render: (z) =>
      z.sonderforderung === 0 ? (
        <span className="text-neutral-600">–</span>
      ) : (
        <span className={z.sonderforderung > 0 ? "text-amber-400" : "text-green-400"}>
          {formatEuro(z.sonderforderung)}
        </span>
      ),
  },
  {
    key: "nkGegenrechnung",
    label: "BK-Gegenr.",
    title: "Davon BK-Gegenrechnung: Gegenrechnung der BK-Vorauszahlung versendeter Abrechnungen, im Saldo enthalten",
    ...BETRAG,
    sortValue: (z) => z.nkGegenrechnung,
    render: (z) =>
      z.nkGegenrechnung === 0 ? (
        <span className="text-neutral-600">–</span>
      ) : (
        <span
          className={z.nkGegenrechnung > 0 ? "text-green-400" : "text-amber-400"}
          title="Unbezahlte (+) bzw. überzahlte (−) BK-Vorauszahlung einer versendeten Betriebskostenabrechnung: steht im Mietsaldo, ist aber durch die Abrechnung ausgeglichen."
        >
          {formatEuro(z.nkGegenrechnung)}
        </span>
      ),
  },
];

// Karte fürs Handy (siehe `mobileCard` an DataTable). Die „davon“-Werte erscheinen nur, wenn sie nicht null sind.
function OffenePostenKarte({ z }: { z: OffenePostenRow }) {
  return (
    <>
      <KarteKopf titel={z.einheit} wert={formatEuro(z.saldo)} wertKlasse={saldoFarbe(z.saldo)} wertLabel="Saldo" />
      <KarteZeile>{z.mieter}</KarteZeile>
      <KarteMeta>
        <span>{z.status === "AKTIV" ? "Aktiv" : "Beendet"}</span>
        {z.eigenerStichtag && <span className="text-xs text-amber-300">· eigener Stichtag {z.eigenerStichtag}</span>}
      </KarteMeta>
      <KarteWerte
        werte={[
          { label: "Soll", wert: formatEuro(z.soll) },
          { label: "Ist", wert: formatEuro(z.ist) },
          z.saldovortrag !== 0 && {
            label: "Saldovortrag",
            wert: formatEuro(z.saldovortrag),
            klasse: z.saldovortrag < 0 ? "text-red-400" : "text-green-400",
          },
          z.sonderforderung !== 0 && {
            label: "Sonderforderung",
            wert: formatEuro(z.sonderforderung),
            klasse: z.sonderforderung > 0 ? "text-amber-400" : "text-green-400",
          },
          z.nkGegenrechnung !== 0 && {
            label: "BK-Gegenrechnung",
            wert: formatEuro(z.nkGegenrechnung),
            klasse: z.nkGegenrechnung > 0 ? "text-green-400" : "text-amber-400",
          },
        ]}
      />
    </>
  );
}

export function OffenePostenTable({ rows }: { rows: OffenePostenRow[] }) {
  return (
    <DataTable
      rowHref={(z) => `/mietvertraege/${z.id}`}
      mobileCard={(z) => <OffenePostenKarte z={z} />}
      mobileSort={{
        standardLabel: "nach Einheit",
        optionen: [
          { label: "höchster Rückstand", key: "saldo", dir: "asc" },
          { label: "Mieter A–Z", key: "mieter", dir: "asc" },
        ],
      }}
      columns={columns}
      rows={rows}
      selectFilter2={{
        label: "Saldo",
        placeholder: "Alle Verträge",
        // Cent-genau: Rundungsreste der Gleitkommarechnung gelten als null.
        matches: (z, wert) => wert === "ungleich-null" && Math.abs(z.saldo) >= 0.005,
        options: [{ value: "ungleich-null", label: "Nur Saldo ungleich null" }],
      }}
      kompakt
      emptyMessage="Keine aktiven oder beendeten Mietverträge vorhanden."
      searchPlaceholder="Offene Posten durchsuchen…"
    />
  );
}
