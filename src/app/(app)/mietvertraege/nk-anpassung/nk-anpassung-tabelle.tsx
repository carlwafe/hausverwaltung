"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { DataTable, type Column } from "@/components/data-table";

export type NkAnpassungZeile = {
  id: string; // Mietvertrag-ID
  einheitBezeichnung: string;
  einheitRang: number;
  mieterNamen: string;
  jahr: number; // Abrechnungsjahr der neuesten Abrechnung
  entwurf: boolean;
  kostenanteil: number;
  bisher: number; // monatliche Vorauszahlung vor dem vorgeschlagenen Gültig-ab
  jahreskosten: number | null; // Kostenanteil auf 12 Monate hochgerechnet (null = kein Kostenanteil)
  hochgerechnet: boolean; // unterjährige Nutzung → Jahreskosten ≠ Kostenanteil
  monatlich: number | null; // Jahreskosten ÷ 12, ohne Zuschlag
  vorschlag: number | null; // null = Kostenanteil 0 (z.B. Platzhalter-Position)
  angepasstAb: string | null; // ISO — Mieterhöhung nach dem Abrechnungsjahr
  indexMoeglich: boolean; // zum vorgeschlagenen Termin ist auch eine Indexerhöhung möglich → gemeinsames Schreiben
};

const euro = (n: number) => n.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const leer = <span className="text-neutral-600">–</span>;
const formatDate = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(new Date(iso));
const differenz = (z: NkAnpassungZeile) => (z.vorschlag === null ? null : z.vorschlag - z.bisher);

const columns: Column<NkAnpassungZeile>[] = [
  {
    key: "einheit",
    label: "Einheit",
    render: (z) => (
      <Link prefetch={false} href={`/mietvertraege/${z.id}`} className="font-medium text-white hover:underline">
        {z.einheitBezeichnung}
      </Link>
    ),
    sortValue: (z) => z.einheitRang,
    searchValue: (z) => z.einheitBezeichnung,
  },
  {
    key: "mieter",
    label: "Mieter",
    render: (z) => <span className="text-neutral-300">{z.mieterNamen}</span>,
    sortValue: (z) => z.mieterNamen,
    searchValue: (z) => z.mieterNamen,
  },
  {
    key: "schreiben",
    label: "Schreiben",
    render: (z) => (
      <>
      <Link
        href={`/mietvertraege/${z.id}/nk-anpassung`}
        prefetch={false}
        className="inline-block whitespace-nowrap rounded-md border border-neutral-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-neutral-800"
      >
        Erstellen
      </Link>
      {z.indexMoeglich && (
        <Link
          href={`/mietvertraege/${z.id}/indexerhoehung?mitNk=1`}
          prefetch={false}
          title="Indexerhöhung ist ebenfalls möglich — ein gemeinsames Schreiben"
          className="mt-1 block whitespace-nowrap text-xs text-neutral-400 underline hover:text-white"
        >
          mit Indexerhöhung
        </Link>
      )}
      </>
    ),
  },
  {
    key: "jahr",
    label: "Abrechnung",
    render: (z) => (
      <span className="text-neutral-300">
        {z.jahr}
        {z.entwurf && <span className="ml-1 text-xs text-amber-400">Entwurf</span>}
      </span>
    ),
    sortValue: (z) => z.jahr,
  },
  {
    key: "kosten",
    label: "Kostenanteil",
    align: "right",
    title: "Kostenanteil des Mieters laut Abrechnung für den Nutzungszeitraum im Abrechnungsjahr; bei unterjähriger Nutzung darunter auf 12 Monate hochgerechnet",
    render: (z) => (
      <span className="text-neutral-300">
        {euro(z.kostenanteil)} €
        {z.hochgerechnet && z.jahreskosten !== null && (
          <span className="block text-xs text-amber-400">(auf 12 Monate: {euro(z.jahreskosten)} €)</span>
        )}
      </span>
    ),
    sortValue: (z) => z.kostenanteil,
  },
  {
    key: "monatlich",
    label: "Kosten / Monat",
    align: "right",
    title: "Jahreskosten ÷ 12, noch ohne Zuschlag und ohne Aufrunden",
    render: (z) => (z.monatlich === null ? leer : <span className="text-neutral-300">{euro(z.monatlich)} €</span>),
    sortValue: (z) => z.monatlich ?? -1,
  },
  {
    key: "bisher",
    label: "Vorauszahlung jetzt",
    align: "right",
    title: "Monatliche NK-Vorauszahlung, die vor dem vorgeschlagenen Gültig-ab-Datum gilt",
    render: (z) => <span className="text-neutral-300">{euro(z.bisher)} €</span>,
    sortValue: (z) => z.bisher,
  },
  {
    key: "vorschlag",
    label: "Vorschlag",
    align: "right",
    title: "Kosten pro Monat plus Standard-Zuschlag, auf volle Euro aufgerundet (Vorschau, nicht gespeichert)",
    render: (z) => (z.vorschlag === null ? <span title="Kein Kostenanteil in der Abrechnung">{leer}</span> : <span className="text-white">{euro(z.vorschlag)} €</span>),
    sortValue: (z) => z.vorschlag ?? -1,
  },
  {
    key: "differenz",
    label: "Änderung / Monat",
    align: "right",
    render: (z) => {
      const d = differenz(z);
      if (d === null) return leer;
      if (Math.abs(d) < 0.005) return <span className="text-neutral-500">unverändert</span>;
      return <span className={d > 0 ? "text-white" : "text-green-400"}>{`${d > 0 ? "+" : "−"}${euro(Math.abs(d))} €`}</span>;
    },
    sortValue: (z) => differenz(z) ?? -9999,
  },
  {
    key: "angepasst",
    label: "Angepasst",
    title: "Nach dem Abrechnungsjahr wurde schon eine Mieterhöhung erfasst",
    render: (z) =>
      z.angepasstAb ? <span className="rounded bg-green-500/10 px-1.5 py-0.5 text-xs text-green-400">ab {formatDate(z.angepasstAb)}</span> : <span className="text-xs text-neutral-500">offen</span>,
    sortValue: (z) => z.angepasstAb ?? "",
  },
];

const selectKlasse =
  "rounded-md border border-neutral-700 bg-neutral-950 px-2.5 py-1.5 text-sm text-white outline-none focus:border-neutral-400";

type Ansicht = "alle" | "offen" | "angepasst";

export function NkAnpassungTabelle({ alle }: { alle: NkAnpassungZeile[] }) {
  // Standard = alle, nichts wird von selbst ausgeblendet; der Filter ist nur eine Ansicht.
  const [ansicht, setAnsicht] = useState<Ansicht>("alle");
  const [nurAenderung, setNurAenderung] = useState(false);

  const rows = useMemo(
    () =>
      alle.filter((z) => {
        if (ansicht === "offen" && z.angepasstAb) return false;
        if (ansicht === "angepasst" && !z.angepasstAb) return false;
        if (nurAenderung) {
          const d = differenz(z);
          if (d === null || Math.abs(d) < 0.005) return false;
        }
        return true;
      }),
    [alle, ansicht, nurAenderung],
  );
  const filterAktiv = ansicht !== "alle" || nurAenderung;

  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-neutral-400">
        <label className="flex items-center gap-2">
          Anpassung
          <select value={ansicht} onChange={(e) => setAnsicht(e.target.value as Ansicht)} className={selectKlasse}>
            <option value="alle">alle</option>
            <option value="offen">noch offen</option>
            <option value="angepasst">schon angepasst</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={nurAenderung} onChange={(e) => setNurAenderung(e.target.checked)} />
          nur mit Änderung
        </label>
        {filterAktiv && (
          <span className="text-xs text-neutral-500">
            {rows.length} von {alle.length} Verträgen
          </span>
        )}
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage={filterAktiv ? "Kein Vertrag erfüllt die Filter." : "Keine aktiven Mietverträge mit Nebenkostenabrechnung."}
        defaultSort={{ key: "einheit" }}
        renderFooter={(sichtbar) => {
          const mitVorschlag = sichtbar.filter((z): z is NkAnpassungZeile & { vorschlag: number } => z.vorschlag !== null);
          const monat = mitVorschlag.reduce((s, z) => s + (z.monatlich ?? 0), 0);
          const jetzt = mitVorschlag.reduce((s, z) => s + z.bisher, 0);
          const neu = mitVorschlag.reduce((s, z) => s + z.vorschlag, 0);
          const d = neu - jetzt;
          const td = "px-4 py-2 text-right font-medium";
          return (
            <tr className="border-t border-neutral-800">
              <td colSpan={5} className="px-4 py-2 font-medium text-white">
                Summe <span className="text-xs font-normal text-neutral-500">({mitVorschlag.length} Verträge mit Vorschlag)</span>
              </td>
              <td className={`${td} text-neutral-300`}>{euro(monat)} €</td>
              <td className={`${td} text-neutral-300`}>{euro(jetzt)} €</td>
              <td className={`${td} text-white`}>{euro(neu)} €</td>
              <td className={`${td} text-white`}>
                {d >= 0 ? "+" : "−"}
                {euro(Math.abs(d))} €
              </td>
              <td />
            </tr>
          );
        }}
      />
    </>
  );
}
