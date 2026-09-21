// Kostenaufschlüsselung einer Nebenkostenabrechnung, zusammengefasst über Positionen — für das
// gesamte Objekt (Kreis-Gesamtbeträge) oder für einen Ausschnitt (ein Haus/Gebäude: dessen Anteil
// an den Kostenkreisen). Reine Auswertung der gespeicherten Aufschlüsselungen (details) der
// Positionen, nichts wird neu berechnet.
import type { KostenanteilDetailEintrag } from "./nebenkostenabrechnung";

export type UebersichtModus = "gesamt" | "anteil";

export type UebersichtZeile = {
  kostenartName: string;
  kreise: string;
  kreiseTitel: string;
  verteilung: string;
  // "gesamt": Jahresgesamtbetrag der Kostenkreise; "anteil": Anteil des Ausschnitts (volles Jahr).
  basis: number;
  umgelegt: number;
};

export type Uebersicht = {
  modus: UebersichtModus;
  zeilen: UebersichtZeile[];
  summe: { basis: number; umgelegt: number };
};

const VERTEILUNG_LABEL: Record<string, string> = {
  WOHNFLAECHE: "Wohnfläche",
  MITEIGENTUMSANTEIL: "Miteigentumsanteil",
  PERSONENZAHL: "Personenzahl",
  EINHEITEN: "Anzahl Einheiten",
  VERBRAUCH_MANUELL: "Verbrauch",
  VORVERTEILT: "extern vorverteilt",
};

// Kostenarten, die nur je Haus geführt werden ("Heizkosten Haus 2-12", "Heizkosten Haus 5-15"),
// laufen unter dem Namen ohne den Haus-Zusatz zusammen ("Heizkosten").
const grundName = (name: string) => name.replace(/\s+Haus\s+[\d,\s\-–]+$/i, "").trim() || name;

export function baueKostenUebersicht(
  positionen: { einheitId: string; details: KostenanteilDetailEintrag[] }[],
  modus: UebersichtModus,
  // Beträge, die nicht auf Mieter umgelegt werden (z.B. Techem-Anteil einer leerstehenden Wohnung):
  // zählen zur Basis der Kostenart, aber nie zum umgelegten Betrag.
  leerstand: { kostenartName: string; betrag: number }[] = [],
): Uebersicht {
  // Stufe 1: je Kostenart+Kostenkreis.
  type Kreis = {
    kostenartName: string;
    scopeLabel: string;
    verteilerschluessel: string;
    basis: number;
    umgelegt: number;
  };
  const kreise = new Map<string, Kreis>();
  // Bei "anteil" zählt der Jahresanteil einer Einheit nur einmal, auch wenn sie mehrere Positionen
  // (Mieterwechsel) hat — extern vorverteilte Beträge sind dagegen je Mietvertrag einzeln.
  const gezaehlt = new Set<string>();

  for (const p of positionen) {
    for (const d of p.details) {
      const key = `${d.kostenartName}|${d.scopeLabel}`;
      const vorverteilt = d.verteilerschluessel === "VORVERTEILT";
      const k = kreise.get(key) ?? {
        kostenartName: d.kostenartName,
        scopeLabel: d.scopeLabel,
        verteilerschluessel: d.verteilerschluessel,
        basis: 0,
        umgelegt: 0,
      };
      if (modus === "gesamt") {
        // Der Kreis-Gesamtbetrag steht in jeder Position des Kreises gleich.
        k.basis = vorverteilt ? k.basis + d.gesamtbetragPool : Math.max(k.basis, d.gesamtbetragPool);
      } else if (vorverteilt) {
        k.basis += d.anteilJahr;
      } else {
        const einmal = `${p.einheitId}|${key}`;
        if (!gezaehlt.has(einmal)) {
          gezaehlt.add(einmal);
          k.basis += d.anteilJahr;
        }
      }
      k.umgelegt += d.anteilZeitraum;
      kreise.set(key, k);
    }
  }

  for (const l of leerstand) {
    const key = `${l.kostenartName}|Leerstand`;
    const k = kreise.get(key) ?? {
      kostenartName: l.kostenartName,
      scopeLabel: "Leerstand",
      verteilerschluessel: "VORVERTEILT",
      basis: 0,
      umgelegt: 0,
    };
    k.basis += l.betrag;
    kreise.set(key, k);
  }

  // Stufe 2: je Kostenart über alle Kostenkreise.
  const arten = new Map<
    string,
    { basis: number; umgelegt: number; kreise: string[]; namen: Set<string>; schluessel: Set<string> }
  >();
  for (const k of kreise.values()) {
    const name = grundName(k.kostenartName);
    const a = arten.get(name) ?? { basis: 0, umgelegt: 0, kreise: [], namen: new Set(), schluessel: new Set() };
    a.basis += k.basis;
    a.umgelegt += k.umgelegt;
    a.namen.add(k.kostenartName);
    a.kreise.push(k.kostenartName === name ? k.scopeLabel : k.kostenartName);
    a.schluessel.add(VERTEILUNG_LABEL[k.verteilerschluessel] ?? k.verteilerschluessel);
    arten.set(name, a);
  }

  const zeilen = [...arten.entries()]
    .map(([kostenartName, a]): UebersichtZeile => ({
      kostenartName,
      kreise:
        a.kreise.length === 1
          ? a.kreise[0]
          : a.namen.size > 1
            ? `${a.kreise.length} Kostenarten zusammengefasst`
            : `${a.kreise.length} Kostenkreise`,
      kreiseTitel: [...a.kreise].sort().join("\n"),
      verteilung: [...a.schluessel].join(", "),
      basis: a.basis,
      umgelegt: a.umgelegt,
    }))
    .sort((a, b) => a.kostenartName.localeCompare(b.kostenartName, "de"));

  return {
    modus,
    zeilen,
    summe: zeilen.reduce((s, z) => ({ basis: s.basis + z.basis, umgelegt: s.umgelegt + z.umgelegt }), { basis: 0, umgelegt: 0 }),
  };
}
