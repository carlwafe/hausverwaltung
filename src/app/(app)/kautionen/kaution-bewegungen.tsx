"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { RohdatenNachladenZeile, RohdatenToggleButton } from "@/components/rohdaten-inline";
import type { KautionBewegungZeile, KautionEinbehaltStatusWert, KautionUebersichtZeile } from "@/lib/kautionen-uebersicht";
import { aendereKautionEinbehaltStatus, loescheKautionEinbehalt, setzeKautionEinbehaltPauschal } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}
function formatDatum(iso: string) {
  return new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));
}

const EINBEHALT_STATUS_LABEL: Record<KautionEinbehaltStatusWert, string> = {
  UNSTRITTIG: "Unstrittig",
  STRITTIG_OFFEN: "Strittig — offen",
  STRITTIG_BESTAETIGT: "Strittig — bestätigt",
  STRITTIG_VERWORFEN: "Strittig — verworfen",
};

const ZEILEN_FARBE: Record<KautionBewegungZeile["art"], string> = {
  einzahlung: "",
  umbuchung: "text-neutral-500",
  auszahlung: "",
  sonstiges: "",
  einbehalt: "",
  einbehalt_offen: "bg-amber-500/10",
  einbehalt_verworfen: "text-neutral-500 line-through",
};

const AUSWAHL =
  "rounded-md border border-neutral-700 bg-transparent px-1.5 py-1 text-xs text-white outline-none focus:border-neutral-400 disabled:opacity-50";

// Schalter eines Einbehalts (er hat keine eigene Detailseite): vorläufig/pauschal, Streit-Status, löschen.
// Verrechnungen mit BK-Abrechnung oder Mieterkonto haben keinen Streit-Status, nur „Löschen“.
function EinbehaltSchalter({ id, einbehalt }: { id: string; einbehalt: NonNullable<KautionBewegungZeile["einbehalt"]> }) {
  const [pending, startTransition] = useTransition();
  const verrechnung = einbehalt.nkJahr !== null || einbehalt.mieterkonto;

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {!verrechnung && (
        <select
          value={einbehalt.pauschal ? "pauschal" : "vorlaeufig"}
          disabled={pending}
          onChange={(e) => startTransition(() => setzeKautionEinbehaltPauschal(id, e.target.value === "pauschal"))}
          title="Vorläufig: wartet auf eine Rechnung (dann löschen und als Verrechnung mit Rechnung anlegen). Pauschal: dem Vermieter endgültig gutgeschrieben."
          aria-label="Art des Einbehalts"
          className={AUSWAHL}
        >
          <option value="vorlaeufig" className="bg-neutral-900 text-white">
            vorläufig
          </option>
          <option value="pauschal" className="bg-neutral-900 text-white">
            pauschal gutgeschrieben
          </option>
        </select>
      )}
      {!verrechnung && !einbehalt.pauschal && (
        <select
          value={einbehalt.status}
          disabled={pending}
          onChange={(e) => startTransition(() => aendereKautionEinbehaltStatus(id, e.target.value as KautionEinbehaltStatusWert))}
          aria-label="Streit-Status des Einbehalts"
          className={AUSWAHL}
        >
          {(Object.keys(EINBEHALT_STATUS_LABEL) as KautionEinbehaltStatusWert[]).map((st) => (
            <option key={st} value={st} className="bg-neutral-900 text-white">
              {EINBEHALT_STATUS_LABEL[st]}
            </option>
          ))}
        </select>
      )}
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          if (!confirm(verrechnung ? "Verrechnung wirklich löschen?" : "Einbehalt wirklich löschen?")) return;
          startTransition(() => loescheKautionEinbehalt(id));
        }}
        className="rounded-md border border-neutral-800 px-2 py-1 text-xs text-red-400 hover:bg-red-950 disabled:opacity-50"
      >
        Löschen
      </button>
    </div>
  );
}

/**
 * Aufgeklappte Kaution: alle Bewegungen mit laufendem Kautionsguthaben (wie das Kautionskonto am Mietvertrag).
 * Buchungen führen zu ihrer Detailseite (Kategorie ändern, aufteilen, stornieren) und zeigen auf Wunsch die
 * Bankzeile; Einbehalte werden direkt hier umgestellt.
 */
export function KautionBewegungen({
  zeile,
  onBuchungErfassen,
}: {
  zeile: KautionUebersichtZeile;
  onBuchungErfassen: () => void;
}) {
  const [rohdatenId, setRohdatenId] = useState<string | null>(null);
  const hinweise = [zeile.warnung, zeile.abweichung].filter((t): t is string => !!t);

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-950">
      {hinweise.map((t) => (
        <p key={t} className="border-b border-neutral-800 px-3 py-2 text-xs text-amber-400">
          ⚠ {t}
        </p>
      ))}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[40rem] table-fixed text-sm">
          <thead className="text-left text-xs text-neutral-400">
            <tr>
              <th className="w-28 px-3 py-2 font-normal">Datum</th>
              <th className="px-3 py-2 font-normal">Vorgang</th>
              <th className="w-28 px-3 py-2 text-right font-normal">Betrag</th>
              <th className="w-28 px-3 py-2 text-right font-normal" title="Kautionsguthaben des Mieters nach der Bewegung">
                Guthaben
              </th>
              <th className="w-20 px-3 py-2" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {zeile.zeilen.map((z) => (
              <Fragment key={z.id}>
                <tr className={`border-t border-neutral-800 align-top ${ZEILEN_FARBE[z.art]}`}>
                  <td className="whitespace-nowrap px-3 py-2 text-neutral-300">{z.datum ? formatDatum(z.datum) : "–"}</td>
                  <td className="px-3 py-2">
                    <div className="text-white">{z.vorgang}</div>
                    {z.bemerkung && (
                      <div title={z.bemerkung} className="truncate text-xs text-neutral-500">
                        {z.bemerkung}
                      </div>
                    )}
                    {z.einbehalt && <EinbehaltSchalter id={z.id} einbehalt={z.einbehalt} />}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-300">
                    {z.buchungsbetrag !== null ? formatEuro(z.buchungsbetrag) : ""}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white">{formatEuro(z.stand)}</td>
                  <td className="px-3 py-1.5">
                    <div className="flex items-center justify-end gap-1">
                      {z.hatRohdaten && (
                        <RohdatenToggleButton
                          symbol
                          expanded={rohdatenId === z.id}
                          onClick={() => setRohdatenId((id) => (id === z.id ? null : z.id))}
                        />
                      )}
                      {z.buchung && (
                        <Link
                          prefetch={false}
                          href={`/kautionen/buchung/${z.id}`}
                          title="Buchung öffnen (Kategorie ändern, aufteilen, stornieren)"
                          aria-label="Buchung öffnen"
                          className="flex h-7 w-7 items-center justify-center rounded-md text-lg leading-none text-neutral-400 hover:bg-neutral-800 hover:text-white"
                        >
                          ›
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
                {rohdatenId === z.id && (
                  <RohdatenNachladenZeile
                    buchungId={z.id}
                    colSpan={5}
                    downloadHref={z.importBatchId ? `/api/import-batches/${z.importBatchId}/download` : undefined}
                    downloadLabel={`Originaldatei herunterladen${z.importDateiname ? ` (${z.importDateiname})` : ""}`}
                  />
                )}
              </Fragment>
            ))}
            {zeile.zeilen.length === 0 && (
              <tr className="border-t border-neutral-800">
                <td colSpan={5} className="px-3 py-4 text-center text-neutral-500">
                  Keine Kautionsbewegungen gebucht.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-neutral-800 px-3 py-2.5">
        <button
          type="button"
          onClick={onBuchungErfassen}
          className="h-10 rounded-md border border-neutral-700 px-3 text-sm text-white hover:bg-neutral-800"
        >
          + Buchung zu dieser Kaution
        </button>
        <span className="text-xs text-neutral-500">
          Guthaben {formatEuro(zeile.stand)}
          {/* Ort des Geldes nur, wenn die Einzahlung gebucht ist — vor Buchhaltungsbeginn fehlt die Anlage im Journal. */}
          {zeile.liegtAuf && zeile.erhaltenAm && ` · liegt laut Buchungen auf ${zeile.liegtAuf}`}
        </span>
        <Link
          prefetch={false}
          href={`/mietvertraege/${zeile.mietvertragId}?reiter=kaution`}
          className="ml-auto text-sm text-neutral-400 hover:text-white hover:underline"
        >
          Kautionsabrechnung im Mietvertrag →
        </Link>
      </div>
    </div>
  );
}
