"use client";

import { useActionState, useState } from "react";
import { runFormAction } from "@/lib/form-utils";

const VERTEILERSCHLUESSEL_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  EINHEITEN: "Anzahl Einheiten",
  VORVERTEILT: "Extern vorverteilt (z.B. Techem) — Beträge pro Mieter erfassen",
  IN_ABRECHNUNG_ENTHALTEN: "Bereits in der Techem-Abrechnung enthalten (keine eigene Eingabe)",
};

export const BETRKV_NUMMER_LABEL: Record<number, string> = {
  1: "1 — öffentliche Lasten (Grundsteuer)",
  2: "2 — Wasserversorgung",
  3: "3 — Entwässerung",
  4: "4 — Heizung",
  5: "5 — Warmwasser",
  6: "6 — verbundene Heizungs-/Warmwasseranlagen",
  7: "7 — Aufzug",
  8: "8 — Straßenreinigung/Müllbeseitigung",
  9: "9 — Gebäudereinigung/Ungezieferbekämpfung",
  10: "10 — Gartenpflege",
  11: "11 — Beleuchtung",
  12: "12 — Schornsteinreinigung",
  13: "13 — Sach-/Haftpflichtversicherung",
  14: "14 — Hauswart",
  15: "15 — Antenne/Kabelanschluss",
  16: "16 — Wäschepflege-Einrichtungen",
};

type Kostenart = {
  name: string;
  umlagefaehig: boolean;
  standardVerteilerschluessel: string | null;
  masseinheit: string | null;
  betrKvNummer: number | null;
  istSonstigeBetriebskosten: boolean;
  vertraglicheGrundlage: string | null;
};

export function KostenartForm({
  initial,
  action,
}: {
  initial?: Kostenart;
  action: (formData: FormData) => Promise<void>;
}) {
  const [error, formAction, pending] = useActionState(
    (_prev: string | null, formData: FormData) => runFormAction(action, formData),
    null,
  );
  const [umlagefaehig, setUmlagefaehig] = useState(initial?.umlagefaehig ?? true);
  const [verteilerschluessel, setVerteilerschluessel] = useState(initial?.standardVerteilerschluessel ?? "");
  const [betrKvNummer, setBetrKvNummer] = useState(initial?.betrKvNummer ? String(initial.betrKvNummer) : "");
  const [istSonstigeBetriebskosten, setIstSonstigeBetriebskosten] = useState(
    initial?.istSonstigeBetriebskosten ?? false,
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="name">
          Name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial?.name}
          placeholder="z.B. Heizung, Wasser, Hausmeister"
          className="w-full rounded-md border border-neutral-700 px-3 py-2 text-sm outline-none focus:border-neutral-400"
        />
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="umlagefaehig"
          checked={umlagefaehig}
          onChange={(e) => setUmlagefaehig(e.target.checked)}
          className="h-4 w-4 rounded border-neutral-700 bg-transparent"
        />
        Umlagefähig auf Mieter (Betriebskosten)
      </label>

      <div>
        <label
          className={`mb-1 block text-sm font-medium ${!umlagefaehig ? "text-neutral-600" : ""}`}
          htmlFor="standardVerteilerschluessel"
        >
          Standard-Verteilerschlüssel (optional)
          {!umlagefaehig && " – nur bei umlagefähigen Kostenarten relevant"}
        </label>
        <select
          id="standardVerteilerschluessel"
          name="standardVerteilerschluessel"
          disabled={!umlagefaehig}
          value={verteilerschluessel}
          onChange={(e) => setVerteilerschluessel(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
        >
          <option value="">– keiner –</option>
          {Object.entries(VERTEILERSCHLUESSEL_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label
          className={`mb-1 block text-sm font-medium ${!umlagefaehig || istSonstigeBetriebskosten ? "text-neutral-600" : ""}`}
          htmlFor="betrKvNummer"
        >
          BetrKV-Nummer (§ 2 Nr. 1–16, optional)
          {!umlagefaehig && " – nur bei umlagefähigen Kostenarten relevant"}
        </label>
        <select
          id="betrKvNummer"
          name="betrKvNummer"
          disabled={!umlagefaehig || istSonstigeBetriebskosten}
          value={betrKvNummer}
          onChange={(e) => setBetrKvNummer(e.target.value)}
          className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
        >
          <option value="">– noch nicht zugeordnet –</option>
          {Object.entries(BETRKV_NUMMER_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <label className={`flex items-center gap-2 text-sm ${!umlagefaehig ? "text-neutral-600" : ""}`}>
        <input
          type="checkbox"
          name="istSonstigeBetriebskosten"
          checked={istSonstigeBetriebskosten}
          disabled={!umlagefaehig}
          onChange={(e) => {
            setIstSonstigeBetriebskosten(e.target.checked);
            if (e.target.checked) setBetrKvNummer("");
          }}
          className="h-4 w-4 rounded border-neutral-700 bg-transparent disabled:cursor-not-allowed"
        />
        Fällt unter § 2 Nr. 17 BetrKV (&quot;sonstige Betriebskosten&quot;)
      </label>

      {umlagefaehig && istSonstigeBetriebskosten && (
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="vertraglicheGrundlage">
            Vertragliche Grundlage
          </label>
          <p className="mb-1 text-xs text-neutral-500">
            Ein pauschaler Verweis auf § 2 Nr. 17 BetrKV im Mietvertrag reicht laut Rechtsprechung nicht
            aus — diese konkrete Position muss dort namentlich benannt sein. Fundstelle/Wortlaut hier
            eintragen.
          </p>
          <textarea
            id="vertraglicheGrundlage"
            name="vertraglicheGrundlage"
            required
            rows={2}
            defaultValue={initial?.vertraglicheGrundlage ?? ""}
            placeholder='z.B. "§ 3 Nr. 4 des Mietvertrags: Wartung der Rauchwarnmelder"'
            className="w-full rounded-md border border-neutral-700 bg-transparent px-3 py-2 text-sm outline-none focus:border-neutral-400"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-white px-4 py-2 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? "Speichern…" : "Speichern"}
      </button>
    </form>
  );
}
