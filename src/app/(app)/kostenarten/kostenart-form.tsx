"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { runFormAction, type FormAktion } from "@/lib/form-utils";
import { BETRKV_NUMMER_LABEL } from "@/lib/betrkv-nummer";
import { KOSTENGRUPPE_LABEL, vorschlagKostengruppe, type AnlageVZeile } from "@/lib/anlage-v";

const VERTEILERSCHLUESSEL_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  EINHEITEN: "Anzahl Einheiten",
  VORVERTEILT: "Extern vorverteilt (z.B. Techem) — Beträge pro Mieter erfassen",
  IN_ABRECHNUNG_ENTHALTEN: "Bereits in der Techem-Abrechnung enthalten (keine eigene Eingabe)",
};

type Kostenart = {
  name: string;
  umlagefaehig: boolean;
  standardVerteilerschluessel: string | null;
  masseinheit: string | null;
  betrKvNummer: number | null;
  istSonstigeBetriebskosten: boolean;
  vertraglicheGrundlage: string | null;
  anlageVZeile: AnlageVZeile | null;
  belegErforderlich: boolean;
};

export function KostenartForm({
  initial,
  action,
  abbrechenHref,
}: {
  initial?: Kostenart;
  action: FormAktion;
  // Ziel des Knopfs „Abbrechen“ neben „Speichern“ (ohne = kein Knopf).
  abbrechenHref?: string;
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
  const [name, setName] = useState(initial?.name ?? "");
  const [anlageVZeile, setAnlageVZeile] = useState<string>(
    initial?.anlageVZeile === "ERHALTUNGSAUFWAND" ||
      initial?.anlageVZeile === "ANSCHAFFUNG" ||
      initial?.anlageVZeile === "SCHULDZINSEN" ||
      initial?.anlageVZeile === "SONSTIGE_EINNAHMEN"
      ? initial.anlageVZeile
      : "",
  );
  const vorschlag = vorschlagKostengruppe({ name, umlagefaehig });

  return (
    <form action={formAction}>
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
        <Abschnitt titel="Kostenart & Betriebskosten">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="z.B. Heizung, Wasser, Hausmeister"
              className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400"
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
              className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
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
              className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
            >
              <option value="">– noch nicht zugeordnet –</option>
              {Object.entries(BETRKV_NUMMER_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Nr. 4–6 = warme Betriebskosten in der Abrechnung des Mietvertrags; ohne Nummer gilt nur „Heiz…“ oder
              „Warmwasser“ im Namen als warm.
            </p>
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
                Ein pauschaler Verweis auf § 2 Nr. 17 BetrKV im Mietvertrag reicht laut Rechtsprechung nicht aus — diese
                konkrete Position muss dort namentlich benannt sein. Fundstelle/Wortlaut hier eintragen.
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
        </Abschnitt>

        <Abschnitt titel="Steuer & Belege">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="anlageVZeile">
              Steuerliche Einordnung (Aufstellung für die Steuererklärung)
            </label>
            <select
              id="anlageVZeile"
              name="anlageVZeile"
              value={anlageVZeile}
              onChange={(e) => setAnlageVZeile(e.target.value)}
              className="h-10 w-full rounded-md border border-neutral-700 bg-transparent px-3 text-sm outline-none focus:border-neutral-400"
            >
              <option value="">– automatisch: {KOSTENGRUPPE_LABEL[vorschlag]} –</option>
              <option value="ERHALTUNGSAUFWAND">Instandhaltung / Erhaltungsaufwand (separat ausgewiesen)</option>
              <option value="ANSCHAFFUNG">Anschaffung / Herstellung (Abschreibung statt Sofortabzug, ab 2026)</option>
              <option value="SCHULDZINSEN">Schuldzinsen (Zinsanteil von Darlehensraten, nicht umlagefähig)</option>
              <option value="SONSTIGE_EINNAHMEN">Sonstige Einnahme (z.B. Waschgeld, Gebühren)</option>
            </select>
            <p className="mt-1 text-xs text-neutral-500">
              Ohne Auswahl gilt ein Vorschlag (Reparaturen = Instandhaltung, sonst nach Umlagefähigkeit).
            </p>
            <details className="mt-1 text-xs text-neutral-500">
              <summary className="cursor-pointer hover:text-white">Anschaffung und Schuldzinsen</summary>
              <p className="mt-1">
                Anschaffung / Herstellung zählt ab Berichtsjahr 2026 nicht zu den Kosten, sondern steht gesondert als
                Grundlage der AfA. Schuldzinsen sind der Zinsanteil einer Darlehensrate (nie umlagefähig); die Tilgung
                ist keine Kostenart, sondern die Buchungsart „Darlehenstilgung“.
              </p>
            </details>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="belegErforderlich"
                defaultChecked={initial?.belegErforderlich ?? true}
                className="h-4 w-4 rounded border-neutral-700 bg-transparent"
              />
              Einzelbeleg erforderlich
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Jede Kostenposition braucht einen Beleg. Häkchen nur entfernen, wenn der Kontoauszug bzw. die interne
              Forderung genügt (z.B. Bank-, Mahngebühren). Techem bleibt beleg-pflichtig: Abrechnung als gemeinsamen
              Beleg anhängen.
            </p>
          </div>
        </Abschnitt>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 rounded-md bg-white px-5 text-sm font-medium text-black hover:bg-neutral-200 disabled:opacity-50"
        >
          {pending ? "Speichern…" : "Speichern"}
        </button>
        {abbrechenHref && (
          <Link
            href={abbrechenHref}
            className="inline-flex h-10 items-center rounded-md border border-neutral-700 px-4 text-sm text-white hover:bg-neutral-900"
          >
            Abbrechen
          </Link>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </form>
  );
}

function Abschnitt({ titel, children }: { titel: string; children: ReactNode }) {
  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-neutral-800 p-4">
      <h2 className="text-xs font-medium uppercase tracking-wide text-neutral-400">{titel}</h2>
      {children}
    </section>
  );
}
