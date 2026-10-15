// Einlesen von Bank-Umsätzen im Format ISO 20022 CAMT (camt.052 Tagesumsätze, camt.053 Kontoauszug),
// Version 001.08 (Version 001.02 wird mitgelesen — dieselben Daten, nur andere Elementnamen).
//
// Entscheidung (15.10.2026): Der Parser macht aus jeder Buchung eine Zeile mit denselben Spalten
// wie die Sparkasse-CSV ("Buchungstag", "Verwendungszweck", "Beguenstigter/Zahlungspflichtiger" …),
// in derselben Schreibweise (ASCII-Umlaute, Datum TT.MM.JJ, Betrag mit Komma). Dadurch laufen
// Klassifizierung, Duplikaterkennung gegen die per CSV importierten Altdaten und der
// Vollständigkeits-Check unverändert; die Rohdaten einer XML- und einer CSV-Zeile sind austauschbar.
// Zusätzlich liefert die XML Felder, die die CSV nicht hat ("Bank-Referenz" = eindeutige Umsatz-ID
// der Bank, "Rueckgabegrund", "Transaktionscode") und die Salden für die Saldoprüfung.
import { XMLParser } from "fast-xml-parser";

export const CAMT_SPALTEN = [
  "Auftragskonto",
  "Buchungstag",
  "Valutadatum",
  "Buchungstext",
  "Verwendungszweck",
  "Glaeubiger ID",
  "Mandatsreferenz",
  "Kundenreferenz (End-to-End)",
  "Sammlerreferenz",
  "Lastschrift Ursprungsbetrag",
  "Auslagenersatz Ruecklastschrift",
  "Beguenstigter/Zahlungspflichtiger",
  "Kontonummer/IBAN",
  "BIC (SWIFT-Code)",
  "Betrag",
  "Waehrung",
  "Info",
  // Nur in der XML vorhanden:
  "Bank-Referenz",
  "Rueckgabegrund",
  "Transaktionscode",
] as const;

export type CamtDatei = { name: string; text: string };

export type CamtTag = {
  datei: string;
  /** Datum des Endsaldos (ISO). */
  datum: string | null;
  anfangssaldo: number | null;
  endsaldo: number | null;
  /** Summe der Buchungen dieser Datei (vorzeichenbehaftet, in Euro). */
  summe: number;
  anzahl: number;
  /** Anfang + Summe = Ende (null = nicht prüfbar, weil ein Saldo fehlt). */
  stimmt: boolean | null;
};

export type CamtPruefung = {
  dateien: number;
  buchungen: number;
  iban: string | null;
  von: string | null;
  bis: string | null;
  anfangssaldo: number | null;
  endsaldo: number | null;
  tage: CamtTag[];
  /** Jede Datei beginnt mit dem Endsaldo der vorigen (null = nicht prüfbar). */
  saldoKetteLueckenlos: boolean | null;
  /** Alles, was nicht stimmt oder auffällt — leer = sauber. */
  probleme: string[];
};

export type CamtErgebnis = {
  headers: string[];
  rows: Record<string, string>[];
  pruefung: CamtPruefung;
};

type Knoten = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  // Beträge, Referenzen und IBANs bleiben Text (führende Nullen, keine Gleitkomma-Rundung).
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ["Rpt", "Stmt", "Ntry", "TxDtls", "Ustrd", "Bal", "Chrgs", "Rcrd", "NtryDtls"].includes(name),
});

function istKnoten(v: unknown): v is Knoten {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function liste(v: unknown): unknown[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Geht einen Pfad entlang und liefert den Wert (bei Listen jeweils das erste Element). */
function pfad(v: unknown, ...namen: string[]): unknown {
  let aktuell: unknown = v;
  for (const n of namen) {
    if (Array.isArray(aktuell)) aktuell = aktuell[0];
    if (!istKnoten(aktuell)) return undefined;
    aktuell = aktuell[n];
  }
  return Array.isArray(aktuell) ? aktuell[0] : aktuell;
}

/** Wie pfad(), liefert aber das letzte Element immer als Liste (z.B. mehrere <Ustrd>). */
function pfadListe(v: unknown, ...namen: string[]): unknown[] {
  let aktuell: unknown = v;
  for (const n of namen.slice(0, -1)) {
    if (Array.isArray(aktuell)) aktuell = aktuell[0];
    if (!istKnoten(aktuell)) return [];
    aktuell = aktuell[n];
  }
  if (Array.isArray(aktuell)) aktuell = aktuell[0];
  return istKnoten(aktuell) ? liste(aktuell[namen[namen.length - 1]]) : [];
}

/** Text eines Elements (auch wenn es Attribute trägt, z.B. <Amt Ccy="EUR">). */
function text(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number") return String(v);
  if (istKnoten(v) && "#text" in v) return text(v["#text"]);
  return "";
}

function t(v: unknown, ...namen: string[]): string {
  return text(pfad(v, ...namen));
}

/** Euro-Text ("570.00") → Cent, ohne Gleitkomma. */
function cent(roh: string): number | null {
  const m = roh.trim().match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  const c = Number(m[2]) * 100 + Number((m[3] ?? "").padEnd(2, "0") || 0);
  return m[1] === "-" ? -c : c;
}

function mitVorzeichen(betrag: number, kennzeichen: string): number {
  return kennzeichen === "DBIT" ? -betrag : betrag;
}

function euroText(centBetrag: number): string {
  const abs = Math.abs(centBetrag);
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, "0")}`;
  return centBetrag < 0 ? `-${s}` : s;
}

function euro(centBetrag: number): number {
  return centBetrag / 100;
}

/** Wie die CSV der Sparkasse: Umlaute als ae/oe/ue/ss, Leerraum zusammengezogen. */
function bankText(s: string): string {
  return s
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae")
    .replace(/Ö/g, "Oe")
    .replace(/Ü/g, "Ue")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

// Die V8 schreibt die Buchungstexte ausführlicher als die CSV; für die Rohdaten (und alles, was darauf
// sucht) gelten die kurzen CSV-Schreibweisen weiter.
const BUCHUNGSTEXT_WIE_CSV: Record<string, string> = {
  "GUTSCHRIFT UEBERWEISUNG": "GUTSCHR. UEBERWEISUNG",
  "GUTSCHRIFT UEBERWEISUNG DAUERAUFTRAG": "GUTSCHR. UEBERW. DAUERAUFTR",
};

function buchungstext(roh: string): string {
  const text = bankText(roh).toUpperCase();
  return BUCHUNGSTEXT_WIE_CSV[text] ?? text;
}

function datumKurz(iso: string): string {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1].slice(2)}` : "";
}

function isoDatum(v: unknown): string {
  const d = t(v, "Dt") || t(v, "DtTm");
  return d.slice(0, 10);
}

/** Name der Partei — V8: <Dbtr><Pty><Nm>, V2: <Dbtr><Nm>. */
function parteiName(partei: unknown): string {
  return bankText(t(partei, "Pty", "Nm") || t(partei, "Nm"));
}

/** Gläubiger-ID bzw. sonstige Kennung der Partei. */
function parteiKennung(partei: unknown): string {
  const basis = pfad(partei, "Pty") ?? partei;
  return t(basis, "Id", "PrvtId", "Othr", "Id") || t(basis, "Id", "OrgId", "Othr", "Id");
}

function waehrung(ntry: Knoten): string {
  const betrag = ntry.Amt;
  return istKnoten(betrag) ? String(betrag["@_Ccy"] ?? "EUR") : "EUR";
}

function kontoKennung(konto: unknown): string {
  return t(konto, "Id", "IBAN") || t(konto, "Id", "Othr", "Id");
}

function bic(agent: unknown): string {
  return t(agent, "FinInstnId", "BICFI") || t(agent, "FinInstnId", "BIC");
}

type Saldo = { code: string; cent: number; datum: string };

function lesePositionen(rpt: Knoten): Saldo[] {
  const ergebnis: Saldo[] = [];
  for (const b of liste(rpt.Bal)) {
    const code = t(b, "Tp", "CdOrPrtry", "Cd");
    const betrag = cent(t(b, "Amt"));
    if (!code || betrag === null) continue;
    ergebnis.push({ code, cent: mitVorzeichen(betrag, t(b, "CdtDbtInd")), datum: isoDatum(pfad(b, "Dt")) });
  }
  return ergebnis;
}

const ANFANGSSALDO = ["OPBD", "PRCD"];
const ENDSALDO = ["CLBD"];

export function istCamtXml(inhalt: string): boolean {
  return /<Document[^>]+urn:iso:std:iso:20022:tech:xsd:camt\.05[234]\./.test(inhalt.slice(0, 2000));
}

type RohZeile = { zeile: Record<string, string>; ref: string; cent: number; ort: string };

export function parseCamtDateien(dateien: CamtDatei[]): CamtErgebnis {
  if (dateien.length === 0) throw new Error("Keine CAMT-Datei übergeben.");
  const probleme: string[] = [];
  const zeilen: RohZeile[] = [];
  const tage: CamtTag[] = [];
  const gesehen = new Set<string>();
  const buchungstageSet = new Set<string>();
  let doppelt = 0;
  let uebersprungen = 0;
  const konten = new Set<string>();

  for (const datei of [...dateien].sort((a, b) => a.name.localeCompare(b.name))) {
    if (!istCamtXml(datei.text)) {
      throw new Error(`„${datei.name}“ ist keine CAMT-Datei (erwartet: camt.052 oder camt.053, Version 001.08).`);
    }
    const version = datei.text.match(/camt\.05[234]\.001\.(\d{2})/)?.[1];
    if (version !== "08" && version !== "02") {
      throw new Error(`„${datei.name}“: CAMT-Version 001.${version} wird nicht unterstützt (001.08 oder 001.02).`);
    }
    let wurzel: unknown;
    try {
      wurzel = parser.parse(datei.text);
    } catch (err) {
      throw new Error(`„${datei.name}“ lässt sich nicht lesen: ${err instanceof Error ? err.message : "XML-Fehler"}`);
    }
    const doc = pfad(wurzel, "Document");
    const alleBerichte = [...pfadListe(doc, "BkToCstmrAcctRpt", "Rpt"), ...pfadListe(doc, "BkToCstmrStmt", "Stmt")];
    if (alleBerichte.length === 0) throw new Error(`„${datei.name}“ enthält keinen Bericht (Rpt/Stmt).`);

    for (const bericht of alleBerichte) {
      if (!istKnoten(bericht)) continue;
      const iban = t(bericht, "Acct", "Id", "IBAN");
      if (iban) konten.add(iban);
      const salden = lesePositionen(bericht);
      const anfang = salden.find((s) => ANFANGSSALDO.includes(s.code)) ?? null;
      const ende = salden.find((s) => ENDSALDO.includes(s.code)) ?? null;

      let summe = 0;
      let anzahl = 0;
      for (const ntry of liste(bericht.Ntry)) {
        if (!istKnoten(ntry)) continue;
        const status = t(ntry, "Sts", "Cd") || t(ntry, "Sts");
        if (status && status !== "BOOK") {
          uebersprungen++;
          continue;
        }
        const richtung = t(ntry, "CdtDbtInd");
        const eintragCent = cent(t(ntry, "Amt"));
        if (eintragCent === null || (richtung !== "CRDT" && richtung !== "DBIT")) {
          probleme.push(`${datei.name}: Eintrag ohne lesbaren Betrag oder Soll/Haben-Kennzeichen übersprungen.`);
          continue;
        }
        if (t(ntry, "RvslInd") === "true") {
          probleme.push(`${datei.name}: Eintrag mit Storno-Kennzeichen (RvslInd) — Vorzeichen bitte prüfen.`);
        }
        const buchung = isoDatum(pfad(ntry, "BookgDt"));
        const valuta = isoDatum(pfad(ntry, "ValDt")) || buchung;
        if (buchung) buchungstageSet.add(buchung);
        const entryRef = t(ntry, "AcctSvcrRef");
        const transaktionen = liste(ntry.NtryDtls).flatMap((d) => liste(istKnoten(d) ? d.TxDtls : undefined));

        // Eine Zeile je Einzelposten, wenn sie sich zum Eintragsbetrag summieren (Sammelbuchung mit
        // Einzelposten), sonst eine Zeile für den ganzen Eintrag.
        const einzel = transaktionen.map((tx) => {
          const c = cent(t(tx, "Amt"));
          return c === null ? null : mitVorzeichen(c, richtung);
        });
        const eintragSigned = mitVorzeichen(eintragCent, richtung);
        const proPosten =
          transaktionen.length > 1 && einzel.every((c): c is number => c !== null) && einzel.reduce((a, b) => a + b, 0) === eintragSigned;
        if (transaktionen.length > 1 && !proPosten) {
          probleme.push(`${datei.name}: Sammelbuchung ${datumKurz(buchung)} über ${euroText(eintragSigned)} € als eine Zeile übernommen (Einzelposten ergeben nicht den Gesamtbetrag).`);
        }
        const quellen: { tx: unknown; cent: number; nr: number }[] = proPosten
          ? transaktionen.map((tx, i) => ({ tx, cent: einzel[i] as number, nr: i + 1 }))
          : [{ tx: transaktionen[0], cent: eintragSigned, nr: 0 }];

        for (const q of quellen) {
          const tx = q.tx;
          const alleUstrd = (proPosten ? [tx] : transaktionen)
            .flatMap((x) => pfadListe(x, "RmtInf", "Ustrd").map(text))
            .filter(Boolean);
          const verwendungszweck = bankText(alleUstrd.join(" "));

          // Gegenpartei = die Seite, die nicht unser Konto ist (bei Rücklastschriften ist sie sonst vertauscht).
          const parteien = pfad(tx, "RltdPties");
          const dbtrKonto = kontoKennung(pfad(parteien, "DbtrAcct"));
          const cdtrKonto = kontoKennung(pfad(parteien, "CdtrAcct"));
          let gegenseiteIstSchuldner: boolean;
          if (iban && dbtrKonto === iban) gegenseiteIstSchuldner = false;
          else if (iban && cdtrKonto === iban) gegenseiteIstSchuldner = true;
          else gegenseiteIstSchuldner = richtung === "CRDT";
          const gegenPartei = pfad(parteien, gegenseiteIstSchuldner ? "Dbtr" : "Cdtr");
          const gegenKonto = gegenseiteIstSchuldner ? dbtrKonto : cdtrKonto;
          const gegenAgent = pfad(tx, "RltdAgts", gegenseiteIstSchuldner ? "DbtrAgt" : "CdtrAgt");

          const refs = pfad(tx, "Refs");
          const bankRef =
            pfadListe(refs, "Prtry")
              .filter((p) => t(p, "Tp") === "FI-UMSATZ-ID")
              .map((p) => t(p, "Ref"))[0] || (entryRef && entryRef !== "NONREF" ? entryRef : "");
          const eindeutigeRef = bankRef ? (q.nr > 0 ? `${bankRef}#${q.nr}` : bankRef) : "";

          const endToEnd = t(refs, "EndToEndId");
          const ursprungsbetrag = cent(t(tx, "AmtDtls", "InstdAmt", "Amt"));
          const auslagen = pfadListe(tx, "Chrgs")
            .map((c) => cent(t(c, "Rcrd", "Amt") || t(c, "Amt")))
            .find((c): c is number => c !== null);
          const rueckgrund = [t(tx, "RtrInf", "Rsn", "Cd"), bankText(t(tx, "RtrInf", "AddtlInf"))].filter(Boolean).join(" ");
          const domain = [t(tx, "BkTxCd", "Domn", "Cd"), t(tx, "BkTxCd", "Domn", "Fmly", "Cd"), t(tx, "BkTxCd", "Domn", "Fmly", "SubFmlyCd")]
            .filter(Boolean)
            .join("/");
          const transaktionscode = [domain, t(tx, "BkTxCd", "Prtry", "Cd")].filter(Boolean).join(" ");

          const zeile: Record<string, string> = {
            Auftragskonto: iban,
            Buchungstag: datumKurz(buchung),
            Valutadatum: datumKurz(valuta),
            Buchungstext: buchungstext(t(ntry, "AddtlNtryInf")),
            Verwendungszweck: verwendungszweck,
            "Glaeubiger ID": parteiKennung(pfad(parteien, "Cdtr")),
            Mandatsreferenz: t(refs, "MndtId"),
            "Kundenreferenz (End-to-End)": endToEnd === "NOTPROVIDED" ? "" : endToEnd,
            Sammlerreferenz: t(refs, "PmtInfId"),
            "Lastschrift Ursprungsbetrag": ursprungsbetrag === null ? "" : euroText(ursprungsbetrag),
            "Auslagenersatz Ruecklastschrift": auslagen === undefined ? "" : euroText(auslagen),
            "Beguenstigter/Zahlungspflichtiger": parteiName(gegenPartei),
            "Kontonummer/IBAN": gegenKonto,
            "BIC (SWIFT-Code)": bic(gegenAgent),
            Betrag: euroText(q.cent),
            Waehrung: waehrung(ntry),
            Info: "Umsatz gebucht",
            "Bank-Referenz": eindeutigeRef,
            Rueckgabegrund: rueckgrund,
            Transaktionscode: transaktionscode,
          };

          if (eindeutigeRef) {
            if (gesehen.has(eindeutigeRef)) {
              doppelt++;
              continue;
            }
            gesehen.add(eindeutigeRef);
          }
          zeilen.push({ zeile, ref: eindeutigeRef, cent: q.cent, ort: datei.name });
        }
        summe += eintragSigned;
        anzahl++;
      }

      const summeCent = summe;
      tage.push({
        datei: datei.name,
        datum: ende?.datum || anfang?.datum || null,
        anfangssaldo: anfang ? euro(anfang.cent) : null,
        endsaldo: ende ? euro(ende.cent) : null,
        summe: euro(summeCent),
        anzahl,
        stimmt: anfang && ende ? anfang.cent + summeCent === ende.cent : null,
      });
    }
  }

  if (konten.size > 1) {
    throw new Error(`Die Dateien gehören zu verschiedenen Konten (${[...konten].join(", ")}). Bitte je Konto getrennt importieren.`);
  }

  // Saldoprüfung: jeder Tag für sich und die Kette von Tag zu Tag.
  const nachDatum = [...tage].sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "") || a.datei.localeCompare(b.datei));
  for (const tag of nachDatum) {
    if (tag.stimmt === false) {
      probleme.push(`${tag.datei}: Anfangssaldo ${euroText(Math.round((tag.anfangssaldo ?? 0) * 100))} € + Umsätze ${euroText(Math.round(tag.summe * 100))} € ergibt nicht den Endsaldo ${euroText(Math.round((tag.endsaldo ?? 0) * 100))} € — es fehlen Buchungen oder sind zu viel.`);
    } else if (tag.stimmt === null) {
      probleme.push(`${tag.datei}: Salden fehlen, Tagessumme nicht prüfbar.`);
    }
  }
  let kette: boolean | null = nachDatum.length > 1 ? true : null;
  for (let i = 1; i < nachDatum.length; i++) {
    const davor = nachDatum[i - 1];
    const dieser = nachDatum[i];
    if (davor.endsaldo === null || dieser.anfangssaldo === null) {
      kette = null;
      continue;
    }
    if (Math.round(davor.endsaldo * 100) !== Math.round(dieser.anfangssaldo * 100)) {
      if (kette !== null) kette = false;
      probleme.push(
        `Saldokette unterbrochen: Endsaldo ${euroText(Math.round(davor.endsaldo * 100))} € (${davor.datei}) passt nicht zum Anfangssaldo ${euroText(Math.round(dieser.anfangssaldo * 100))} € (${dieser.datei}) — vermutlich fehlt eine Datei dazwischen.`,
      );
    }
  }
  if (doppelt > 0) probleme.push(`${doppelt} doppelt enthaltene Buchung${doppelt === 1 ? "" : "en"} (gleiche Bank-Referenz in mehreren Dateien) nur einmal übernommen.`);
  if (uebersprungen > 0) probleme.push(`${uebersprungen} nicht gebuchte Einträge (vorgemerkt/Info) übersprungen.`);

  const erste = nachDatum[0];
  const letzte = nachDatum[nachDatum.length - 1];
  const buchungstage = [...buchungstageSet].sort();
  const rows = zeilen.map((z) => z.zeile);
  return {
    headers: [...CAMT_SPALTEN],
    rows,
    pruefung: {
      dateien: dateien.length,
      buchungen: rows.length,
      iban: [...konten][0] ?? null,
      von: buchungstage[0] ?? null,
      bis: buchungstage[buchungstage.length - 1] ?? null,
      anfangssaldo: erste?.anfangssaldo ?? null,
      endsaldo: letzte?.endsaldo ?? null,
      tage: nachDatum,
      saldoKetteLueckenlos: kette,
      probleme,
    },
  };
}

/** Wie die Bank-CSV: Semikolon, alle Felder in Anführungszeichen. */
export function zeilenAlsCsv(headers: readonly string[], rows: Record<string, string>[]): string {
  const feld = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const zeilen = [headers.map(feld).join(";"), ...rows.map((r) => headers.map((h) => feld(r[h] ?? "")).join(";"))];
  return zeilen.join("\r\n") + "\r\n";
}
