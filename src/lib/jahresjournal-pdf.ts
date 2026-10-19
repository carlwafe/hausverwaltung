// PDF des Jahresberichts Kontoführung (A4 quer, pdf-lib ohne zusätzliche Schriftarten). Aufbau nach
// den Mindestanforderungen an eine Einnahmen-/Ausgabenabrechnung mit Kontoständen (Anfangs- und
// Endbestand, Gegenüberstellung der Bewegungen, Abstimmung mit den Kontoauszügen) — siehe CLAUDE.md,
// Abschnitt „Jahresbericht Kontoführung“.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import type { Jahresjournal } from "@/lib/jahresjournal";

export const B = 841.89; // A4 quer
export const H = 595.28;
export const RAND = 30;
export const NUTZBREITE = B - 2 * RAND;
const OBEN = H - 52; // erste Schreibzeile unter dem Seitenkopf
const UNTEN = 42; // darunter beginnt die Fußzeile

export const SCHWARZ = rgb(0, 0, 0);
export const GRAU = rgb(0.4, 0.4, 0.4);
export const HELLGRAU = rgb(0.93, 0.93, 0.93);
export const LINIE = rgb(0.8, 0.8, 0.8);
export const ROT = rgb(0.7, 0.1, 0.1);
export const GRUEN = rgb(0.1, 0.45, 0.2);

export const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];

const zahlFormat = new Intl.NumberFormat("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const euro = (n: number) => zahlFormat.format(Math.abs(n) < 0.005 ? 0 : n);
export const datum = (d: Date) =>
  `${String(d.getUTCDate()).padStart(2, "0")}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${d.getUTCFullYear()}`;
export const datumKurz = (d: Date) => datum(d).slice(0, 6) + String(d.getUTCFullYear()).slice(2);

export type Spalte = { titel: string; w: number; rechts?: boolean; maxZeilen?: number; ersteZeileFett?: boolean };
export type Zeile = {
  cells: string[];
  fett?: boolean;
  fill?: RGB;
  farbe?: RGB;
  // Diese Zeile bleibt mit den nächsten N Zeilen auf einer Seite (Monatskopf nicht allein am Seitenende).
  halteMitNaechsten?: number;
  // Erste Zeile der Zelle dieser Spalte fett (Gegenpartei über dem Verwendungszweck).
  ersteZeileFettSpalte?: number;
  linieOben?: boolean;
  // Überschriftzeile über die ganze Breite (statt Spalten), mit Einzug in pt.
  spanText?: string;
  spanEinzug?: number;
};

export class Bericht {
  readonly doc: PDFDocument;
  readonly normal: PDFFont;
  readonly fett: PDFFont;
  private zeichensatz: Set<number>;
  seiten: PDFPage[] = [];
  seite!: PDFPage;
  y = OBEN;

  constructor(doc: PDFDocument, normal: PDFFont, fett: PDFFont, private kopfLinks: string, private kopfRechts: string) {
    this.doc = doc;
    this.normal = normal;
    this.fett = fett;
    this.zeichensatz = new Set(normal.getCharacterSet());
    this.neueSeite();
  }

  /** Ersetzt Zeichen, die die Standardschrift nicht kennt (Zeilenumbrüche, Sonderzeichen aus Bankdaten). */
  sicher(s: string): string {
    let aus = "";
    for (const ch of s.normalize("NFC")) {
      const cp = ch.codePointAt(0)!;
      if (this.zeichensatz.has(cp)) {
        aus += ch;
        continue;
      }
      if (cp === 0x2212) aus += "-";
      else if (/\s/.test(ch)) aus += " ";
      else {
        const basis = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
        aus += basis && this.zeichensatz.has(basis.codePointAt(0)!) ? basis : "?";
      }
    }
    return aus;
  }

  breite(s: string, groesse: number, fett = false): number {
    return (fett ? this.fett : this.normal).widthOfTextAtSize(s, groesse);
  }

  neueSeite() {
    this.seite = this.doc.addPage([B, H]);
    this.seiten.push(this.seite);
    this.y = OBEN;
    this.text(this.kopfLinks, RAND, H - 26, { groesse: 8, farbe: GRAU });
    this.text(this.kopfRechts, B - RAND, H - 26, { groesse: 8, farbe: GRAU, rechts: true, fett: true });
    this.seite.drawLine({ start: { x: RAND, y: H - 33 }, end: { x: B - RAND, y: H - 33 }, thickness: 0.5, color: LINIE });
  }

  text(s: string, x: number, y: number, o: { groesse?: number; fett?: boolean; farbe?: RGB; rechts?: boolean } = {}) {
    const groesse = o.groesse ?? 8;
    const t = this.sicher(s);
    const schrift = o.fett ? this.fett : this.normal;
    const xx = o.rechts ? x - schrift.widthOfTextAtSize(t, groesse) : x;
    this.seite.drawText(t, { x: xx, y, size: groesse, font: schrift, color: o.farbe ?? SCHWARZ });
  }

  /** Bricht Text auf die Breite um (feste Umbrüche „\n“ bleiben), kürzt nach maxZeilen mit „...“. */
  umbrechen(s: string, groesse: number, maxBreite: number, maxZeilen: number, fettErste = false): string[] {
    const zeilen: string[] = [];
    let abgeschnitten = false;
    const absaetze = s.split("\n").map((t) => this.sicher(t));
    for (let a = 0; a < absaetze.length; a++) {
      const fettHier = fettErste && a === 0;
      const worte = absaetze[a].split(" ").filter(Boolean);
      let aktuell = "";
      const schieb = () => {
        if (aktuell) zeilen.push(aktuell);
        aktuell = "";
      };
      for (let wort of worte) {
        // Sehr lange Wörter (IBAN, Referenznummern) hart umbrechen.
        while (this.breite(wort, groesse, fettHier) > maxBreite) {
          let n = wort.length;
          while (n > 1 && this.breite(wort.slice(0, n), groesse, fettHier) > maxBreite) n--;
          if (aktuell) schieb();
          zeilen.push(wort.slice(0, n));
          wort = wort.slice(n);
        }
        const probe = aktuell ? `${aktuell} ${wort}` : wort;
        if (this.breite(probe, groesse, fettHier) <= maxBreite) aktuell = probe;
        else {
          schieb();
          aktuell = wort;
        }
      }
      schieb();
      if (!worte.length && absaetze[a] === "" && a < absaetze.length - 1) zeilen.push("");
    }
    if (zeilen.length > maxZeilen) {
      abgeschnitten = true;
      zeilen.length = maxZeilen;
    }
    if (abgeschnitten) {
      let letzte = zeilen[maxZeilen - 1];
      while (letzte.length > 1 && this.breite(`${letzte}...`, groesse) > maxBreite) letzte = letzte.slice(0, -1);
      zeilen[maxZeilen - 1] = `${letzte}...`;
    }
    return zeilen.length ? zeilen : [""];
  }

  platz(h: number, nachUmbruch?: () => void) {
    if (this.y - h < UNTEN) {
      this.neueSeite();
      nachUmbruch?.();
    }
  }

  abstand(h: number) {
    this.y -= h;
  }

  titel(s: string, groesse = 11) {
    this.platz(groesse + 14);
    this.text(s, RAND, this.y - groesse, { groesse, fett: true });
    this.y -= groesse + 6;
  }

  absatz(s: string, o: { groesse?: number; farbe?: RGB; breite?: number } = {}) {
    const groesse = o.groesse ?? 8;
    const zeilen = this.umbrechen(s, groesse, o.breite ?? NUTZBREITE, 40);
    for (const z of zeilen) {
      this.platz(groesse + 3);
      this.text(z, RAND, this.y - groesse, { groesse, farbe: o.farbe ?? SCHWARZ });
      this.y -= groesse + 2.5;
    }
  }

  /** Tabelle mit wiederholtem Kopf nach Seitenumbruch; optional „Übertrag“-Zeile (laufender Saldo). */
  tabelle(
    spalten: Spalte[],
    zeilen: Zeile[],
    o: { groesse?: number; uebertrag?: { labelSpalte: number; wertSpalte: number } } = {},
  ) {
    const g = o.groesse ?? 7;
    const zeilenHoehe = g + 1.4;
    const xs: number[] = [];
    let x = RAND;
    for (const s of spalten) {
      xs.push(x);
      x += s.w;
    }
    const gesamt = x - RAND;
    let letzterSaldo = "";

    const zeichneKopf = () => {
      const h = zeilenHoehe + 4;
      this.seite.drawRectangle({ x: RAND, y: this.y - h, width: gesamt, height: h, color: HELLGRAU });
      spalten.forEach((s, i) => {
        const tx = s.rechts ? xs[i] + s.w - 2 : xs[i] + 2;
        this.text(s.titel, tx, this.y - h + 3.5, { groesse: g, fett: true, rechts: s.rechts });
      });
      this.y -= h;
    };
    const zeichneUebertrag = () => {
      if (!o.uebertrag || !letzterSaldo) return;
      const h = zeilenHoehe + 3;
      this.text("Übertrag", xs[o.uebertrag.labelSpalte] + 2, this.y - g - 1.5, { groesse: g, farbe: GRAU });
      const sp = spalten[o.uebertrag.wertSpalte];
      this.text(letzterSaldo, xs[o.uebertrag.wertSpalte] + sp.w - 2, this.y - g - 1.5, { groesse: g, farbe: GRAU, rechts: true });
      this.seite.drawLine({ start: { x: RAND, y: this.y - h }, end: { x: RAND + gesamt, y: this.y - h }, thickness: 0.3, color: LINIE });
      this.y -= h;
    };
    const nachUmbruch = () => {
      zeichneKopf();
      zeichneUebertrag();
    };

    this.platz(zeilenHoehe * 3 + 8, undefined);
    zeichneKopf();

    // Vorab umbrechen, damit die Zeilenhöhe feststeht.
    const vorbereitet = zeilen.map((z) => {
      if (z.spanText !== undefined) return { z, zellen: [] as string[][], h: zeilenHoehe + 4 };
      const zellen = z.cells.map((c, i) => {
        const sp = spalten[i];
        const fettErste = !!sp.ersteZeileFett && z.ersteZeileFettSpalte === i;
        return this.umbrechen(c ?? "", g, sp.w - 4, sp.maxZeilen ?? 1, fettErste);
      });
      const n = Math.max(...zellen.map((c) => c.length), 1);
      return { z, zellen, h: n * zeilenHoehe + 3 };
    });

    for (let r = 0; r < vorbereitet.length; r++) {
      const { z, zellen, h } = vorbereitet[r];
      let benoetigt = h;
      for (let k = 1; k <= (z.halteMitNaechsten ?? 0) && r + k < vorbereitet.length; k++) benoetigt += vorbereitet[r + k].h;
      this.platz(benoetigt, nachUmbruch);

      if (z.fill) this.seite.drawRectangle({ x: RAND, y: this.y - h, width: gesamt, height: h, color: z.fill });
      if (z.linieOben) this.seite.drawLine({ start: { x: RAND, y: this.y }, end: { x: RAND + gesamt, y: this.y }, thickness: 0.6, color: GRAU });
      if (z.spanText !== undefined) {
        this.text(z.spanText, RAND + 2 + (z.spanEinzug ?? 0), this.y - g - 2, { groesse: g, fett: true, farbe: z.farbe });
      }
      zellen.forEach((zeilenText, i) => {
        const sp = spalten[i];
        zeilenText.forEach((t, li) => {
          const fettHier = !!z.fett || (!!sp.ersteZeileFett && z.ersteZeileFettSpalte === i && li === 0);
          const tx = sp.rechts ? xs[i] + sp.w - 2 : xs[i] + 2;
          this.text(t, tx, this.y - g - 1.2 - li * zeilenHoehe, { groesse: g, fett: fettHier, farbe: z.farbe, rechts: sp.rechts });
        });
      });
      this.seite.drawLine({ start: { x: RAND, y: this.y - h }, end: { x: RAND + gesamt, y: this.y - h }, thickness: 0.3, color: LINIE });
      this.y -= h;
      if (o.uebertrag) {
        const wert = z.cells[o.uebertrag.wertSpalte];
        if (wert) letzterSaldo = wert;
      }
    }
  }

  fusszeilen(erstellt: Date) {
    const n = this.seiten.length;
    const zeit = `${datum(erstellt)} ${String(erstellt.getUTCHours()).padStart(2, "0")}:${String(erstellt.getUTCMinutes()).padStart(2, "0")} UTC`;
    this.seiten.forEach((p, i) => {
      p.drawLine({ start: { x: RAND, y: 32 }, end: { x: B - RAND, y: 32 }, thickness: 0.5, color: LINIE });
      p.drawText(this.sicher(`Erstellt am ${zeit} aus dem Buchungsjournal. Spätere Änderungen sind nicht enthalten.`), {
        x: RAND,
        y: 20,
        size: 7,
        font: this.normal,
        color: GRAU,
      });
      const s = this.sicher(`Seite ${i + 1} von ${n}`);
      p.drawText(s, { x: B - RAND - this.normal.widthOfTextAtSize(s, 7), y: 20, size: 7, font: this.normal, color: GRAU });
    });
  }
}

function zeichneFortschreibung(b: Bericht, d: Jahresjournal, ueberschrift: string) {
  const jahr = d.jahr;
  const von = `01.01.${jahr}`;
  const bis = `31.12.${jahr}`;
  const zwischenstand = istZwischenstand(jahr);
  const endeLabel = zwischenstand ? "Kontostand nach der letzten Buchung (Jahr noch nicht abgeschlossen)" : `Kontostand am ${bis} (Endbestand)`;
  b.titel(ueberschrift);
  const fort: Zeile[] = [
    { cells: [`Kontostand am ${von} (Anfangsbestand)`, euro(d.anfangsbestand)], fett: true },
    { cells: [`+ Einnahmen (${d.zeilen.filter((z) => z.betrag >= 0).length} Buchungen)`, euro(d.einnahmen)] },
    { cells: [`- Ausgaben (${d.zeilen.filter((z) => z.betrag < 0).length} Buchungen)`, euro(d.ausgaben)] },
    { cells: [endeLabel, euro(d.endbestand)], fett: true, fill: HELLGRAU, linieOben: true },
  ];
  b.tabelle([{ titel: "Position", w: 400 }, { titel: "Betrag in EUR", w: 110, rechts: true }], fort, { groesse: 8.5 });
  b.abstand(4);
  const probeOk = Math.abs(d.rechenprobeDifferenz) < 0.005;
  b.absatz(
    probeOk
      ? `Rechenprobe bestanden: Der Endbestand aus Anfangsbestand und Journal (${euro(d.endbestand)} EUR) stimmt mit dem unabhängig berechneten Kontostand zum ${bis} überein.`
      : `ACHTUNG Rechenprobe: Anfangsbestand + Journal = ${euro(d.endbestand)} EUR, unabhängig berechneter Kontostand = ${euro(d.endbestandUnabhaengig)} EUR (Differenz ${euro(d.rechenprobeDifferenz)} EUR).`,
    { farbe: probeOk ? GRUEN : ROT },
  );
  b.absatz(
    `Herkunft des Anfangsbestands: Referenz-Kontostand vom ${datum(d.anker.datum)} (${euro(d.anker.betrag)} EUR, vom Kontoauszug abgelesen), ` +
      "fortgeschrieben bzw. zurückgerechnet mit allen Buchungen bis zum Jahresanfang.",
    { farbe: GRAU },
  );
}

function zeichneAbstimmung(b: Bericht, d: Jahresjournal, ueberschrift: string) {
  const jahr = d.jahr;
  const bis = `31.12.${jahr}`;
  b.titel(ueberschrift);
  if (d.kontrollen.length === 0 && !d.verifikation) {
    b.absatz(
      "Für dieses Jahr sind keine Kontostände aus Kontoauszügen hinterlegt – der Endbestand ist rein rechnerisch aus dem Journal ermittelt. " +
        "Empfehlung: den Kontostand laut Kontoauszug zum 31.12. unter „Kontostand → Kontostand prüfen“ eintragen.",
      { farbe: ROT },
    );
  } else {
    const kz: Zeile[] = d.kontrollen.map((k) => ({
      cells: [
        `Kontostand ${datum(k.datum)}`,
        euro(k.bank),
        euro(k.berechnet),
        euro(k.differenz),
        Math.abs(k.differenz) < 0.005 ? "stimmt" : "Abweichung",
        k.notiz ?? "",
      ],
      farbe: Math.abs(k.differenz) < 0.005 ? undefined : ROT,
    }));
    if (d.verifikation) {
      kz.push({
        cells: [
          `Endbestand ${bis} (Verifikation)`,
          euro(d.verifikation.bank),
          euro(d.verifikation.berechnet),
          euro(d.verifikation.differenz),
          Math.abs(d.verifikation.differenz) < 0.005 ? "stimmt" : "Abweichung",
          "laut Kontenabgleich der Jahresübersicht",
        ],
        farbe: Math.abs(d.verifikation.differenz) < 0.005 ? undefined : ROT,
      });
    }
    b.tabelle(
      [
        { titel: "Stichtag", w: 170 },
        { titel: "Laut Kontoauszug", w: 100, rechts: true },
        { titel: "Laut Journal", w: 100, rechts: true },
        { titel: "Differenz", w: 80, rechts: true },
        { titel: "Ergebnis", w: 70 },
        { titel: "Notiz", w: 260, maxZeilen: 2 },
      ],
      kz,
      { groesse: 8 },
    );
  }
}

export const istZwischenstand = (jahr: number) => Date.now() < Date.UTC(jahr, 11, 31, 23, 59, 59);

export async function erzeugeJahresjournalPdf(d: Jahresjournal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const jahr = d.jahr;
  const kopfLinks = d.objekt ? `${d.objekt.name} · ${d.objekt.adresse}` : "";
  // Läuft das Jahr noch, ist der „Endbestand“ nur ein Zwischenstand nach der letzten gebuchten Bewegung.
  const zwischenstand = istZwischenstand(jahr);
  const b = new Bericht(doc, normal, fett, kopfLinks, `Jahresbericht Kontoführung ${jahr}${zwischenstand ? " (Zwischenstand)" : ""}`);

  const von = `01.01.${jahr}`;
  const bis = `31.12.${jahr}`;

  // ───────────── Seite 1: Übersicht ─────────────
  b.text(`Jahresbericht Kontoführung ${jahr}`, RAND, b.y - 16, { groesse: 18, fett: true });
  b.y -= 24;
  b.absatz(
    `Alle Kontobewegungen des Mietkontos vom ${von} bis ${bis} (Zu- und Abflüsse nach Buchungsdatum) mit fortlaufendem Kontostand. ` +
      "Die Summen dieser Übersicht lassen sich Zeile für Zeile im Journal ab Seite 3 nachvollziehen.",
    { groesse: 9, farbe: GRAU },
  );
  b.abstand(8);

  zeichneFortschreibung(b, d, "1  Kontostand-Fortschreibung");
  b.abstand(10);

  b.titel("2  Bewegungen nach Buchungsart");
  const artZeilen: Zeile[] = d.arten.map((a) => ({
    cells: [
      a.art,
      a.eurRelevant === null ? "offen" : a.eurRelevant ? "ja" : "nein (durchlaufend)",
      String(a.anzahl),
      euro(a.einnahmen),
      euro(a.ausgaben),
      euro(a.saldo),
    ],
  }));
  artZeilen.push({
    cells: ["Summe", "", String(d.zeilen.length), euro(d.einnahmen), euro(d.ausgaben), euro(d.einnahmen + d.ausgaben)],
    fett: true,
    fill: HELLGRAU,
    linieOben: true,
  });
  b.tabelle(
    [
      { titel: "Buchungsart", w: 190 },
      { titel: "Ergebnis-wirksam (EÜR)", w: 120 },
      { titel: "Anzahl", w: 50, rechts: true },
      { titel: "Einnahmen", w: 90, rechts: true },
      { titel: "Ausgaben", w: 90, rechts: true },
      { titel: "Saldo", w: 90, rechts: true },
    ],
    artZeilen,
    { groesse: 8 },
  );
  b.abstand(3);
  b.absatz(
    "Ergebnis-wirksam sind Mieten, Nebenkosten-Ausgleich und Kosten (fließen in die Einnahmen-Überschuss-Rechnung ein). " +
      "Durchlaufende Posten (Mietweiterleitung, Darlehenstilgung, Kautionen) bewegen den Kontostand, sind aber weder Einnahme noch Ausgabe im steuerlichen Sinn.",
    { farbe: GRAU },
  );
  b.abstand(10);

  zeichneAbstimmung(b, d, "3  Abstimmung mit den Kontoauszügen");
  b.abstand(8);
  b.absatz(
    d.stornoAnzahl > 0
      ? `Stornierte Buchungen: Im Jahr ${jahr} wurden ${d.stornoAnzahl} Buchungen storniert (Original + Gegenbuchung mit dem Datum der Originalbuchung, Summe 0,00 EUR). ` +
          (d.stornos
            ? "Sie sind im Anhang einzeln aufgeführt und im Journal nicht enthalten."
            : "Sie sind im Journal nicht enthalten, weil sie den Kontostand nicht verändern.")
      : "Es wurden keine Buchungen storniert.",
    { farbe: GRAU },
  );

  // ───────────── Seite 2: Monatsübersicht ─────────────
  b.neueSeite();
  b.titel("4  Monatsübersicht");
  const kontrollNachMonat = new Map<number, string>();
  for (const k of d.kontrollen) kontrollNachMonat.set(k.datum.getUTCMonth() + 1, `${datumKurz(k.datum)}: ${euro(k.bank)}`);
  const monatsZeilen: Zeile[] = d.monate.map((m) => ({
    cells: [MONATE[m.monat - 1], euro(m.anfang), euro(m.einnahmen), euro(m.ausgaben), euro(m.ende), String(m.anzahl), kontrollNachMonat.get(m.monat) ?? ""],
  }));
  monatsZeilen.push({
    cells: ["Jahr", euro(d.anfangsbestand), euro(d.einnahmen), euro(d.ausgaben), euro(d.endbestand), String(d.zeilen.length), ""],
    fett: true,
    fill: HELLGRAU,
    linieOben: true,
  });
  b.tabelle(
    [
      { titel: "Monat", w: 90 },
      { titel: "Kontostand Monatsanfang", w: 120, rechts: true },
      { titel: "Einnahmen", w: 100, rechts: true },
      { titel: "Ausgaben", w: 100, rechts: true },
      { titel: "Kontostand Monatsende", w: 120, rechts: true },
      { titel: "Buchungen", w: 70, rechts: true },
      { titel: "Kontoauszug (Kontrollwert)", w: 182 },
    ],
    monatsZeilen,
    { groesse: 8.5 },
  );
  b.abstand(14);
  b.titel("5  So ist der Bericht aufgebaut und zu lesen");
  const hinweise = [
    "Grundlage: Einnahmen-/Ausgabenrechnung nach dem Zu- und Abflussprinzip (§ 11 EStG). Maßgeblich ist das Datum der Kontobewegung, nicht die Mietperiode oder das Kostenjahr.",
    "Kontostand: Anfangsbestand + Einnahmen + Ausgaben = Endbestand. Ausgaben sind mit Minuszeichen dargestellt. Der Endbestand eines Monats ist der Anfangsbestand des Folgemonats, der Endbestand des Jahres der Anfangsbestand des Folgejahres.",
    "Journal (ab Seite 3): Jede Buchung steht in einer Zeile mit laufender Nummer, Datum, Buchungsart, Gegenpartei und Verwendungszweck laut Kontoauszug, fachlicher Zuordnung (Wohnung, Mieter, Kostenart), Betrag und Kontostand nach der Buchung. Je Monat stehen Anfangsstand und Monatssumme; auf jeder Folgeseite beginnt die Tabelle mit dem Übertrag.",
    "Nicht im Journal: Buchungen ohne Geldfluss (z. B. Gebührenforderungen, Kautionseinbehalte, Verrechnungen) – sie ändern den Kontostand nicht. Sie erscheinen in den Mieterkonten und der Jahresübersicht.",
    "Buchungen sind unveränderlich: Korrekturen erfolgen durch Storno und Neuanlage. Das Journal zeigt nur die gültigen Buchungen; Storno-Paare heben sich auf.",
  ];
  for (const h of hinweise) {
    b.absatz(`•  ${h}`, { groesse: 8.5, breite: NUTZBREITE - 8 });
    b.abstand(2);
  }

  // ───────────── Journal ─────────────
  b.neueSeite();
  b.titel(`6  Journal ${jahr} – alle Buchungen`);
  const spalten: Spalte[] = [
    { titel: "Nr.", w: 28 },
    { titel: "Datum", w: 48 },
    { titel: "Art", w: 70 },
    { titel: "Gegenpartei / Verwendungszweck", w: 284, maxZeilen: 3, ersteZeileFett: true },
    { titel: "Zuordnung", w: 160, maxZeilen: 2 },
    { titel: "Einnahmen", w: 62, rechts: true },
    { titel: "Ausgaben", w: 62, rechts: true },
    { titel: "Kontostand", w: 68, rechts: true },
  ];
  const jz: Zeile[] = [];
  d.monate.forEach((m) => {
    const imMonat = d.zeilen.filter((z) => z.datum.getUTCMonth() === m.monat - 1);
    jz.push({
      cells: ["", "", "", `${MONATE[m.monat - 1]} ${jahr}`, "Kontostand Monatsanfang", "", "", euro(m.anfang)],
      fett: true,
      fill: HELLGRAU,
      halteMitNaechsten: 2,
    });
    if (imMonat.length === 0) jz.push({ cells: ["", "", "", "Keine Buchungen", "", "", "", ""], farbe: GRAU });
    for (const z of imMonat) {
      const hatName = z.gegenpartei !== "";
      jz.push({
        cells: [
          String(z.nr),
          datumKurz(z.datum),
          z.art,
          hatName ? `${z.gegenpartei}\n${z.zweck}` : z.zweck,
          z.zuordnung,
          z.betrag >= 0 ? euro(z.betrag) : "",
          z.betrag < 0 ? euro(z.betrag) : "",
          euro(z.kontostand),
        ],
        ersteZeileFettSpalte: hatName ? 3 : undefined,
      });
    }
    jz.push({
      cells: ["", "", "", `Summe ${MONATE[m.monat - 1]} (${m.anzahl} Buchungen)`, "Kontostand Monatsende", euro(m.einnahmen), euro(m.ausgaben), euro(m.ende)],
      fett: true,
      linieOben: true,
    });
  });
  b.tabelle(spalten, jz, { groesse: 6.8, uebertrag: { labelSpalte: 3, wertSpalte: 7 } });

  // ───────────── Anhang: stornierte Buchungen ─────────────
  if (d.stornos) {
    b.neueSeite();
    b.titel(`7  Anhang: stornierte Buchungen ${jahr}`);
    b.absatz(
      "Gegenbuchungen tragen das Datum der Originalbuchung und heben sie auf; der Kontostand ändert sich dadurch nicht. Aufgeführt ist je Storno die ursprüngliche Buchung.",
      { farbe: GRAU },
    );
    b.abstand(4);
    const sz: Zeile[] = d.stornos.map((s) => ({
      cells: [
        datumKurz(s.datum),
        s.art,
        s.gegenpartei ? `${s.gegenpartei}\n${s.zweck}` : s.zweck,
        euro(s.betrag),
        "",
        s.storniertAm ? datumKurz(s.storniertAm) : "",
        s.storniertVon ?? "",
      ],
      ersteZeileFettSpalte: s.gegenpartei ? 2 : undefined,
    }));
    b.tabelle(
      [
        { titel: "Datum", w: 48 },
        { titel: "Art", w: 80 },
        { titel: "Gegenpartei / Verwendungszweck", w: 360, maxZeilen: 3, ersteZeileFett: true },
        { titel: "Betrag", w: 70, rechts: true },
        { titel: "", w: 12 },
        { titel: "Storniert am", w: 70 },
        { titel: "Storniert von", w: 142 },
      ],
      sz,
      { groesse: 6.8 },
    );
  }

  b.fusszeilen(new Date());
  doc.setTitle(`Jahresbericht Kontoführung ${jahr}`);
  doc.setSubject(d.objekt ? `${d.objekt.name} · ${d.objekt.adresse}` : "");
  doc.setProducer("Mietverwaltung Eutin");
  doc.setCreator("Mietverwaltung Eutin");
  return doc.save();
}
