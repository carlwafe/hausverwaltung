"use client";

import { DeleteButton } from "@/components/delete-button";
import {
  aendereKautionEinbehaltStatus,
  loescheKautionEinbehalt,
  type KautionEinbehaltStatus,
} from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

const STATUS_LABEL: Record<KautionEinbehaltStatus, string> = {
  UNSTRITTIG: "Unstrittig",
  STRITTIG_OFFEN: "Strittig — offen",
  STRITTIG_BESTAETIGT: "Strittig — bestätigt",
  STRITTIG_VERWORFEN: "Strittig — verworfen",
};

const STATUS_FARBE: Record<KautionEinbehaltStatus, string> = {
  UNSTRITTIG: "bg-green-500/10 text-green-400",
  STRITTIG_OFFEN: "bg-amber-500/10 text-amber-400",
  STRITTIG_BESTAETIGT: "bg-green-500/10 text-green-400",
  STRITTIG_VERWORFEN: "bg-neutral-800 text-neutral-400",
};

export type KautionEinbehaltRow = {
  id: string;
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  positionText: string;
  betrag: number;
  status: KautionEinbehaltStatus;
  erstelltAm: string;
  // Abrechnungsjahr der Nebenkostenabrechnung, mit der dieser Einbehalt verrechnet wurde.
  nkJahr: number | null;
  // Zurückbehaltungsrecht: nur unstrittige/bestätigte Einbehalte erzeugen eine echte
  // KAUTION_EINBEHALT-Buchung (siehe synchronisiereKautionEinbehaltBuchung in actions.ts) — ein
  // strittig offener/verworfener Einbehalt bleibt ohne Kontowirkung.
  gebucht: boolean;
};

function EinbehaltZeile({ zeile }: { zeile: KautionEinbehaltRow }) {
  return (
    <tr className="border-t border-neutral-800">
      <td className="px-3 py-1.5 text-white">
        {zeile.einheitBezeichnung} – {zeile.mieterNamen}
      </td>
      <td className="px-3 py-1.5 text-neutral-300">
        {zeile.positionText}
        {zeile.nkJahr && (
          <span className="ml-1.5 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs text-sky-400">
            verrechnet mit NK-Abrechnung {zeile.nkJahr}
          </span>
        )}
      </td>
      <td className="px-3 py-1.5 text-white">{formatEuro(zeile.betrag)}</td>
      <td className="px-3 py-1.5 text-neutral-400">{formatDate(zeile.erstelltAm)}</td>
      <td className="px-3 py-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_FARBE[zeile.status]}`}>
          {STATUS_LABEL[zeile.status]}
        </span>
        {zeile.gebucht && (
          <span
            title="Für diesen Einbehalt existiert eine Buchung im Journal (Kontokreis Kautionskonto)"
            className="ml-1.5 rounded-full bg-purple-500/10 px-2 py-0.5 text-xs text-purple-400"
          >
            gebucht
          </span>
        )}
      </td>
      <td className="px-3 py-1.5">
        <div className="flex flex-wrap items-center gap-1">
          {(Object.keys(STATUS_LABEL) as KautionEinbehaltStatus[])
            .filter((s) => s !== zeile.status)
            .map((s) => (
              <form key={s} action={aendereKautionEinbehaltStatus.bind(null, zeile.id, s)}>
                <button
                  type="submit"
                  className="rounded-md border border-neutral-700 px-2 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  → {STATUS_LABEL[s]}
                </button>
              </form>
            ))}
          <DeleteButton
            action={loescheKautionEinbehalt.bind(null, zeile.id)}
            confirmText="Diesen Einbehalt wirklich löschen?"
            size="sm"
          />
        </div>
      </td>
    </tr>
  );
}

/**
 * Einzelne, begründete Einbehalte bei Auflösung der Kaution mit Streit-Status-Workflow — löst das
 * Problem, dass "Einbehalten" bisher nur eine unerklärte Zahlen-Differenz (Auflösung ./.
 * Auszahlung) war. Solange ein Einbehalt STRITTIG_OFFEN ist, zählt er bewusst NICHT in die
 * "bestätigt einbehalten"-Summe oben auf der Seite (Zurückbehaltungsrecht).
 */
export function EinbehaltSektion({
  rows,
}: {
  rows: KautionEinbehaltRow[];
}) {
  return (
    <div className="mt-10">
      <h2 className="mb-1 text-lg font-medium text-white">Kaution-Einbehalte ({rows.length})</h2>
      <p className="mb-4 text-sm text-neutral-400">
        Begründete Einzelposten für einen einbehaltenen Kautionsanteil, mit Streit-Status —
        solange ein Einbehalt &bdquo;strittig, offen&ldquo; ist, gilt das Zurückbehaltungsrecht:
        er zählt nicht als endgültig einbehalten. Neue Einbehalte werden oben über
        &bdquo;Kautionsbuchung manuell hinzufügen…&ldquo; (Kategorie &bdquo;Einbehalt&ldquo;) erfasst.
      </p>

      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">Mietvertrag</th>
              <th className="px-3 py-2">Begründung</th>
              <th className="px-3 py-2">Betrag</th>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((z) => (
              <EinbehaltZeile key={z.id} zeile={z} />
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-neutral-500">
                  Noch keine Einbehalte erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
