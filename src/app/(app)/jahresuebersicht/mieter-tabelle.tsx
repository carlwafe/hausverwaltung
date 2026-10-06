"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { VerifikationsStern } from "./verifikations-stern";
import { KommentarFeld } from "./kommentar-feld";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

export type MieterTabellenZeile = {
  id: string; // Mietvertrag-ID
  einheit: string;
  // Rang in der Einheiten-Reihenfolge des Objekts (Haus-Reihenfolge), für die Sortierung.
  einheitRang: number;
  mieter: string;
  kaltmieteMtl: number;
  nebenkostenMtl: number;
  warmMtl: number;
  saldoAlt: number;
  sollKaltmiete: number;
  sollNebenkosten: number;
  soll: number;
  miete: number;
  nebenkostenabrechnungOffen: number | null;
  // Teil davon: Gegenrechnung der unbezahlten NK-Vorauszahlung des Vorjahres (steht schon im Rückstand).
  nebenkostenGegenrechnung: number;
  saldoNeu: number;
  verifiziert: boolean;
  kommentar: string;
};

function zahlSpalte(
  key: string,
  label: string,
  wert: (z: MieterTabellenZeile) => number,
  opts: { farbe?: (z: MieterTabellenZeile) => string } = {},
): Column<MieterTabellenZeile> {
  return {
    key,
    label,
    align: "right",
    sortValue: wert,
    render: (z) => <span className={opts.farbe?.(z) ?? "text-neutral-300"}>{formatEuro(wert(z))}</span>,
  };
}

export function MieterTabelle({
  zeilen,
  jahr,
  quartal,
  label,
  mitNkOffen,
}: {
  zeilen: MieterTabellenZeile[];
  jahr: number;
  quartal: number;
  label: string;
  mitNkOffen: boolean;
}) {
  const columns: Column<MieterTabellenZeile>[] = [
    {
      key: "einheit",
      label: "Einheit",
      sortValue: (z) => z.einheitRang,
      searchValue: (z) => z.einheit,
      render: (z) => (
        <Link prefetch={false} href={`/mietvertraege/${z.id}`} className="font-medium hover:underline">
          {z.einheit}
        </Link>
      ),
    },
    {
      key: "mieter",
      label: "Mieter",
      sortValue: (z) => z.mieter,
      searchValue: (z) => z.mieter,
      render: (z) => <span className="text-white">{z.mieter}</span>,
    },
    zahlSpalte("kaltmieteMtl", "Kaltmiete mtl.", (z) => z.kaltmieteMtl, { farbe: () => "text-neutral-400" }),
    zahlSpalte("nebenkostenMtl", "NK mtl.", (z) => z.nebenkostenMtl, { farbe: () => "text-neutral-400" }),
    zahlSpalte("warmMtl", "Miete warm mtl.", (z) => z.warmMtl, { farbe: () => "text-neutral-400" }),
    zahlSpalte("saldoAlt", "Saldo alt", (z) => z.saldoAlt, {
      farbe: (z) => (z.saldoAlt < 0 ? "text-red-400" : "text-neutral-300"),
    }),
    zahlSpalte("sollKaltmiete", "Soll Kaltmiete", (z) => z.sollKaltmiete),
    zahlSpalte("sollNebenkosten", "Soll Nebenkosten", (z) => z.sollNebenkosten),
    zahlSpalte("soll", "Soll gesamt", (z) => z.soll, { farbe: () => "text-neutral-200" }),
    zahlSpalte("miete", "Miete", (z) => z.miete),
    ...(mitNkOffen
      ? [
    {
      key: "nkOffen",
      label: "Nebenkostenabrechnung offen (Vorjahr)",
      align: "right",
      sortValue: (z) => z.nebenkostenabrechnungOffen ?? 0,
      render: (z) => (
        <span className="text-neutral-300">
          {z.nebenkostenabrechnungOffen ? formatEuro(z.nebenkostenabrechnungOffen) : "–"}
          {z.nebenkostenabrechnungOffen && z.nebenkostenGegenrechnung ? (
            <span
              className="block text-xs text-neutral-500"
              title="Unbezahlte NK-Vorauszahlung des Vorjahres: steht schon im Mietrückstand (Saldo alt/Soll) und wird hier gegengerechnet, damit sie nicht zusätzlich in der Nachzahlung zählt."
            >
              davon {formatEuro(z.nebenkostenGegenrechnung)} Gegenrechnung
            </span>
          ) : null}
        </span>
      ),
    } satisfies Column<MieterTabellenZeile>,
        ]
      : []),
    {
      key: "saldoNeu",
      label: "Saldo neu",
      align: "right",
      sortValue: (z) => z.saldoNeu,
      render: (z) => (
        <span className={`font-medium ${z.saldoNeu < 0 ? "text-red-400" : "text-white"}`}>
          {formatEuro(z.saldoNeu)}
        </span>
      ),
    },
    {
      key: "verifiziert",
      label: "✓",
      sortValue: (z) => (z.verifiziert ? 1 : 0),
      render: (z) => (
        <div className="text-center">
          <VerifikationsStern key={`${jahr}-${quartal}-${z.verifiziert}`} mietvertragId={z.id} jahr={jahr} quartal={quartal} verifiziert={z.verifiziert} />
        </div>
      ),
    },
    {
      key: "kommentar",
      label: "Kommentar",
      sortValue: (z) => z.kommentar.toLowerCase(),
      searchValue: (z) => z.kommentar,
      render: (z) => <KommentarFeld mietvertragId={z.id} jahr={jahr} quartal={quartal} kommentar={z.kommentar} />,
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={zeilen}
      emptyMessage={`Keine Mietverträge mit Bewegung in ${label}.`}
      searchPlaceholder="Einheit, Mieter, Kommentar suchen…"
      defaultSort={{ key: "einheit" }}
      renderFooter={(sichtbar) => {
        const summe = (f: (z: MieterTabellenZeile) => number) => formatEuro(sichtbar.reduce((s, z) => s + f(z), 0));
        const td = "px-4 py-2 text-right font-medium text-white";
        return (
          <tr className="border-t border-neutral-800">
            <td className="px-4 py-2 font-medium text-white">Summe</td>
            <td />
            <td className={td}>{summe((z) => z.kaltmieteMtl)}</td>
            <td className={td}>{summe((z) => z.nebenkostenMtl)}</td>
            <td className={td}>{summe((z) => z.warmMtl)}</td>
            <td className={td}>{summe((z) => z.saldoAlt)}</td>
            <td className={td}>{summe((z) => z.sollKaltmiete)}</td>
            <td className={td}>{summe((z) => z.sollNebenkosten)}</td>
            <td className={td}>{summe((z) => z.soll)}</td>
            <td className={td}>{summe((z) => z.miete)}</td>
            {mitNkOffen && <td className={td}>{summe((z) => z.nebenkostenabrechnungOffen ?? 0)}</td>}
            <td className={td}>{summe((z) => z.saldoNeu)}</td>
            <td colSpan={2} />
          </tr>
        );
      }}
    />
  );
}
