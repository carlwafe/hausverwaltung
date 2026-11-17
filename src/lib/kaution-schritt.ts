// Einordnung einer Kaution auf der Kautionsseite: Reiter („Zu tun“, „Hinterlegt“, „Erledigt“) und der
// nächste Schritt als kurzer Text. Grundlage ist das Kautionskonto (baueKautionskonto) — dieselbe
// Rechnung wie die Kautionsabrechnung am Mietvertrag, damit beide Seiten dasselbe sagen.
// Reine Funktion ohne Prisma (lässt sich mit tsx direkt prüfen).

import type { Kautionskonto } from "./kautionskonto";

export const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

export type KautionPhase = "ZU_TUN" | "HINTERLEGT" | "ERLEDIGT";
export type KautionSchrittTon = "warnung" | "fehler" | "hinweis";

export type KautionEinordnung = {
  phase: KautionPhase;
  // null = nichts zu tun.
  schritt: string | null;
  ton: KautionSchrittTon | null;
};

// Ein Cent Rundungsdifferenz (Auflösung mit Zinsen, Teilauszahlungen) gilt als erledigt.
const TOLERANZ = 0.015;

function euro(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export function ordneKautionEin(input: {
  konto: Kautionskonto;
  // Vertragsende; null = Vertrag läuft ohne Ende.
  mietende: Date | null;
  heute: Date;
  // Summe der gebuchten Einbehalte, die weder pauschal gutgeschrieben noch mit BK-Abrechnung oder
  // Mieterkonto verrechnet sind — sie warten auf eine Rechnung.
  vorlaeufigEinbehalten: number;
  // Fehlender Stammdatensatz, keine Einzahlung gefunden o.ä. (siehe ladeKautionsuebersicht).
  warnung: string | null;
}): KautionEinordnung {
  const { konto, mietende, heute, vorlaeufigEinbehalten, warnung } = input;
  const a = konto.abrechnung;
  const beendet = mietende !== null && mietende.getTime() <= heute.getTime();

  // Ohne Soll und ohne Bewegung (z.B. Garage ohne Kaution): nichts zu tun.
  if (konto.status === "KEINE") return { phase: beendet ? "ERLEDIGT" : "HINTERLEGT", schritt: null, ton: null };

  if (warnung) return { phase: "ZU_TUN", schritt: "Buchungen prüfen", ton: "hinweis" };

  if (a.nochOffen < -TOLERANZ) {
    return a.ausgezahltSumme > TOLERANZ
      ? { phase: "ZU_TUN", schritt: `${euro(-a.nochOffen)} zurückfordern`, ton: "fehler" }
      : { phase: "ZU_TUN", schritt: `${euro(-a.nochOffen)} vom Mieter nachfordern`, ton: "fehler" };
  }
  if (a.strittigOffenSumme > TOLERANZ) return { phase: "ZU_TUN", schritt: "Strittigen Einbehalt klären", ton: "warnung" };
  if (vorlaeufigEinbehalten > TOLERANZ) {
    return { phase: "ZU_TUN", schritt: "Einbehalt: Rechnung verrechnen", ton: "warnung" };
  }

  if (konto.status === "OFFEN") {
    return beendet
      ? { phase: "ERLEDIGT", schritt: null, ton: null }
      : { phase: "ZU_TUN", schritt: "Einzahlung fehlt", ton: "warnung" };
  }

  if (konto.status === "ABGERECHNET" || (Math.abs(a.nochOffen) <= TOLERANZ && a.ausgezahltSumme + a.einbehalteSumme > TOLERANZ)) {
    // Abgerechnet, aber das Geld liegt noch auf dem Kautionskonto (z.B. Einbehalt gebucht, Konto nie aufgelöst).
    if (konto.aufKautionskonto) {
      return { phase: "ZU_TUN", schritt: "Kautionskonto auflösen", ton: "warnung" };
    }
    return { phase: "ERLEDIGT", schritt: null, ton: null };
  }

  // HINTERLEGT oder AUFGELOEST: Solange der Vertrag läuft, bleibt die Kaution hinterlegt — auch nach einem
  // Kontowechsel (Auflösung und neue Anlage).
  if (!beendet) return { phase: "HINTERLEGT", schritt: null, ton: null };
  if (konto.aufKautionskonto) return { phase: "ZU_TUN", schritt: "Kautionskonto auflösen", ton: "warnung" };
  return { phase: "ZU_TUN", schritt: `Rest ${euro(a.nochOffen)} abrechnen`, ton: "warnung" };
}
