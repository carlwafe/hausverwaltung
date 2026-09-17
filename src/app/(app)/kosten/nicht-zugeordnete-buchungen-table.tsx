"use client";

import { useActionState, useState } from "react";
import { RohdatenToggleButton, RohdatenZeile } from "@/components/rohdaten-inline";
import { DeleteButton } from "@/components/delete-button";
import {
  gruppiereGebaeude,
  type EinheitMitAdresse,
  type GebaeudeAuswahlGruppe,
  type GebaeudeMitGruppen,
} from "@/lib/gebaeude-gruppen";
import { gruppiereKostenarten } from "@/lib/kostenart-gruppen";
import { ordneNichtZugeordneteBuchungZu, loescheNichtZugeordneteBuchung } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

export type NichtZugeordneteBuchungRow = {
  id: string;
  datum: string;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  quelle: string | null;
  rohdaten: Record<string, string> | null;
  importBatchId: string | null;
  importDateiname: string | null;
};

function Zeile({
  buchung,
  kostenartGruppen,
  gebaeudeGruppen,
}: {
  buchung: NichtZugeordneteBuchungRow;
  kostenartGruppen: ReturnType<typeof gruppiereKostenarten<{ id: string; name: string; umlagefaehig: boolean }>>;
  gebaeudeGruppen: GebaeudeAuswahlGruppe[];
}) {
  const [expanded, setExpanded] = useState(false);
  const [kostenartId, setKostenartId] = useState("");
  const [fehler, formAction, pending] = useActionState(ordneNichtZugeordneteBuchungZu.bind(null, buchung.id), null);

  return (
    <>
      <tr className="border-t border-neutral-800">
        <td className="px-3 py-1.5 text-white">{formatDate(buchung.datum)}</td>
        <td className="px-3 py-1.5 text-white">{formatEuro(buchung.betrag)}</td>
        <td
          className="max-w-[200px] truncate px-3 py-1.5 text-neutral-300"
          title={`${buchung.empfaenger ?? ""} ${buchung.verwendungszweck ?? ""}`}
        >
          {buchung.empfaenger || buchung.verwendungszweck || "–"}
        </td>
        <td className="px-3 py-1.5 text-xs text-neutral-500">{buchung.quelle || "–"}</td>
        <td colSpan={3} className="px-3 py-1.5">
          <form action={formAction} className="flex flex-wrap items-center gap-2">
            <select
              name="kostenartId"
              value={kostenartId}
              onChange={(e) => setKostenartId(e.target.value)}
              className="rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
            >
              <option value="">– Kostenart wählen –</option>
              {kostenartGruppen.map((gruppe) =>
                gruppe.label ? (
                  <optgroup key={gruppe.label} label={gruppe.label}>
                    {gruppe.items.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                        {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  gruppe.items.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                      {!k.umlagefaehig ? " (nicht umlagefähig)" : ""}
                    </option>
                  ))
                ),
              )}
            </select>
            <select
              name="gebaeudeAuswahl"
              defaultValue=""
              className="min-w-[140px] rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-xs outline-none focus:border-neutral-400"
            >
              <option value="">– Objekt gesamt –</option>
              {gebaeudeGruppen.map((gruppe) => (
                <optgroup key={gruppe.label} label={gruppe.label}>
                  {gruppe.optionen.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input
              type="number"
              name="jahr"
              defaultValue={new Date(buchung.datum).getFullYear()}
              className="w-16 rounded-md border border-neutral-700 bg-transparent px-1 py-1 text-xs outline-none focus:border-neutral-400"
            />
            <button
              type="submit"
              disabled={pending || !kostenartId}
              className="rounded-md bg-white px-2 py-1 text-xs font-medium text-black hover:bg-neutral-200 disabled:opacity-40"
            >
              {pending ? "…" : "Zuordnen"}
            </button>
            {fehler && <span className="text-xs text-red-400">{fehler}</span>}
          </form>
        </td>
        <td className="px-3 py-1.5">
          <RohdatenToggleButton expanded={expanded} onClick={() => setExpanded((e) => !e)} />
        </td>
        <td className="px-3 py-1.5">
          <DeleteButton
            action={loescheNichtZugeordneteBuchung.bind(null, buchung.id)}
            confirmText="Diese Buchung wirklich ohne Zuordnung löschen?"
            size="sm"
          />
        </td>
      </tr>
      {expanded && buchung.rohdaten && (
        <RohdatenZeile
          rohdaten={buchung.rohdaten}
          colSpan={9}
          downloadHref={buchung.importBatchId ? `/api/import-batches/${buchung.importBatchId}/download` : undefined}
          downloadLabel={`Originaldatei herunterladen${buchung.importDateiname ? ` (${buchung.importDateiname})` : ""}`}
        />
      )}
    </>
  );
}

/**
 * Buchungen, die der Nutzer beim Kontoauszug-Import bewusst als "nicht kategorisiert" geparkt
 * hat (siehe NichtKategorisiertButton in kontoauszug/import/) — pro Zeile dieselben Felder wie
 * beim eigentlichen Kosten-Import (Kostenart/Gebäude/Jahr), "Zuordnen" legt daraus eine echte
 * Kostenposition an. Wird nur gerendert, wenn mindestens ein Eintrag existiert.
 */
export function NichtZugeordneteBuchungenTable({
  rows,
  kostenarten,
  gebaeude,
  einheiten,
}: {
  rows: NichtZugeordneteBuchungRow[];
  kostenarten: { id: string; name: string; umlagefaehig: boolean }[];
  gebaeude: GebaeudeMitGruppen[];
  einheiten: EinheitMitAdresse[];
}) {
  if (rows.length === 0) return null;

  const kostenartGruppen = gruppiereKostenarten(kostenarten, (k) => k.name);
  const gebaeudeGruppen = gruppiereGebaeude(gebaeude, einheiten);

  return (
    <div className="mb-8">
      <h2 className="mb-3 text-lg font-medium text-white">
        Nicht kategorisierte Buchungen ({rows.length})
      </h2>
      <p className="mb-3 text-sm text-neutral-400">
        Beim Import bewusst ohne Zuordnung gemerkt — hier Kostenart (und optional Gebäude/Jahr)
        nachtragen, um daraus eine echte Kostenposition zu machen, oder löschen, falls der Vorgang
        bereits anderswo (Zahlung, Kaution, …) erfasst wurde.
      </p>
      <div className="overflow-x-auto rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-3 py-2">Datum</th>
              <th className="px-3 py-2">Betrag</th>
              <th className="px-3 py-2">Empfänger / Verwendungszweck</th>
              <th className="px-3 py-2">Herkunft</th>
              <th className="px-3 py-2" colSpan={3}>
                Zuordnen
              </th>
              <th className="px-3 py-2">Rohdaten</th>
              <th className="px-3 py-2">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Zeile key={r.id} buchung={r} kostenartGruppen={kostenartGruppen} gebaeudeGruppen={gebaeudeGruppen} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
