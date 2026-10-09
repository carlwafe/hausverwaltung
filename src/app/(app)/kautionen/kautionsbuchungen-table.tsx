"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { DataTable, type Column } from "@/components/data-table";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import {
  aktualisiereKautionsbuchungKategorie,
  deleteKautionsbuchungen,
  aendereKautionEinbehaltStatus,
  loescheKautionEinbehalt,
  setzeKautionEinbehaltPauschal,
  type KautionEinbehaltStatus,
} from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type KautionBuchungKategorie =
  | "EINZAHLUNG_MIETER"
  | "ANLAGE"
  | "AUFLOESUNG"
  | "AUSZAHLUNG_MIETER"
  | "SONSTIGES"
  | "VIRTUELLE_AUSZAHLUNG"
  // Kein eigener Buchungstyp im Katalog: eine Zeile mit kategorie EINBEHALT stammt aus einem
  // KautionEinbehalt-Datensatz (Streit-Status-Workflow), der bei UNSTRITTIG/STRITTIG_BESTAETIGT
  // selbst die KAUTION_EINBEHALT-Journalbuchung erzeugt.
  | "EINBEHALT";

const EINBEHALT_STATUS_LABEL: Record<KautionEinbehaltStatus, string> = {
  UNSTRITTIG: "Unstrittig",
  STRITTIG_OFFEN: "Strittig — offen",
  STRITTIG_BESTAETIGT: "Strittig — bestätigt",
  STRITTIG_VERWORFEN: "Strittig — verworfen",
};

const KATEGORIE_LABEL: Record<KautionBuchungKategorie, string> = {
  EINZAHLUNG_MIETER: "Einzahlung Mieter",
  ANLAGE: "Anlage (aufs Kautionskonto)",
  AUFLOESUNG: "Auflösung (vom Kautionskonto)",
  AUSZAHLUNG_MIETER: "Auszahlung Mieter",
  SONSTIGES: "Sonstiges (z.B. Korrektur)",
  VIRTUELLE_AUSZAHLUNG: "Verrechnung mit Rechnung",
  EINBEHALT: "Einbehalt",
};

// Kategorien, die als Ziel der Kategorie-Änderung einer normalen Buchung angeboten werden — ein
// Einbehalt entsteht nur über das Erfassen-Formular, nicht durch Umstellen einer Buchung.
type UmstellbareKategorie = Exclude<KautionBuchungKategorie, "EINBEHALT">;
const UMSTELLBARE_KATEGORIEN = (Object.keys(KATEGORIE_LABEL) as KautionBuchungKategorie[]).filter(
  (k): k is UmstellbareKategorie => k !== "EINBEHALT",
);

export type KautionsbuchungRow = {
  id: string;
  mietvertragId: string | null;
  einheitBezeichnung: string | null;
  mieterNamen: string | null;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
  kategorie: KautionBuchungKategorie;
  aufteilungGruppeId: string | null;
  // Kostenpositionen, deren virtuelle Gutschrift auf diese Buchung verweist (nur bei
  // kategorie === "VIRTUELLE_AUSZAHLUNG" relevant).
  verknuepfteKostenpositionen: { id: string; label: string }[];
  // Nur bei kategorie === "EINBEHALT" gesetzt; id der Zeile ist dann die KautionEinbehalt-id.
  einbehalt: {
    status: KautionEinbehaltStatus;
    // Abrechnungsjahr der Nebenkostenabrechnung, mit der der Einbehalt verrechnet wurde.
    nkJahr: number | null;
    // Mit einer Forderung aus dem Mieterkonto (Mietrückstand, Gebühren) verrechnet.
    mieterkonto: boolean;
    // Zurückbehaltungsrecht: nur unstrittige/bestätigte Einbehalte erzeugen eine echte Buchung.
    gebucht: boolean;
    // Pauschal dem Vermieter gutgeschrieben (endgültig) statt vorläufig bis zur Rechnung.
    pauschal: boolean;
  } | null;
};

function KategorieZelle({ k }: { k: KautionsbuchungRow }) {
  const [pending, startTransition] = useTransition();
  if (k.einbehalt) {
    const { status, nkJahr, gebucht, pauschal, mieterkonto } = k.einbehalt;
    if (mieterkonto) {
      return (
        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">Verrechnung mit Mieterkonto</span>
      );
    }
    // Verrechnung mit einer NK-Abrechnung: ein unstrittiger Einbehalt mit Abrechnungsjahr — hat
    // keinen Streit-Status, den man hier umstellen müsste.
    if (nkJahr) {
      return (
        <span className="rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">
          Verrechnung mit NK-Abrechnung {nkJahr}
        </span>
      );
    }
    const artSelect = (
      <select
        value={pauschal ? "pauschal" : "vorlaeufig"}
        disabled={pending}
        onChange={(e) => startTransition(() => setzeKautionEinbehaltPauschal(k.id, e.target.value === "pauschal"))}
        title="Vorläufig: wartet auf eine Rechnung (dann stornieren und als Verrechnung mit Rechnung anlegen). Pauschal: dem Vermieter endgültig gutgeschrieben."
        className="rounded-md border border-neutral-700 bg-transparent px-1.5 py-1 text-xs text-white outline-none focus:border-neutral-400 disabled:opacity-50"
      >
        <option value="vorlaeufig" className="bg-neutral-900 text-white">
          vorläufig
        </option>
        <option value="pauschal" className="bg-neutral-900 text-white">
          pauschal gutgeschrieben
        </option>
      </select>
    );
    if (pauschal) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">Einbehalt</span>
          {artSelect}
        </div>
      );
    }
    return (
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs text-amber-400">Einbehalt</span>
        {artSelect}
        <select
          value={status}
          disabled={pending}
          onChange={(e) =>
            startTransition(() => aendereKautionEinbehaltStatus(k.id, e.target.value as KautionEinbehaltStatus))
          }
          className="rounded-md border border-neutral-700 bg-transparent px-1.5 py-1 text-xs text-white outline-none focus:border-neutral-400 disabled:opacity-50"
        >
          {(Object.keys(EINBEHALT_STATUS_LABEL) as KautionEinbehaltStatus[]).map((st) => (
            <option key={st} value={st} className="bg-neutral-900 text-white">
              {EINBEHALT_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
        {!gebucht && (
          <span
            title="Zurückbehaltungsrecht: solange der Einbehalt nicht unstrittig/bestätigt ist, gibt es keine Buchung auf dem Kautionskonto"
            className="rounded-full bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400"
          >
            ohne Buchung
          </span>
        )}
      </div>
    );
  }
  return (
    <select
      value={k.kategorie}
      disabled={pending}
      onChange={(e) =>
        startTransition(() =>
          aktualisiereKautionsbuchungKategorie(k.id, e.target.value as UmstellbareKategorie),
        )
      }
      className="rounded-md border border-neutral-700 bg-transparent px-1.5 py-1 text-xs text-white outline-none focus:border-neutral-400 disabled:opacity-50"
    >
      {UMSTELLBARE_KATEGORIEN.map((kat) => (
        <option key={kat} value={kat} className="bg-neutral-900 text-white">
          {KATEGORIE_LABEL[kat]}
        </option>
      ))}
    </select>
  );
}

function kategorieText(k: KautionsbuchungRow) {
  if (k.einbehalt?.nkJahr) return `Verrechnung mit NK-Abrechnung ${k.einbehalt.nkJahr}`;
  if (k.einbehalt?.mieterkonto) return "Verrechnung mit Mieterkonto";
  if (k.einbehalt) return k.einbehalt.pauschal ? "Einbehalt pauschal gutgeschrieben" : "Einbehalt vorläufig";
  return KATEGORIE_LABEL[k.kategorie];
}

const columns: Column<KautionsbuchungRow>[] = [
  {
    key: "datum",
    label: "Datum",
    sortValue: (k) => k.datum,
    render: (k) => formatDate(k.datum),
  },
  {
    key: "betrag",
    label: "Betrag",
    sortValue: (k) => k.betrag,
    className: "whitespace-nowrap",
    render: (k) => (
      <span>
        {k.einbehalt ? (
          formatEuro(k.betrag)
        ) : (
          <Link prefetch={false} href={`/kautionen/buchung/${k.id}`} className="font-medium hover:underline">
            {formatEuro(k.betrag)}
          </Link>
        )}
        {k.aufteilungGruppeId && (
          <span
            title="Teil einer aufgeteilten Zahlung"
            className="ml-1.5 inline-block rounded-full bg-blue-500/10 px-1.5 text-xs text-blue-400"
          >
            ✂
          </span>
        )}
      </span>
    ),
  },
  {
    key: "mietvertrag",
    label: "Mietvertrag",
    sortValue: (k) => k.mieterNamen ?? "",
    searchValue: (k) => k.mieterNamen ?? "",
    render: (k) =>
      k.mietvertragId ? (
        <Link prefetch={false} href={`/mietvertraege/${k.mietvertragId}`} className="hover:underline">
          {k.einheitBezeichnung} — {k.mieterNamen}
        </Link>
      ) : (
        <span className="text-neutral-500">nicht zugeordnet</span>
      ),
  },
  {
    key: "verwendungszweck",
    label: "Verwendungszweck",
    sortValue: (k) => k.verwendungszweck ?? "",
    searchValue: (k) => k.verwendungszweck ?? "",
    render: (k) => k.verwendungszweck || "–",
  },
  {
    key: "kategorie",
    label: "Kategorie",
    sortValue: kategorieText,
    searchValue: kategorieText,
    render: (k) => (
      <div className="flex items-center gap-1.5">
        <KategorieZelle k={k} />
        {k.verknuepfteKostenpositionen.map((kp) => (
          <Link
            key={kp.id}
            href={`/kosten/${kp.id}`}
            className="text-xs text-neutral-500 hover:text-white hover:underline"
            title={kp.label}
          >
            → Kosten
          </Link>
        ))}
      </div>
    ),
  },
  {
    key: "quelle",
    label: "Quelle",
    render: (k, { expanded, toggleExpanded }) =>
      k.rohdaten ? (
        <RohdatenToggleButton expanded={expanded} onClick={toggleExpanded} />
      ) : (
        <span className="text-xs text-neutral-600">manuell</span>
      ),
  },
];

export function KautionsbuchungenTable({ rows }: { rows: KautionsbuchungRow[] }) {
  const [ausgewaehlt, setAusgewaehlt] = useState<KautionsbuchungRow[]>([]);
  const [pending, startTransition] = useTransition();

  function loeschen() {
    if (ausgewaehlt.length === 0) return;
    if (!confirm(`${ausgewaehlt.length} Buchung(en) wirklich unwiderruflich löschen?`)) return;
    startTransition(async () => {
      const buchungen = ausgewaehlt.filter((r) => !r.einbehalt);
      if (buchungen.length > 0) await deleteKautionsbuchungen(buchungen.map((r) => r.id));
      for (const r of ausgewaehlt.filter((r) => r.einbehalt)) await loescheKautionEinbehalt(r.id);
      setAusgewaehlt([]);
    });
  }

  return (
    <div>
      {ausgewaehlt.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2">
          <span className="text-sm text-neutral-300">{ausgewaehlt.length} ausgewählt</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={loeschen}
              disabled={pending}
              className="rounded-md border border-red-900 px-3 py-1.5 text-sm font-medium text-red-400 hover:bg-red-950 disabled:opacity-50"
            >
              {pending ? "Lösche…" : "Ausgewählte löschen"}
            </button>
          </div>
        </div>
      )}
      <DataTable
        columns={columns}
        rows={rows}
        emptyMessage="Noch keine Kautionsbuchungen aus Kontoauszug importiert."
        searchPlaceholder="Kautionsbuchungen durchsuchen…"
        selectable
        onSelectionChange={setAusgewaehlt}
        rowId={(k) => `kautionsbuchung-${k.id}`}
        renderExpanded={(k, colSpan) =>
          k.rohdaten ? (
            <RohdatenZeile
              rohdaten={k.rohdaten}
              colSpan={colSpan}
              downloadHref={k.importBatchId ? `/api/import-batches/${k.importBatchId}/download` : undefined}
              downloadLabel={`Originaldatei herunterladen${k.importDateiname ? ` (${k.importDateiname})` : ""}`}
            />
          ) : null
        }
      />
    </div>
  );
}
