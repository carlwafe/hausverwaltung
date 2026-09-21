"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { speichereVorverteilteKostenanteile } from "./actions";

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("de-DE").format(new Date(iso));
}

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function zuZahl(text: string): number {
  const wert = Number(text.trim().replace(",", "."));
  return Number.isFinite(wert) ? wert : 0;
}

export type VorverteilteZeile = {
  mietvertragId: string;
  einheitBezeichnung: string;
  mieterNamen: string;
  zeitraumVon: string; // ISO
  zeitraumBis: string; // ISO
  betrag: number | null;
};

export type LeerstandZeile = { einheitId: string | null; betrag: number; notiz: string | null };

type LeerstandEingabe = { einheitId: string; betrag: string; notiz: string };

const feld =
  "rounded-md border border-neutral-700 bg-transparent px-2 py-1 text-sm outline-none focus:border-neutral-400";

/**
 * Eine Tabelle pro Kostenart mit Verteilerschlüssel VORVERTEILT (z.B. "Heizkosten Haus 2-12") —
 * eine Zeile pro Mietvertrag/Zeitraum dieser Abrechnung (deckt einen unterjährigen Mieterwechsel
 * korrekt ab, da Techem selbst schon pro Nutzungszeitraum aufteilt). Darunter Leerstand-Zeilen
 * (Beträge, die nicht auf einen Mieter umgelegt werden) und die Summen zur Kontrolle, ob alles aus
 * der Gesamtabrechnung eingetragen ist. Wirkt erst nach dem bestehenden "Neu berechnen"-Button auf
 * die Positionen, genau wie bei den Verbrauchswerten.
 */
export function VorverteilteKostenanteileForm({
  jahr,
  kostenartId,
  kostenartName,
  zeilen,
  leerstand,
  einheiten,
}: {
  jahr: number;
  kostenartId: string;
  kostenartName: string;
  zeilen: VorverteilteZeile[];
  leerstand: LeerstandZeile[];
  einheiten: { id: string; bezeichnung: string }[];
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(speichereVorverteilteKostenanteile, formData),
    null,
  );
  const [betraege, setBetraege] = useState<Record<string, string>>(() =>
    Object.fromEntries(zeilen.map((z) => [z.mietvertragId, z.betrag === null ? "" : String(z.betrag).replace(".", ",")])),
  );
  const [leerstandZeilen, setLeerstandZeilen] = useState<LeerstandEingabe[]>(() =>
    leerstand.map((l) => ({ einheitId: l.einheitId ?? "", betrag: String(l.betrag).replace(".", ","), notiz: l.notiz ?? "" })),
  );

  const summeMieter = zeilen.reduce((s, z) => s + zuZahl(betraege[z.mietvertragId] ?? ""), 0);
  const summeLeerstand = leerstandZeilen.reduce((s, l) => s + zuZahl(l.betrag), 0);
  const anzahlEingetragen = zeilen.filter((z) => (betraege[z.mietvertragId] ?? "").trim() !== "").length;

  function aendereLeerstand(index: number, patch: Partial<LeerstandEingabe>) {
    setLeerstandZeilen((l) => l.map((z, i) => (i === index ? { ...z, ...patch } : z)));
  }

  function submit(formData: FormData) {
    formData.set(
      "leerstand",
      JSON.stringify(leerstandZeilen.map((l) => ({ einheitId: l.einheitId || null, betrag: l.betrag, notiz: l.notiz }))),
    );
    formAction(formData);
  }

  return (
    <form action={submit} className="mb-4 rounded-lg border border-neutral-800 p-4">
      <input type="hidden" name="jahr" value={jahr} />
      <input type="hidden" name="kostenartId" value={kostenartId} />
      <p className="mb-3 text-sm font-medium text-white">{kostenartName}</p>
      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Zeitraum</th>
              <th className="px-4 py-2 text-right">Betrag (€)</th>
            </tr>
          </thead>
          <tbody>
            {zeilen.map((z) => (
              <tr key={z.mietvertragId} className="border-t border-neutral-800">
                <td className="px-4 py-2 text-white">
                  {z.einheitBezeichnung}
                  <input type="hidden" name="mietvertragId" value={z.mietvertragId} />
                </td>
                <td className="px-4 py-2 text-neutral-300">{z.mieterNamen}</td>
                <td className="px-4 py-2 text-neutral-300">
                  {formatDate(z.zeitraumVon)} – {formatDate(z.zeitraumBis)}
                </td>
                <td className="px-4 py-2 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    name={`betrag_${z.mietvertragId}`}
                    value={betraege[z.mietvertragId] ?? ""}
                    onChange={(e) => setBetraege((b) => ({ ...b, [z.mietvertragId]: e.target.value }))}
                    placeholder="aus Techem-PDF"
                    className={`w-32 text-right ${feld}`}
                  />
                </td>
              </tr>
            ))}
            {zeilen.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  Keine Mietverträge für diese Kostenart in {jahr}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-white">Leerstand (nicht auf Mieter umgelegt)</p>
        <p className="mb-2 text-xs text-neutral-500">
          Beträge der Gesamtabrechnung, die keinem Mieter zugerechnet werden, z.B. für eine leerstehende Wohnung. Sie
          trägt der Eigentümer und erscheinen in der Kostenaufschlüsselung als &bdquo;nicht umgelegt&ldquo;.
        </p>
        <div className="space-y-2">
          {leerstandZeilen.map((l, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select
                value={l.einheitId}
                onChange={(e) => aendereLeerstand(i, { einheitId: e.target.value })}
                className={`min-w-[200px] ${feld}`}
              >
                <option value="">– keine Einheit / allgemein –</option>
                {einheiten.map((e) => (
                  <option key={e.id} value={e.id} className="bg-neutral-900">
                    {e.bezeichnung}
                  </option>
                ))}
              </select>
              <input
                type="text"
                inputMode="decimal"
                value={l.betrag}
                onChange={(e) => aendereLeerstand(i, { betrag: e.target.value })}
                placeholder="Betrag (€)"
                className={`w-32 text-right ${feld}`}
              />
              <input
                type="text"
                value={l.notiz}
                onChange={(e) => aendereLeerstand(i, { notiz: e.target.value })}
                placeholder="Notiz (z.B. Leerstand ab 03/2025)"
                className={`min-w-[200px] flex-1 ${feld}`}
              />
              <button
                type="button"
                onClick={() => setLeerstandZeilen((z) => z.filter((_, j) => j !== i))}
                className="rounded-md border border-neutral-700 px-2 py-1 text-sm text-neutral-400 hover:bg-neutral-900"
                title="Zeile entfernen"
              >
                −
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setLeerstandZeilen((z) => [...z, { einheitId: "", betrag: "", notiz: "" }])}
          className="mt-2 text-sm text-neutral-400 hover:text-white hover:underline"
        >
          + Leerstand-Zeile
        </button>
      </div>

      <table className="ml-auto mt-4 text-sm">
        <tbody>
          <tr>
            <td className="py-0.5 pr-8 text-neutral-400">
              Summe Mieter ({anzahlEingetragen} von {zeilen.length} eingetragen)
            </td>
            <td className="py-0.5 text-right text-neutral-200">{formatEuro(summeMieter)}</td>
          </tr>
          <tr>
            <td className="py-0.5 pr-8 text-neutral-400">Summe Leerstand</td>
            <td className="py-0.5 text-right text-neutral-200">{formatEuro(summeLeerstand)}</td>
          </tr>
          <tr className="border-t border-neutral-700 font-medium">
            <td className="py-1 pr-8 text-white">Summe gesamt</td>
            <td className="py-1 text-right text-white">{formatEuro(summeMieter + summeLeerstand)}</td>
          </tr>
        </tbody>
      </table>

      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={pending || (zeilen.length === 0 && leerstandZeilen.length === 0)}
        className="mt-3 rounded-md border border-neutral-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-neutral-900 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
