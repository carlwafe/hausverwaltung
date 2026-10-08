"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { DataTable, type Column } from "@/components/data-table";
import { setzeVerwaltungswechsel } from "./actions";

export type DienstleisterRow = {
  id: string;
  name: string;
  beschreibung: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  // Nur für die Suche, nicht als Spalte sichtbar.
  suchbegriffe: string;
  kostenarten: string;
  adresse: string;
  aktiv: boolean;
  // Verwaltungswechsel: Datum (yyyy-mm-dd) oder "" = noch offen.
  informiertAm: string;
  gekuendigtAm: string;
};

function datumDe(iso: string) {
  const [j, m, t] = iso.split("-");
  return `${t}.${m}.${j}`;
}

// Kennzeichen zum Anklicken: grün mit Datum = erledigt, grau gestrichelt = offen. Klick setzt auf heute
// bzw. nimmt die Markierung zurück; ein genaues Datum lässt sich im Formular des Eintrags ändern.
function WechselKennzeichen({
  id,
  feld,
  datum,
  erledigtText,
  offenText,
}: {
  id: string;
  feld: "verwaltungInformiertAm" | "vertragGekuendigtAm";
  datum: string;
  erledigtText: string;
  offenText: string;
}) {
  const [pending, start] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const erledigt = datum !== "";
  return (
    <span className="block">
      <button
        type="button"
        disabled={pending}
        title={erledigt ? "Klicken, um die Markierung zurückzunehmen" : "Klicken, um als erledigt (heute) zu markieren"}
        onClick={() =>
          start(async () => {
            setFehler((await setzeVerwaltungswechsel(id, feld, !erledigt)) || null);
          })
        }
        className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs disabled:opacity-50 ${
          erledigt
            ? "bg-green-500/10 text-green-400 hover:bg-green-500/20"
            : "border border-dashed border-neutral-600 text-neutral-400 hover:border-neutral-400 hover:text-neutral-200"
        }`}
      >
        {erledigt ? `✓ ${erledigtText} ${datumDe(datum)}` : offenText}
      </button>
      {fehler && <span className="mt-1 block text-xs text-red-400">{fehler}</span>}
    </span>
  );
}

const columns: Column<DienstleisterRow>[] = [
  {
    key: "name",
    label: "Name",
    sortValue: (d) => d.name,
    searchValue: (d) => `${d.name} ${d.suchbegriffe} ${d.kostenarten} ${d.adresse}`,
    render: (d) => (
      <Link prefetch={false} href={`/dienstleister/${d.id}`} className="font-medium hover:underline">
        {d.name}
      </Link>
    ),
  },
  {
    key: "beschreibung",
    label: "Beschreibung",
    sortValue: (d) => d.beschreibung,
    searchValue: (d) => d.beschreibung,
    render: (d) => d.beschreibung || "–",
  },
  {
    key: "ansprechpartner",
    label: "Ansprechpartner",
    sortValue: (d) => d.ansprechpartner,
    searchValue: (d) => d.ansprechpartner,
    render: (d) => d.ansprechpartner || "–",
  },
  {
    key: "telefon",
    label: "Telefon",
    sortValue: (d) => d.telefon,
    searchValue: (d) => d.telefon,
    render: (d) =>
      d.telefon ? (
        <a href={`tel:${d.telefon.replace(/[^\d+]/g, "")}`} className="whitespace-nowrap hover:underline">
          {d.telefon}
        </a>
      ) : (
        "–"
      ),
  },
  {
    key: "email",
    label: "E-Mail",
    sortValue: (d) => d.email,
    searchValue: (d) => d.email,
    render: (d) =>
      d.email ? (
        <a href={`mailto:${d.email}`} className="hover:underline">
          {d.email}
        </a>
      ) : (
        "–"
      ),
  },
  {
    key: "wechsel",
    label: "Verwaltungswechsel",
    // Offene zuerst: 0 = nichts erledigt, 1 = eines, 2 = beides.
    sortValue: (d) => (d.informiertAm ? 1 : 0) + (d.gekuendigtAm ? 1 : 0),
    render: (d) => (
      <div className="space-y-1">
        <WechselKennzeichen
          id={d.id}
          feld="verwaltungInformiertAm"
          datum={d.informiertAm}
          erledigtText="Informiert"
          offenText="Nicht informiert"
        />
        <WechselKennzeichen
          id={d.id}
          feld="vertragGekuendigtAm"
          datum={d.gekuendigtAm}
          erledigtText="Gekündigt"
          offenText="Nicht gekündigt"
        />
      </div>
    ),
  },
  {
    key: "aktiv",
    label: "Status",
    sortValue: (d) => (d.aktiv ? 0 : 1),
    render: (d) =>
      d.aktiv ? (
        <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Aktiv</span>
      ) : (
        <span className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">Inaktiv</span>
      ),
  },
];

export function DienstleisterTable({ rows }: { rows: DienstleisterRow[] }) {
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowClassName={(d) => (d.aktiv ? "" : "bg-neutral-900/60 text-neutral-500")}
      emptyMessage="Noch nichts angelegt."
      searchPlaceholder="Name, Beschreibung, Telefon … durchsuchen"
    />
  );
}
