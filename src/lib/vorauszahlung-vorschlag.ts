// Vorschlag für die neue monatliche Betriebskostenvorauszahlung nach einer Nebenkostenabrechnung
// (§ 560 Abs. 4 BGB: Anpassung auf eine "angemessene Höhe" per Erklärung in Textform). Maßstab ist
// der Kostenanteil des Mieters aus der letzten Abrechnung, auf ein volles Jahr hochgerechnet.
//
// Zuschlag: Die Oberfläche setzt auf Wunsch des Eigentümers standardmäßig 3 % an. Ein pauschaler
// Sicherheitszuschlag ist nach BGH (VIII ZR 294/10) allerdings angreifbar — sauber nur bei konkret
// absehbaren Kostensteigerungen (z.B. angekündigte Preiserhöhung des Versorgers), deren Grund dann im
// Schreiben steht. Folge eines zu hohen Ansatzes: nur der überhöhte Teil ist unwirksam.

export type VorauszahlungVorschlagEingabe = {
  jahr: number;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteilGesamt: number;
  // Jahresanteile je Kostenart (details[].anteilJahr) — genauer als eine Hochrechnung über Tage,
  // weil sie schon den Anteil der Einheit am ganzen Jahr enthalten. Leer = manuell erfasste Position.
  anteileJahr: number[];
  aktuelleVorauszahlung: number;
  zuschlagProzent?: number;
};

export type VorauszahlungVorschlag = {
  // Kostenanteil hochgerechnet auf 12 Monate (bei ganzjähriger Nutzung = kostenanteilGesamt).
  jahreskosten: number;
  hochgerechnet: boolean;
  rechnerischMonatlich: number;
  // Auf volle Euro aufgerundet (inkl. evtl. Zuschlag).
  vorschlag: number;
  differenz: number;
  richtung: "ERHOEHUNG" | "SENKUNG" | "UNVERAENDERT";
};

const runden = (n: number) => Math.round(n * 100) / 100;

function tage(von: Date, bis: Date) {
  return (
    Math.round(
      (Date.UTC(bis.getFullYear(), bis.getMonth(), bis.getDate()) - Date.UTC(von.getFullYear(), von.getMonth(), von.getDate())) /
        86400000,
    ) + 1
  );
}

export function schlageVorauszahlungVor(e: VorauszahlungVorschlagEingabe): VorauszahlungVorschlag {
  const jahrTage = tage(new Date(e.jahr, 0, 1), new Date(e.jahr, 11, 31));
  const nutzungTage = tage(e.zeitraumVon, e.zeitraumBis);
  const hochgerechnet = nutzungTage < jahrTage;

  let jahreskosten = e.kostenanteilGesamt;
  if (hochgerechnet) {
    jahreskosten =
      e.anteileJahr.length > 0
        ? e.anteileJahr.reduce((s, a) => s + a, 0)
        : nutzungTage > 0
          ? (e.kostenanteilGesamt * jahrTage) / nutzungTage
          : 0;
  }
  jahreskosten = runden(Math.max(0, jahreskosten));

  const rechnerischMonatlich = runden(jahreskosten / 12);
  const mitZuschlag = rechnerischMonatlich * (1 + (e.zuschlagProzent ?? 0) / 100);
  // Kleine Toleranz, damit z.B. 85,000001 nicht auf 86 springt.
  const vorschlag = Math.ceil(mitZuschlag - 0.005);
  const differenz = runden(vorschlag - e.aktuelleVorauszahlung);

  return {
    jahreskosten,
    hochgerechnet,
    rechnerischMonatlich,
    vorschlag,
    differenz,
    richtung: Math.abs(differenz) < 0.005 ? "UNVERAENDERT" : differenz > 0 ? "ERHOEHUNG" : "SENKUNG",
  };
}

/**
 * Frühester sicherer Wirksamkeitstermin: Die Anpassung gilt ab der nächsten Fälligkeit nach Zugang
 * der Erklärung. Weil die Miete zum dritten Werktag fällig ist, wird ab dem Monat nach dem
 * Folgemonat vorgeschlagen (Schreiben im September → ab 1. November), damit der Zugang sicher
 * vor der Fälligkeit liegt.
 */
export function vorgeschlagenesGueltigAb(heute: Date = new Date()): Date {
  return new Date(heute.getFullYear(), heute.getMonth() + 2, 1);
}
