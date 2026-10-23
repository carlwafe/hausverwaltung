// Schreiben an Mieter als PDF im Layout „klar“ (CLAUDE.md, Abschnitt „Schreiben (Optik; Entscheidung 20.10.2026)“;
// Vorlage für Word: scripts-tmp/schreiben/schreiben-vorlage.js). Maße und Abstände sind dort abgelesen:
// A4, Arial 10,5 pt (hier die metrisch gleiche, eingebettete Arimo), Zeilenabstand 1,25, Ränder links 25 / rechts 20 /
// oben 15 / unten 20 mm, kein Briefkopf, Absenderzeile + Anschriftfeld ab 49 mm (mittig im Fenster), Informationsblock rechts,
// Tabellen ohne Gitter mit hellen Trennlinien, Fußzeile mit Kontoverbindung (Seite 1) und „Seite x von y“.
// Reine Funktionen ohne Prisma (auch per tsx aus Skripten nutzbar).
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { ARIMO_BOLD_WOFF_BASE64, ARIMO_REGULAR_WOFF_BASE64 } from "./schreiben-schrift";

const MM = 72 / 25.4;
const mm = (v: number) => v * MM;
const SEITE_B = 595.28;
const SEITE_H = 841.89;
const RAND_LI = mm(25);
const RAND_RE = mm(20);
const RAND_OBEN = mm(15);
const RAND_UNTEN = mm(20);
export const TEXTBREITE = SEITE_B - RAND_LI - RAND_RE;

const GROESSE = 10.5;
const EINZEL = 1.149; // Zeilenhöhe der Schrift (Arial) in Vielfachen der Schriftgröße
const ZEILE = GROESSE * EINZEL * 1.25; // Zeilenabstand 1,25 (Fließtext)
const ZEILE_TABELLE = GROESSE * EINZEL * 1.15;
const DESCENT = 0.212;

const SCHWARZ = rgb(0, 0, 0);
const GRAU = rgb(0x59 / 255, 0x59 / 255, 0x59 / 255);
const HELLGRAU = rgb(0xd0 / 255, 0xd0 / 255, 0xd0 / 255);

export type TabellenZeile = {
  /** Texte je Spalte (Zweispaltig: [Text, Betrag]); `**fett**` ist möglich. */
  zellen: string[];
  /** Summenzeile: fett, schwarze Linie darüber. */
  summe?: boolean;
  /** Kopfzeile: klein, grau, fett, schwarze Linie darunter. */
  kopf?: boolean;
  /** Zwischenüberschrift über die ganze Breite (nur zellen[0]), fett. */
  gruppe?: boolean;
  /** Zwischensumme einer Gruppe: fett wie eine Summe, aber nur mit heller Trennlinie. */
  zwischen?: boolean;
};

export type Baustein =
  | { art: "absatz"; text: string; keepNext?: boolean }
  | { art: "ueberschrift"; text: string }
  | {
      art: "tabelle";
      zeilen: TabellenZeile[];
      /** Relative Spaltenbreiten (Summe beliebig); Standard: breite erste Spalte + 1700 Twips (30 mm) rechts. */
      breiten?: number[];
      /** Spalten (0-basiert), die rechtsbündig stehen; Standard: nur die letzte. */
      rechts?: number[];
    };

export type SchreibenInhalt = {
  /** Kleine Absenderzeile über dem Empfänger, z.B. „Julia Katharina Waller · Postfach 130368 · 20103 Hamburg“. */
  absenderZeile: string;
  kontakt?: { email?: string | null; telefon?: string | null };
  /** Fußzeile Seite 1 (Kontoverbindung), eine Zeile. */
  fuss?: string;
  empfaenger: string[];
  ort?: string;
  datum: string;
  betreff: [string, string?];
  anrede: string;
  inhalt: Baustein[];
  rueckfragen?: string;
  gruss?: string;
  unterschrift: string;
  /** Optional: Anlage auf einer eigenen Seite nach der Unterschrift (Überschrift, graue Zeile darunter, Bausteine). */
  anlage?: { titel: string; untertitel?: string; inhalt: Baustein[] };
};

type Lauf = { text: string; fett: boolean };

type Item = {
  before: number;
  h: number;
  after: number;
  keepNext: boolean;
  draw: (seite: PDFPage, oben: number) => void;
  /** Beginnt eine neue Seite (Anlage). */
  seitenumbruchVor?: boolean;
  /** Kopfzeile der Tabelle, die nach einem Seitenumbruch mitten in der Tabelle wiederholt wird. */
  kopf?: Item;
  /** Zeile einer Tabelle (zur Erkennung eines Umbruchs mitten in der Tabelle). */
  tabelleId?: number;
};

type Schriften = { normal: PDFFont; fett: PDFFont; zeichen: Set<number> };

function sicher(s: Schriften, text: string): string {
  let aus = "";
  for (const ch of text.normalize("NFC")) {
    const cp = ch.codePointAt(0)!;
    if (s.zeichen.has(cp)) aus += ch;
    else if (cp === 0x2212) aus += "–";
    else if (/\s/.test(ch)) aus += " ";
    else {
      const basis = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
      aus += basis && s.zeichen.has(basis.codePointAt(0)!) ? basis : "?";
    }
  }
  return aus;
}

const laeufe = (s: Schriften, text: string, fettBasis = false): Lauf[] =>
  sicher(s, text)
    .split("**")
    .map((t, i) => ({ text: t, fett: fettBasis || i % 2 === 1 }))
    .filter((l) => l.text);

const breite = (s: Schriften, text: string, groesse: number, fett: boolean) => (fett ? s.fett : s.normal).widthOfTextAtSize(text, groesse);

/** Ein Wort besteht aus Segmenten (normal/fett), zwischen Wörtern steht genau ein Leerzeichen — so bleibt „**270,95 €**.“ zusammen. */
type Wort = Lauf[];

const wortBreite = (s: Schriften, w: Wort, groesse: number) => w.reduce((sum, seg) => sum + breite(s, seg.text, groesse, seg.fett), 0);

/** Bricht Läufe (normal/fett) auf die Breite um; Rückgabe: Zeilen aus Wörtern. */
function umbrechen(s: Schriften, runs: Lauf[], groesse: number, maxB: number): Wort[][] {
  const raum = s.normal.widthOfTextAtSize(" ", groesse);
  const worte: Wort[] = [];
  let aktuellesWort: Wort = [];
  for (const r of runs) {
    for (const teil of r.text.split(/( +)/)) {
      if (teil === "") continue;
      if (/^ +$/.test(teil)) {
        if (aktuellesWort.length) worte.push(aktuellesWort);
        aktuellesWort = [];
      } else aktuellesWort.push({ text: teil, fett: r.fett });
    }
  }
  if (aktuellesWort.length) worte.push(aktuellesWort);
  const zeilen: Wort[][] = [];
  let aktuell: Wort[] = [];
  let b = 0;
  for (const w of worte) {
    const wb = wortBreite(s, w, groesse);
    const neu = aktuell.length ? b + raum + wb : wb;
    if (aktuell.length && neu > maxB) {
      zeilen.push(aktuell);
      aktuell = [w];
      b = wb;
    } else {
      aktuell.push(w);
      b = neu;
    }
  }
  if (aktuell.length) zeilen.push(aktuell);
  return zeilen.length ? zeilen : [[]];
}

function zeichneZeile(s: Schriften, seite: PDFPage, zeile: Wort[], x: number, grundlinie: number, groesse: number, farbe = SCHWARZ, rechtsBis?: number) {
  const raum = s.normal.widthOfTextAtSize(" ", groesse);
  const gesamt = zeile.reduce((sum, w, i) => sum + wortBreite(s, w, groesse) + (i ? raum : 0), 0);
  let xx = rechtsBis !== undefined ? rechtsBis - gesamt : x;
  zeile.forEach((w, i) => {
    if (i) xx += raum;
    for (const seg of w) {
      seite.drawText(seg.text, { x: xx, y: grundlinie, size: groesse, font: seg.fett ? s.fett : s.normal, color: farbe });
      xx += breite(s, seg.text, groesse, seg.fett);
    }
  });
}

function absatzItem(s: Schriften, text: string, o: { before?: number; after?: number; keepNext?: boolean; fett?: boolean; groesse?: number; zeile?: number; farbe?: typeof SCHWARZ } = {}): Item {
  const groesse = o.groesse ?? GROESSE;
  const lh = o.zeile ?? ZEILE;
  const zeilen = umbrechen(s, laeufe(s, text, o.fett), groesse, TEXTBREITE);
  return {
    before: o.before ?? 0,
    after: o.after ?? 8,
    keepNext: o.keepNext ?? false,
    h: zeilen.length * lh,
    draw: (seite, oben) =>
      zeilen.forEach((z, i) => zeichneZeile(s, seite, z, RAND_LI, oben - (i + 1) * lh + groesse * DESCENT, groesse, o.farbe)),
  };
}

let tabellenZaehler = 0;

function tabelleItems(s: Schriften, b: Extract<Baustein, { art: "tabelle" }>): Item[] {
  const id = ++tabellenZaehler;
  const spalten = b.zeilen.reduce((m, z) => Math.max(m, z.gruppe ? 1 : z.zellen.length), 1);
  const rel = b.breiten ?? (spalten === 2 ? [TEXTBREITE - mm(30), mm(30)] : Array(spalten).fill(1));
  const summeRel = rel.reduce((a, c) => a + c, 0);
  const w = rel.map((r) => (r / summeRel) * TEXTBREITE);
  const rechts = new Set(b.rechts ?? [spalten - 1]);
  const PAD_X = 3;
  const EINZUG_LINKS = 9; // linksbündige Spalten neben einer rechtsbündigen: etwas Abstand zur Zahl davor
  const PAD_Y = 3.5;

  // Kurze Tabellen bleiben ganz zusammen (rutschen auf die nächste Seite); lange (mehr als 10 Zeilen) dürfen umbrechen,
  // dann bleiben Kopf + erste Zeilen und die letzten Zeilen samt Summe zusammen, und die Kopfzeile wird wiederholt.
  const n = b.zeilen.length;
  const teilbar = n > 10;
  const items: Item[] = b.zeilen.map((z, i) => {
    const letzte = i === n - 1;
    const bleibtMitNaechster = !letzte && (!teilbar || i < 2 || i >= n - 3 || !!z.gruppe);
    const groesse = z.kopf ? 9.5 : GROESSE;
    const fett = !!(z.summe || z.kopf || z.gruppe || z.zwischen);
    const farbe = z.kopf ? GRAU : SCHWARZ;
    const breitenZeile = z.gruppe ? [TEXTBREITE] : w;
    const einzug = (k: number) => (!z.gruppe && k > 0 && !rechts.has(k) ? EINZUG_LINKS : 0);
    const zellenZeilen = (z.gruppe ? [z.zellen[0]] : z.zellen).map((t, k) =>
      umbrechen(s, laeufe(s, t, fett), groesse, breitenZeile[k] - 2 * PAD_X - einzug(k)),
    );
    const hoechste = Math.max(...zellenZeilen.map((c) => c.length));
    const h = 2 * PAD_Y + hoechste * ZEILE_TABELLE;
    return {
      before: 0,
      after: letzte ? 18 : 0, // leerer Absatz mit 6 pt Abstand nach der Tabelle, wie in der Vorlage
      keepNext: bleibtMitNaechster,
      h,
      tabelleId: id,
      draw: (seite, oben) => {
        const unten = oben - h;
        if (z.summe) seite.drawLine({ start: { x: RAND_LI, y: oben }, end: { x: RAND_LI + TEXTBREITE, y: oben }, thickness: 1, color: SCHWARZ });
        if (z.kopf) seite.drawLine({ start: { x: RAND_LI, y: unten }, end: { x: RAND_LI + TEXTBREITE, y: unten }, thickness: 1, color: SCHWARZ });
        else if (!z.summe && !letzte)
          seite.drawLine({ start: { x: RAND_LI, y: unten }, end: { x: RAND_LI + TEXTBREITE, y: unten }, thickness: 0.5, color: HELLGRAU });
        let x = RAND_LI;
        zellenZeilen.forEach((zeilen, k) => {
          zeilen.forEach((zeile, n) => {
            const grundlinie = oben - PAD_Y - (n + 1) * ZEILE_TABELLE + groesse * DESCENT;
            if (rechts.has(k) && !z.gruppe) zeichneZeile(s, seite, zeile, x, grundlinie, groesse, farbe, x + breitenZeile[k] - PAD_X);
            else zeichneZeile(s, seite, zeile, x + PAD_X + einzug(k), grundlinie, groesse, farbe);
          });
          x += breitenZeile[k];
        });
      },
    };
  });
  // Kopfzeile (erste Zeile mit kopf) für Umbrüche mitten in einer langen Tabelle merken.
  const kopfIdx = b.zeilen.findIndex((z) => z.kopf);
  if (kopfIdx === 0) for (const it of items.slice(1)) it.kopf = items[0];
  return items;
}

/** Fügt ein Schreiben als neue Seiten an `doc` an (Seitenzahl „x von y“ zählt je Schreiben). */
export function fuegeSchreibenHinzu(doc: PDFDocument, s: Schriften, c: SchreibenInhalt) {
  const seiten: PDFPage[] = [];
  const neueSeite = () => {
    const p = doc.addPage([SEITE_B, SEITE_H]);
    seiten.push(p);
    return p;
  };

  // ----- Inhalt als Liste von Items -----
  const items: Item[] = [];

  // Anschriftfeld: Absenderzeile (7 pt, grau, unterstrichen), Empfänger; rechts Informationsblock.
  const spalteLinks = TEXTBREITE * 0.54;
  const xRechts = RAND_LI + spalteLinks;
  const info: [string, string][] = [
    ["Datum", `${c.ort ? c.ort + ", " : ""}${c.datum}`],
    ...(c.kontakt?.email ? ([["E-Mail", c.kontakt.email]] as [string, string][]) : []),
    ...(c.kontakt?.telefon ? ([["Telefon", c.kontakt.telefon]] as [string, string][]) : []),
  ];
  const absenderZeile = sicher(s, c.absenderZeile);
  items.push({
    before: 0,
    h: Math.max(mm(34), 8.04 + 6 + c.empfaenger.length * ZEILE),
    after: 26, // Betreff beginnt 26 pt darunter
    keepNext: true,
    draw: (seite, oben) => {
      seite.drawText(absenderZeile, { x: RAND_LI, y: oben - 8.04 + 7 * DESCENT, size: 7, font: s.normal, color: GRAU });
      const ub = s.normal.widthOfTextAtSize(absenderZeile, 7);
      seite.drawLine({ start: { x: RAND_LI, y: oben - 8.04 + 7 * DESCENT - 1 }, end: { x: RAND_LI + ub, y: oben - 8.04 + 7 * DESCENT - 1 }, thickness: 0.4, color: GRAU });
      c.empfaenger.forEach((t, i) => {
        const z = umbrechen(s, laeufe(s, t), GROESSE, TEXTBREITE)[0];
        zeichneZeile(s, seite, z, RAND_LI, oben - (8.04 + 6) - (i + 1) * ZEILE + GROESSE * DESCENT, GROESSE);
      });
      info.forEach(([etikett, wert], i) => {
        const lh = 13.2;
        const grundlinie = oben - (i + 1) * lh - i * 2 + 10 * DESCENT;
        seite.drawText(sicher(s, etikett), { x: xRechts, y: grundlinie, size: 8.5, font: s.normal, color: GRAU });
        seite.drawText(sicher(s, wert), { x: xRechts + 50, y: grundlinie, size: 10, font: s.normal, color: SCHWARZ });
      });
    },
  });

  // Betreff: erste Zeile fett 11,5 pt, zweite grau
  items.push(absatzItem(s, c.betreff[0], { fett: true, groesse: 11.5, zeile: 11.5 * EINZEL * 1.2, after: c.betreff[1] ? 0 : 14, keepNext: true }));
  if (c.betreff[1]) items.push(absatzItem(s, c.betreff[1], { before: 2, after: 14, keepNext: true, farbe: GRAU }));
  items.push(absatzItem(s, c.anrede, { keepNext: true }));

  for (const b of c.inhalt) {
    if (b.art === "absatz") items.push(absatzItem(s, b.text, { keepNext: b.keepNext }));
    else if (b.art === "ueberschrift") items.push(absatzItem(s, b.text, { fett: true, before: 6, after: 4, keepNext: true }));
    else items.push(...tabelleItems(s, b));
  }
  items.push(absatzItem(s, c.rueckfragen ?? "Für Rückfragen stehe ich Ihnen gern zur Verfügung; meine Kontaktdaten stehen oben rechts.", { keepNext: true }));
  items.push(absatzItem(s, c.gruss ?? "Mit freundlichen Grüßen", { after: 58, keepNext: true }));
  items.push(absatzItem(s, c.unterschrift, { after: 0 }));

  if (c.anlage) {
    const titel = absatzItem(s, c.anlage.titel, { fett: true, groesse: 11.5, zeile: 11.5 * EINZEL * 1.2, after: c.anlage.untertitel ? 0 : 14, keepNext: true });
    titel.seitenumbruchVor = true;
    items.push(titel);
    if (c.anlage.untertitel) items.push(absatzItem(s, c.anlage.untertitel, { before: 2, after: 14, keepNext: true, farbe: GRAU }));
    for (const b of c.anlage.inhalt) {
      if (b.art === "absatz") items.push(absatzItem(s, b.text, { keepNext: b.keepNext }));
      else if (b.art === "ueberschrift") items.push(absatzItem(s, b.text, { fett: true, before: 6, after: 4, keepNext: true }));
      else items.push(...tabelleItems(s, b));
    }
  }

  // ----- Seitenumbruch (Items mit keepNext bleiben zusammen; Tabellen bleiben ganz, wenn sie auf eine Seite passen) -----
  const obenSeite = SEITE_H - RAND_OBEN;
  const untenGrenze = RAND_UNTEN;
  const seitenHoehe = obenSeite - untenGrenze;
  let seite = neueSeite();
  let y = obenSeite - mm(34); // Platz bis zum Anschriftfeld (Absenderzeile beginnt 49 mm von oben, damit der Block mittig im Briefumschlag-Fenster sitzt)
  let aufSeitenAnfang = false;

  let i = 0;
  while (i < items.length) {
    let j = i;
    while (j < items.length - 1 && items[j].keepNext) j++;
    const gruppe = items.slice(i, j + 1);
    const gruppenHoehe = gruppe.reduce((sum, it, n) => sum + (n === 0 && aufSeitenAnfang ? 0 : it.before) + it.h + (n < gruppe.length - 1 ? it.after : 0), 0);
    if (gruppe[0].seitenumbruchVor && !aufSeitenAnfang) {
      seite = neueSeite();
      y = obenSeite;
      aufSeitenAnfang = true;
    }
    const passt = y - gruppenHoehe >= untenGrenze;
    if (!passt && !aufSeitenAnfang && gruppenHoehe <= seitenHoehe) {
      seite = neueSeite();
      y = obenSeite;
      aufSeitenAnfang = true;
      // Beginnt die Gruppe mitten in einer langen Tabelle, steht deren Kopfzeile wieder oben.
      if (gruppe[0].kopf) {
        gruppe[0].kopf.draw(seite, y);
        y -= gruppe[0].kopf.h;
        aufSeitenAnfang = false;
      }
    }
    for (const it of gruppe) {
      const vor = aufSeitenAnfang ? 0 : it.before;
      if (y - vor - it.h < untenGrenze && !aufSeitenAnfang) {
        // Umbruch mitten in einer zu langen Gruppe (z.B. sehr lange Kostentabelle): Kopfzeile wiederholen
        seite = neueSeite();
        y = obenSeite;
        aufSeitenAnfang = true;
        if (it.kopf) {
          it.kopf.draw(seite, y);
          y -= it.kopf.h;
          aufSeitenAnfang = false;
        }
      }
      y -= aufSeitenAnfang ? 0 : it.before;
      it.draw(seite, y);
      y -= it.h + it.after;
      aufSeitenAnfang = false;
    }
    i = j + 1;
  }

  // ----- Fußzeile -----
  const gesamt = seiten.length;
  seiten.forEach((p, n) => {
    const grundlinie = mm(10) + 8 * DESCENT;
    p.drawLine({ start: { x: RAND_LI, y: mm(10) + 8 * EINZEL + 6 }, end: { x: RAND_LI + TEXTBREITE, y: mm(10) + 8 * EINZEL + 6 }, thickness: 0.5, color: HELLGRAU });
    if (n === 0 && c.fuss) p.drawText(sicher(s, c.fuss), { x: RAND_LI, y: grundlinie, size: 8, font: s.normal, color: GRAU });
    const nr = `Seite ${n + 1} von ${gesamt}`;
    p.drawText(nr, { x: RAND_LI + TEXTBREITE - s.normal.widthOfTextAtSize(nr, 8), y: grundlinie, size: 8, font: s.normal, color: GRAU });
  });
}

/** Erzeugt ein PDF mit einem oder mehreren Schreiben (jedes beginnt auf einer neuen Seite). */
export async function erzeugeSchreibenPdf(schreiben: SchreibenInhalt[], titel?: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Eingebettete Schrift statt der PDF-Standardschrift Helvetica: deren Euro-Zeichen und Abstände stellen Viewer
  // (macOS Vorschau, Pages) abweichend von den Metriken dar, Zeichen klebten dann aneinander.
  doc.registerFontkit(fontkit);
  const normal = await doc.embedFont(Buffer.from(ARIMO_REGULAR_WOFF_BASE64, "base64"), { subset: true });
  const fett = await doc.embedFont(Buffer.from(ARIMO_BOLD_WOFF_BASE64, "base64"), { subset: true });
  const s: Schriften = { normal, fett, zeichen: new Set(normal.getCharacterSet()) };
  for (const c of schreiben) fuegeSchreibenHinzu(doc, s, c);
  if (titel) doc.setTitle(titel);
  return doc.save();
}
