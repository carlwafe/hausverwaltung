// SEPA-Core-Sammellastschrift als ISO-20022-Nachricht pain.008.001.08 (DK-Anlage 3, Version 3.x). Reine Funktionen
// ohne Datenbank- oder Browser-Abhängigkeit: Der Aufrufer liefert Gläubigerin und Einzüge, die Datei entsteht hier.
// Gläubiger-ID, Namen und IBANs stehen nie im Quelltext, sie kommen aus der DB (Objekt / Mietvertrag).

export type SepaFolge = "FRST" | "RCUR" | "OOFF" | "FNAL";

export type SepaGlaeubiger = {
  name: string;
  iban: string;
  bic?: string | null; // optional: im SEPA-Raum reicht die IBAN
  glaeubigerId: string;
};

export type SepaEinzug = {
  endToEndId: string; // höchstens 35 Zeichen
  betragCent: number; // ganze Cent, > 0
  mandatsreferenz: string; // höchstens 35 Zeichen
  mandatsDatum: string; // ISO yyyy-mm-dd, Unterschriftsdatum
  schuldnerName: string; // Kontoinhaber
  schuldnerIban: string;
  verwendungszweck: string; // höchstens 140 Zeichen
  folge: SepaFolge;
};

export type Pain008Eingabe = {
  nachrichtenId: string; // MsgId, höchstens 35 Zeichen, eindeutig je Einreichung
  erstelltAm: Date;
  faelligAm: string; // ISO yyyy-mm-dd, gewünschter Einzugstermin (TARGET-Tag)
  glaeubiger: SepaGlaeubiger;
  einzuege: SepaEinzug[];
};

/** IBAN-Prüfziffer (Modulo 97). Leerzeichen und Kleinschreibung werden ignoriert. */
export function ibanGueltig(eingabe: string): boolean {
  const iban = eingabe.replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  if (iban.startsWith("DE") && iban.length !== 22) return false;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const c of umgestellt) {
    const wert = /\d/.test(c) ? c : String(c.charCodeAt(0) - 55);
    for (const z of wert) rest = (rest * 10 + Number(z)) % 97;
  }
  return rest === 1;
}

export function bereinigeIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Text auf den SEPA-Zeichensatz bringen (a–z, A–Z, 0–9 und / - ? : ( ) . , ' + Leerzeichen): Umlaute und ß werden
 * umgeschrieben, andere Akzente entfernt, alles übrige Unzulässige durch Leerzeichen ersetzt. Auf `max` Zeichen gekürzt.
 */
export function sepaText(text: string, max: number): string {
  const umgeschrieben = text
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue")
    .replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/&/g, "+");
  return umgeschrieben
    .replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

function xml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function euro(cent: number): string {
  return `${Math.floor(cent / 100)}.${String(cent % 100).padStart(2, "0")}`;
}

/** Zeitstempel ohne Zeitzone und Millisekunden: yyyy-mm-ddThh:mm:ss (lokale Zeit). */
function zeitstempel(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Gründe, warum die Eingabe nicht als Datei taugt; leer = in Ordnung. */
export function pruefePain008(e: Pain008Eingabe): string[] {
  const fehler: string[] = [];
  const g = e.glaeubiger;
  if (!sepaText(g.name, 70)) fehler.push("Gläubigername fehlt");
  if (!ibanGueltig(g.iban)) fehler.push("Gläubiger-IBAN ungültig");
  if (!g.glaeubigerId) fehler.push("Gläubiger-ID fehlt");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.faelligAm)) fehler.push("Einzugstermin ist kein ISO-Datum");
  if (e.einzuege.length === 0) fehler.push("Keine Einzüge");
  if (e.nachrichtenId.length === 0 || e.nachrichtenId.length > 35) fehler.push("Nachrichten-ID muss 1–35 Zeichen haben");
  const ids = new Set<string>();
  for (const z of e.einzuege) {
    const wo = `Einzug ${z.mandatsreferenz || z.endToEndId}`;
    if (!Number.isInteger(z.betragCent) || z.betragCent <= 0) fehler.push(`${wo}: Betrag muss größer 0 sein`);
    if (z.betragCent >= 100_000_000_000) fehler.push(`${wo}: Betrag zu groß`);
    if (!z.mandatsreferenz || z.mandatsreferenz.length > 35 || !/^[A-Za-z0-9+?/:().,'-]+$/.test(z.mandatsreferenz)) {
      fehler.push(`${wo}: Mandatsreferenz fehlt, zu lang oder mit unzulässigen Zeichen`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(z.mandatsDatum)) fehler.push(`${wo}: Unterschriftsdatum fehlt`);
    if (!ibanGueltig(z.schuldnerIban)) fehler.push(`${wo}: Zahler-IBAN ungültig`);
    if (!sepaText(z.schuldnerName, 70)) fehler.push(`${wo}: Kontoinhaber fehlt`);
    if (!z.endToEndId || z.endToEndId.length > 35) fehler.push(`${wo}: End-to-End-ID fehlt oder zu lang`);
    if (ids.has(z.endToEndId)) fehler.push(`${wo}: End-to-End-ID doppelt`);
    ids.add(z.endToEndId);
  }
  return fehler;
}

/**
 * Baut die XML-Datei. Alle Einzüge mit derselben Folge (FRST/RCUR/…) bilden einen Sammler (`PmtInf`, Sammelbuchung);
 * die Gesamtsumme steht im Kopf und je Sammler. Wirft bei Eingaben, die `pruefePain008` beanstandet.
 */
export function baueLastschriftPain008(e: Pain008Eingabe): string {
  const fehler = pruefePain008(e);
  if (fehler.length) throw new Error(`pain.008 nicht möglich:\n- ${fehler.join("\n- ")}`);

  const g = e.glaeubiger;
  const gesamtCent = e.einzuege.reduce((s, z) => s + z.betragCent, 0);
  const folgen = [...new Set(e.einzuege.map((z) => z.folge))];
  const bic = g.bic?.replace(/\s+/g, "").toUpperCase();

  const sammler = folgen.map((folge, i) => {
    const zeilen = e.einzuege.filter((z) => z.folge === folge);
    const summe = zeilen.reduce((s, z) => s + z.betragCent, 0);
    const txs = zeilen
      .map(
        (z) => `      <DrctDbtTxInf>
        <PmtId>
          <EndToEndId>${xml(z.endToEndId)}</EndToEndId>
        </PmtId>
        <InstdAmt Ccy="EUR">${euro(z.betragCent)}</InstdAmt>
        <DrctDbtTx>
          <MndtRltdInf>
            <MndtId>${xml(z.mandatsreferenz)}</MndtId>
            <DtOfSgntr>${z.mandatsDatum}</DtOfSgntr>
            <AmdmntInd>false</AmdmntInd>
          </MndtRltdInf>
        </DrctDbtTx>
        <DbtrAgt>
          <FinInstnId>
            <Othr>
              <Id>NOTPROVIDED</Id>
            </Othr>
          </FinInstnId>
        </DbtrAgt>
        <Dbtr>
          <Nm>${xml(sepaText(z.schuldnerName, 70))}</Nm>
        </Dbtr>
        <DbtrAcct>
          <Id>
            <IBAN>${bereinigeIban(z.schuldnerIban)}</IBAN>
          </Id>
        </DbtrAcct>
        <RmtInf>
          <Ustrd>${xml(sepaText(z.verwendungszweck, 140))}</Ustrd>
        </RmtInf>
      </DrctDbtTxInf>`,
      )
      .join("\n");
    return `    <PmtInf>
      <PmtInfId>${xml(`${e.nachrichtenId}-${i + 1}`.slice(0, 35))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${zeilen.length}</NbOfTxs>
      <CtrlSum>${euro(summe)}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
        <LclInstrm>
          <Cd>CORE</Cd>
        </LclInstrm>
        <SeqTp>${folge}</SeqTp>
      </PmtTpInf>
      <ReqdColltnDt>${e.faelligAm}</ReqdColltnDt>
      <Cdtr>
        <Nm>${xml(sepaText(g.name, 70))}</Nm>
      </Cdtr>
      <CdtrAcct>
        <Id>
          <IBAN>${bereinigeIban(g.iban)}</IBAN>
        </Id>
      </CdtrAcct>
      <CdtrAgt>
        <FinInstnId>${bic ? `\n          <BICFI>${xml(bic)}</BICFI>\n        ` : `\n          <Othr>\n            <Id>NOTPROVIDED</Id>\n          </Othr>\n        `}</FinInstnId>
      </CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId>
        <Id>
          <PrvtId>
            <Othr>
              <Id>${xml(g.glaeubigerId.replace(/\s+/g, "").toUpperCase())}</Id>
              <SchmeNm>
                <Prtry>SEPA</Prtry>
              </SchmeNm>
            </Othr>
          </PrvtId>
        </Id>
      </CdtrSchmeId>
${txs}
    </PmtInf>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="urn:iso:std:iso:20022:tech:xsd:pain.008.001.08 pain.008.001.08.xsd">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xml(e.nachrichtenId)}</MsgId>
      <CreDtTm>${zeitstempel(e.erstelltAm)}</CreDtTm>
      <NbOfTxs>${e.einzuege.length}</NbOfTxs>
      <CtrlSum>${euro(gesamtCent)}</CtrlSum>
      <InitgPty>
        <Nm>${xml(sepaText(g.name, 70))}</Nm>
      </InitgPty>
    </GrpHdr>
${sammler.join("\n")}
  </CstmrDrctDbtInitn>
</Document>
`;
}
