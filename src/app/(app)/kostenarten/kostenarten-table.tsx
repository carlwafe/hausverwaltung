"use client";

import Link from "next/link";
import { DataTable, TABELLEN_LINK, type Column } from "@/components/data-table";
import { KOSTENGRUPPE_LABEL, kostengruppeFuer, type AnlageVZeile } from "@/lib/anlage-v";
import { KARTE_KENNZEICHEN, KarteKopf, KarteMeta, KarteNotiz } from "@/components/karte";

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
      <Link prefetch={false} href={`/kostenarten/${k.id}`} className={TABELLEN_LINK}>
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
    label: "Steuerlich",
    sortValue: (k) => KOSTENGRUPPE_LABEL[kostengruppeFuer(k).gruppe],
    render: (k) => {
      const { gruppe, automatisch } = kostengruppeFuer(k);
      return (
        <span
          className={automatisch ? "text-neutral-500" : ""}
          title={automatisch ? "Automatischer Vorschlag — im Formular festlegen" : "Festgelegt"}
        >
          {KOSTENGRUPPE_LABEL[gruppe]}
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

// Karte fürs Handy (siehe `mobileCard` an DataTable). „umlagefähig“ erscheint nur, wenn es zutrifft.
function KostenartKarte({ k }: { k: KostenartRow }) {
  const { gruppe, automatisch } = kostengruppeFuer(k);
  const nachweisFehlt = k.istSonstigeBetriebskosten && k.umlagefaehig && !k.vertraglicheGrundlage?.trim();
  return (
    <>
      <KarteKopf titel={k.name} wert={`${k.anzahlPositionen} Pos.`} wertKlasse="text-neutral-300" />
      <KarteMeta>
        {k.umlagefaehig && <span className={`${KARTE_KENNZEICHEN} bg-green-500/10 text-green-400`}>umlagefähig</span>}
        {k.standardVerteilerschluessel && <span>{VERTEILERSCHLUESSEL_LABEL[k.standardVerteilerschluessel]}</span>}
        {k.istSonstigeBetriebskosten ? (
          <span className={`${KARTE_KENNZEICHEN} ${nachweisFehlt ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"}`}>
            BetrKV 17 — {nachweisFehlt ? "Nachweis fehlt" : "belegt"}
          </span>
        ) : (
          k.betrKvNummer && <span>BetrKV {k.betrKvNummer}</span>
        )}
      </KarteMeta>
      <KarteNotiz>
        Steuerlich: {KOSTENGRUPPE_LABEL[gruppe]}
        {automatisch && " (auto)"}
      </KarteNotiz>
    </>
  );
}

export function KostenartenTable({ rows }: { rows: KostenartRow[] }) {
  return (
    <DataTable
      rowHref={(k) => `/kostenarten/${k.id}`}
      mobileCard={(k) => <KostenartKarte k={k} />}
      columns={columns}
      rows={rows}
      emptyMessage="Noch keine Kostenarten angelegt."
      searchPlaceholder="Kostenarten durchsuchen…"
    />
  );
}
