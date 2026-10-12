"use client";

import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { ANLAGE_V_ZEILE_KURZ, anlageVZeileFuer, type AnlageVZeile } from "@/lib/anlage-v";

const VERTEILERSCHLUESSEL_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
  PERSONENZAHL: "Personenzahl",
  EINHEITEN: "Anzahl Einheiten",
  VERBRAUCH_MANUELL: "Verbrauch (manuell)",
  VORVERTEILT: "Extern vorverteilt",
  IN_ABRECHNUNG_ENTHALTEN: "In Techem-Abrechnung enthalten",
};

export type KostenartRow = {
  id: string;
  name: string;
  umlagefaehig: boolean;
  standardVerteilerschluessel: string | null;
  betrKvNummer: number | null;
  istSonstigeBetriebskosten: boolean;
  vertraglicheGrundlage: string | null;
  anzahlPositionen: number;
  anlageVZeile: AnlageVZeile | null;
};

const columns: Column<KostenartRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (k) => k.name,
    searchValue: (k) => k.name,
    render: (k) => (
      <Link prefetch={false} href={`/kostenarten/${k.id}`} className="font-medium hover:underline">
        {k.name}
      </Link>
    ),
  },
  {
    key: "umlagefaehig",
    label: "Umlagefähig",
    sortValue: (k) => (k.umlagefaehig ? 1 : 0),
    render: (k) =>
      k.umlagefaehig ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Ja</span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-300">Nein</span>
      ),
  },
  {
    key: "verteilerschluessel",
    label: "Standard-Verteilerschlüssel",
    sortValue: (k) => (k.standardVerteilerschluessel ? VERTEILERSCHLUESSEL_LABEL[k.standardVerteilerschluessel] : ""),
    render: (k) =>
      k.standardVerteilerschluessel ? VERTEILERSCHLUESSEL_LABEL[k.standardVerteilerschluessel] : "–",
  },
  {
    key: "positionen",
    label: "Kostenpositionen",
    sortValue: (k) => k.anzahlPositionen,
    render: (k) => k.anzahlPositionen,
  },
  {
    key: "anlageV",
    label: "Anlage V",
    sortValue: (k) => ANLAGE_V_ZEILE_KURZ[anlageVZeileFuer(k).zeile],
    render: (k) => {
      const { zeile, automatisch } = anlageVZeileFuer(k);
      return (
        <span
          className={automatisch ? "text-neutral-500" : ""}
          title={automatisch ? "Automatischer Vorschlag — im Formular festlegen" : "Festgelegt"}
        >
          {ANLAGE_V_ZEILE_KURZ[zeile]}
          {automatisch && " (auto)"}
        </span>
      );
    },
  },
  {
    key: "betrKv",
    label: "BetrKV-Nr.",
    sortValue: (k) => k.betrKvNummer ?? (k.istSonstigeBetriebskosten ? 17 : 0),
    render: (k) => {
      if (k.istSonstigeBetriebskosten) {
        const fehlendeGrundlage = k.umlagefaehig && !k.vertraglicheGrundlage?.trim();
        return fehlendeGrundlage ? (
          <span
            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400"
            title="Vertragliche Grundlage fehlt — Umlage dieser Position ist rechtlich angreifbar"
          >
            17 — Nachweis fehlt
          </span>
        ) : (
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">17 — belegt</span>
        );
      }
      return k.betrKvNummer ?? "–";
    },
  },
];

export function KostenartenTable({ rows }: { rows: KostenartRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kostenarten angelegt."
      searchPlaceholder="Kostenarten durchsuchen…"
    />
  );
}
