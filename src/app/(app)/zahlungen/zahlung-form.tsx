"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";
import { DateInput } from "@/components/date-input";
import { MietvertragAuswahl } from "@/components/mietvertrag-auswahl";

type Option = { id: string; label: string };

type Zahlungsart = "MIETZAHLUNG" | "MAHNGEBUEHR" | "NK_VERRECHNUNG";

const MONATE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

type Zahlung = {
  mietvertragId: string;
  datum: string;
  betrag: string;
  periodeMonat: number;
  periodeJahr: number;
  verwendungszweck: string | null;
};

export function ZahlungForm({
  mietvertraege,
  defaultMietvertragId,
  initial,
  action,
  zeigeZahlungsartAuswahl,
}: {
  mietvertraege: Option[];
  defaultMietvertragId?: string;
  initial?: Zahlung;
  action: (formData: FormData) => Promise<void>;
  // Nur auf /zahlungen/neu: lässt zwischen "Miete" und "Gebühr" wählen (siehe createZahlung) —
  // beim Bearbeiten einer bestehenden Zahlung ist die Art unveränderlich (Storno-Prinzip), eine
  // Gebühr hat dort ohnehin eine eigene, einfachere Ansicht statt dieses Formulars.
  zeigeZahlungsartAuswahl?: boolean;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [mietvertragId, setMietvertragId] = useState(initial?.mietvertragId ?? defaultMietvertragId ?? "");
  const [zahlungsart, setZahlungsart] = useState<Zahlungsart>("MIETZAHLUNG");
  const istGebuehr = Boolean(zeigeZahlungsartAuswahl) && zahlungsart === "MAHNGEBUEHR";
  // Verrechnung einer Nebenkostenabrechnung aufs Mieterkonto (Nachzahlung als Forderung, Guthaben
  // als Gutschrift) — wie eine Gebühr ein reiner Mieterkonto-Posten ohne Geldfluss.
  const istNkVerrechnung = Boolean(zeigeZahlungsartAuswahl) && zahlungsart === "NK_VERRECHNUNG";
  const keineMietzahlung = istGebuehr || istNkVerrechnung;

  const heute = new Date();

  return (
    <form action={formAction} className="max-w-md space-y-4">
      {zeigeZahlungsartAuswahl && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="zahlungsart">
            Art
          </label>
          <select
            id="zahlungsart"
            name="zahlungsart"
            value={zahlungsart}
            onChange={(e) => setZahlungsart(e.target.value as Zahlungsart)}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          >
            <option value="MIETZAHLUNG">Miete</option>
            <option value="MAHNGEBUEHR">Gebühr (nicht EUR-relevant)</option>
            <option value="NK_VERRECHNUNG">Verrechnung Nebenkostenabrechnung (nicht EUR-relevant)</option>
          </select>
          {istGebuehr && (
            <p className="mt-1 text-xs text-neutral-500">
              Berechnet dem Mieter eine Gebühr (z.B. Rücklastschrift-/Mahngebühr) — eine reine
              Forderung auf dem Mietkonto ohne Geldfluss, zählt nicht zu den Mieteinnahmen.
            </p>
          )}
          {istNkVerrechnung && (
            <p className="mt-1 text-xs text-neutral-500">
              Verrechnet das Ergebnis einer Nebenkostenabrechnung mit dem Mieterkonto statt per
              Überweisung: eine Nachzahlung als positive Forderung, ein Guthaben als negative
              Gutschrift. Ohne Geldfluss, zählt nicht zu den Mieteinnahmen — die passende
              Abrechnung gilt danach automatisch als erledigt.
            </p>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="mietvertragId">
          Mietvertrag
        </label>
        <input type="hidden" id="mietvertragId" name="mietvertragId" value={mietvertragId} required />
        <MietvertragAuswahl
          kandidaten={mietvertraege}
          value={mietvertragId}
          onChange={setMietvertragId}
          leerLabel="Bitte wählen…"
          size="md"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <DateInput
          id="datum"
          name="datum"
          label={keineMietzahlung ? "Datum" : "Zahlungsdatum"}
          defaultValue={initial?.datum ?? heute.toISOString().slice(0, 10)}
        />
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="betrag">
            Betrag (€)
          </label>
          <input
            id="betrag"
            name="betrag"
            type="number"
            step="0.01"
            min={istGebuehr ? "0.01" : undefined}
            placeholder={istNkVerrechnung ? "+ Nachzahlung / − Guthaben" : undefined}
            required
            defaultValue={initial?.betrag}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      </div>

      {istNkVerrechnung && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="nkJahr">
            Abrechnungsjahr der Nebenkostenabrechnung
          </label>
          <input
            id="nkJahr"
            name="nkJahr"
            type="number"
            min="2000"
            max="2100"
            required
            defaultValue={heute.getFullYear() - 1}
            className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      )}

      {!keineMietzahlung && (
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="periodeMonat">
              Für Monat
            </label>
            <select
              id="periodeMonat"
              name="periodeMonat"
              defaultValue={initial?.periodeMonat ?? heute.getMonth() + 1}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            >
              {MONATE.map((name, i) => (
                <option key={name} value={i + 1}>
                  {name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="periodeJahr">
              Jahr
            </label>
            <input
              id="periodeJahr"
              name="periodeJahr"
              type="number"
              required
              defaultValue={initial?.periodeJahr ?? heute.getFullYear()}
              className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
            />
          </div>
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="verwendungszweck">
          {istGebuehr ? "Bezeichnung" : istNkVerrechnung ? "Bezeichnung (optional)" : "Verwendungszweck (optional)"}
        </label>
        <input
          id="verwendungszweck"
          name="verwendungszweck"
          required={istGebuehr}
          defaultValue={initial?.verwendungszweck ?? ""}
          placeholder={
            istGebuehr
              ? "z.B. Rücklastschriftgebühr 09/2026"
              : istNkVerrechnung
                ? "z.B. Nachzahlung Nebenkostenabrechnung 2025"
                : "z.B. Miete März 2026"
          }
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending
          ? "Speichern…"
          : initial
            ? "Speichern"
            : istGebuehr
              ? "Gebühr erfassen"
              : istNkVerrechnung
                ? "Verrechnung erfassen"
                : "Zahlung erfassen"}
      </button>
    </form>
  );
}
