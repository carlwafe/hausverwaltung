// Inhalt des Schreibens „Betriebskostenabrechnung“ an einen Mieter (eine Position der Nebenkostenabrechnung).
// Reine Funktion ohne Prisma — Daten kommen aus nk-schreiben-laden.ts oder direkt aus einem Skript. Das Layout
// (Arial 10,5 pt, Abstände, Tabellen) liefert schreiben-pdf.ts nach der Vorlage in CLAUDE.md.
import type { Baustein, SchreibenInhalt, TabellenZeile } from "./schreiben-pdf";
import type { KostenanteilDetailEintrag } from "./nebenkostenabrechnung";

export type NkSchreibenDetail = KostenanteilDetailEintrag & { warm: boolean };

export type NkSchreibenDaten = {
  jahr: number;
  absender: {
    name: string;
    /** Rest der Absenderzeile nach dem Namen, z.B. „Postfach 130368 · 20103 Hamburg“. */
    anschriftZeile: string;
    ort: string;
    email?: string | null;
    telefon?: string | null;
  };
  /** Briefdatum und Zahlungsfrist als Datum (UTC-Mitternacht). */
  datum: Date;
  frist: Date | null;
  mieter: { anrede: "FRAU" | "HERR" | null; vorname: string; nachname: string }[];
  /** Zeilen unter dem Namen im Anschriftfeld (Straße, PLZ Ort). */
  empfaengerAnschrift: string[];
  /** Kurzbezeichnung der Wohnung („HS 2 WHG 4“) und Anschrift des Mietobjekts („Breslauer Str. 2, 23701 Eutin“). */
  wohnung: string;
  objektAnschrift: string;
  zeitraumVon: Date;
  zeitraumBis: Date;
  kostenanteil: number;
  vorauszahlung: number;
  /** Positiv = Guthaben, negativ = Nachzahlung (wie NebenkostenabrechnungPosition.saldo). */
  saldo: number;
  /** Nicht gezahlte NK-Vorauszahlung, die durch die Abrechnung abgegolten ist (unbezahlteNkVorauszahlung); 0 = kein Hinweis. */
  unbezahlteVorauszahlung: number;
  details: NkSchreibenDetail[];
  zahlungsweg: "LASTSCHRIFT" | "UEBERWEISUNG" | "BEHOERDE" | null;
  konto: { inhaber: string; iban: string; bic?: string | null; bank?: string | null } | null;
};

const zahl = (n: number, stellen = 2) => new Intl.NumberFormat("de-DE", { minimumFractionDigits: stellen, maximumFractionDigits: stellen }).format(Math.abs(n) < 0.005 ? 0 : n);
export const euro = (n: number) => `${zahl(n)} €`;
const minusEuro = (n: number) => `− ${euro(Math.abs(n))}`;
const rund2 = (n: number) => Math.round(n * 100) / 100;
export const datumText = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
const vierer = (iban: string) => iban.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();

function briefAnrede(mieter: NkSchreibenDaten["mieter"]): string {
  if (mieter.length === 0) return "Sehr geehrte Damen und Herren,";
  if (mieter.every((m) => m.anrede !== null)) {
    const t = mieter.map((m) => (m.anrede === "FRAU" ? `sehr geehrte Frau ${m.nachname}` : `sehr geehrter Herr ${m.nachname}`)).join(", ") + ",";
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  // Ohne Anrede (oder bei Firmen): neutral, nie aus dem Vornamen ableiten.
  return `Guten Tag ${mieter.map((m) => [m.vorname, m.nachname].map((x) => x.trim()).filter(Boolean).join(" ")).join(" und ")},`;
}

export const empfaengerZeilen = (mieter: NkSchreibenDaten["mieter"]) =>
  mieter.map((m) => {
    const name = [m.vorname, m.nachname].map((x) => x.trim()).filter(Boolean).join(" ");
    return `${m.anrede === "FRAU" ? "Frau " : m.anrede === "HERR" ? "Herrn " : ""}${name}`;
  });

function verteilung(d: KostenanteilDetailEintrag): string {
  if (d.verteilerschluessel === "VORVERTEILT") return "gesondert abgerechnet";
  if (d.verteilerschluessel === "EINHEITEN") return `1 von ${zahl(d.poolMasswert, 0)} Einheiten`;
  const z = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 3 }).format(n);
  return `${z(d.einheitMasswert)} von ${z(d.poolMasswert)} ${d.masseinheit}`.trim();
}

function kostenartText(d: KostenanteilDetailEintrag): string {
  const name = d.kostenartName.trim();
  const kreis = d.scopeLabel.trim();
  if (!kreis || /^objekt gesamt$/i.test(kreis) || /^extern vorverteilt/i.test(kreis)) return name;
  return `${name} (${kreis})`;
}

const tageInklusive = (von: Date, bis: Date) => Math.round((bis.getTime() - von.getTime()) / 86400000) + 1;
const tageImJahr = (jahr: number) => (jahr % 4 === 0 && (jahr % 100 !== 0 || jahr % 400 === 0) ? 366 : 365);

export function baueNkSchreiben(d: NkSchreibenDaten): SchreibenInhalt {
  const nachzahlung = d.saldo < -0.005;
  const guthaben = d.saldo > 0.005;
  const betrag = Math.abs(d.saldo);
  const ganzesJahr =
    d.zeitraumVon.getUTCMonth() === 0 && d.zeitraumVon.getUTCDate() === 1 && d.zeitraumBis.getUTCMonth() === 11 && d.zeitraumBis.getUTCDate() === 31;
  const zeitraum = `${datumText(d.zeitraumVon)} bis ${datumText(d.zeitraumBis)}`;
  const verwendungszweck = `Betriebskosten ${d.jahr} ${d.wohnung}`;
  const inhalt: Baustein[] = [];

  inhalt.push({
    art: "absatz",
    text: `nachfolgend rechne ich die Betriebskosten für Ihre Wohnung für den Zeitraum vom ${zeitraum} ab. ${
      nachzahlung
        ? `Die Abrechnung ergibt eine **Nachzahlung von ${euro(betrag)}**.`
        : guthaben
          ? `Die Abrechnung ergibt ein **Guthaben von ${euro(betrag)}** zu Ihren Gunsten.`
          : "Die Abrechnung ist **ausgeglichen**: Es ist weder etwas nachzuzahlen noch zu erstatten."
    }`,
  });

  // 1. Ergebnis
  inhalt.push({ art: "ueberschrift", text: "1. Ergebnis der Abrechnung" });
  inhalt.push({
    art: "tabelle",
    zeilen: [
      { zellen: [`Ihr Anteil an den Betriebskosten ${d.jahr}`, euro(d.kostenanteil)] },
      { zellen: ["abzüglich Ihrer Vorauszahlungen", minusEuro(d.vorauszahlung)] },
      { zellen: [nachzahlung ? "Nachzahlung" : guthaben ? "Guthaben" : "Ergebnis", nachzahlung || guthaben ? euro(betrag) : euro(0)], summe: true },
    ],
  });

  // 2. Berechnung
  const sortiert = [...d.details].sort((a, b) => a.kostenartName.localeCompare(b.kostenartName, "de"));
  const kalt = sortiert.filter((x) => !x.warm);
  const warm = sortiert.filter((x) => x.warm);
  const zeile = (x: NkSchreibenDetail): TabellenZeile => ({
    zellen: [kostenartText(x), x.verteilerschluessel === "VORVERTEILT" ? "–" : euro(x.gesamtbetragPool), verteilung(x), euro(x.anteilZeitraum)],
  });
  const kostenZeilen: TabellenZeile[] = [{ zellen: ["Kostenart", "Gesamtkosten", "Verteilung", "Ihr Anteil"], kopf: true }];
  const mitGruppen = kalt.length > 0 && warm.length > 0;
  if (mitGruppen) kostenZeilen.push({ zellen: ["Kalte Betriebskosten"], gruppe: true });
  kostenZeilen.push(...kalt.map(zeile));
  if (mitGruppen) kostenZeilen.push({ zellen: ["Heiz- und Warmwasserkosten"], gruppe: true });
  kostenZeilen.push(...warm.map(zeile));
  const summeZeilen = rund2(d.details.reduce((s, x) => s + rund2(x.anteilZeitraum), 0));
  kostenZeilen.push({ zellen: ["Summe Ihr Anteil", "", "", euro(d.kostenanteil)], summe: true });

  const tage = tageInklusive(d.zeitraumVon, d.zeitraumBis);
  const jahrestage = tageImJahr(d.jahr);
  inhalt.push({ art: "ueberschrift", text: "2. Berechnung Ihres Anteils" });
  inhalt.push({
    art: "absatz",
    keepNext: true,
    text:
      `Die umlagefähigen Kosten des Jahres ${d.jahr} verteile ich nach den jeweils angegebenen Verteilerschlüsseln auf die Wohnungen.` +
      (ganzesJahr || tage >= jahrestage
        ? ""
        : ` Ihre Mietzeit umfasst ${tage} von ${jahrestage} Tagen; die Jahresanteile sind entsprechend anteilig berechnet.`),
  });
  inhalt.push({ art: "tabelle", zeilen: kostenZeilen, breiten: [40, 18, 27, 15], rechts: [1, 3] });
  // Rundungsdifferenz zwischen Summe der gerundeten Zeilen und gespeichertem Kostenanteil (Restcent) offenlegen,
  // damit die Tabelle nachrechenbar bleibt.
  if (Math.abs(summeZeilen - rund2(d.kostenanteil)) >= 0.005) {
    inhalt.push({
      art: "absatz",
      text: `Die Summe der Einzelbeträge beträgt ${euro(summeZeilen)}; die Differenz von ${euro(Math.abs(rund2(d.kostenanteil) - summeZeilen))} beruht auf Rundungen.`,
    });
  }

  // 3. Vorauszahlungen und Zahlung
  inhalt.push({ art: "ueberschrift", text: nachzahlung ? "3. Vorauszahlungen und Nachzahlung" : guthaben ? "3. Vorauszahlungen und Guthaben" : "3. Vorauszahlungen" });
  let vorText = `Auf die Betriebskosten haben Sie im Abrechnungszeitraum Vorauszahlungen von **${euro(d.vorauszahlung)}** geleistet.`;
  if (d.unbezahlteVorauszahlung > 0.005)
    vorText += ` Vereinbart waren Vorauszahlungen von ${euro(d.vorauszahlung + d.unbezahlteVorauszahlung)}; die nicht gezahlten ${euro(d.unbezahlteVorauszahlung)} sind mit dieser Abrechnung ausgeglichen und kein offener Rückstand mehr.`;
  inhalt.push({ art: "absatz", text: vorText });

  if (nachzahlung) {
    const kontoText = d.konto?.iban ? `auf das Konto von ${d.konto.inhaber}, IBAN ${vierer(d.konto.iban)}` : "auf das Mietkonto";
    inhalt.push({
      art: "absatz",
      text:
        `Bitte überweisen Sie die **Nachzahlung von ${euro(betrag)}**${d.frist ? ` bis zum **${datumText(d.frist)}**` : ""} ${kontoText}, mit dem Verwendungszweck „${verwendungszweck}“.` +
        (d.zahlungsweg === "BEHOERDE" ? " Wenn Sie Leistungen für die Kosten der Unterkunft erhalten, reichen Sie diese Abrechnung bitte bei Ihrem Jobcenter bzw. Sozialamt ein." : ""),
    });
  } else if (guthaben) {
    inhalt.push({
      art: "absatz",
      text:
        `Das **Guthaben von ${euro(betrag)}** überweise ich Ihnen auf das Konto, von dem Ihre Mietzahlungen bei mir eingehen. Soll ich ein anderes Konto verwenden, teilen Sie mir dies bitte mit.` +
        (d.zahlungsweg === "BEHOERDE" ? " Bitte beachten Sie, dass Sie ein Guthaben bei Bezug von Leistungen dem Jobcenter bzw. Sozialamt mitteilen müssen." : ""),
    });
  }

  inhalt.push({
    art: "absatz",
    text:
      "Die Belege zu dieser Abrechnung können Sie nach Terminabsprache einsehen. Einwendungen gegen die Abrechnung können Sie innerhalb von zwölf Monaten nach Zugang dieses Schreibens erheben (§ 556 Abs. 3 BGB).",
  });

  const fuss = d.konto?.iban
    ? [d.konto.inhaber, d.konto.bank, `IBAN ${vierer(d.konto.iban)}`, d.konto.bic ? `BIC ${d.konto.bic}` : null].filter(Boolean).join(" · ")
    : undefined;

  return {
    absenderZeile: `${d.absender.name} · ${d.absender.anschriftZeile}`,
    kontakt: { email: d.absender.email, telefon: d.absender.telefon },
    fuss,
    empfaenger: [...empfaengerZeilen(d.mieter), ...d.empfaengerAnschrift],
    ort: d.absender.ort,
    datum: datumText(d.datum),
    betreff: [
      `Betriebskostenabrechnung ${d.jahr}${nachzahlung ? ` und Nachzahlung über ${euro(betrag)}` : guthaben ? ` und Guthaben über ${euro(betrag)}` : ""}`,
      `Mietobjekt: ${d.objektAnschrift}, Wohnung ${d.wohnung}${ganzesJahr ? "" : ` (Mietzeit ${datumText(d.zeitraumVon)} – ${datumText(d.zeitraumBis)})`}`,
    ],
    anrede: briefAnrede(d.mieter),
    inhalt,
    rueckfragen: "Für Rückfragen stehe ich Ihnen gern zur Verfügung; meine Kontaktdaten stehen oben rechts.",
    unterschrift: d.absender.name,
  };
}
