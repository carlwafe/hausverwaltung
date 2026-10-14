// Tilgungsplan eines Annuitäten-/Ratendarlehens, nachgerechnet aus Ausgangsstand, Zinssatz und Rate.
// Die Bank (Deutsche Bank) druckt im Zins- und Tilgungsplan nur für die ersten Jahre jede Rate einzeln, danach nur noch
// Jahressummen. Ihre Rechenregel lässt sich auf den Cent nachbilden (geprüft an allen Raten und Jahressummen der
// Pläne): Zins einer Rate = Restschuld vor der Rate × Zinssatz ÷ 12, auf Cent gerundet; Tilgung = Rate − Zins;
// die letzte Rate tilgt genau den Rest. Reine Funktion, ohne Datenbank.

export type Zinsstufe = {
  /** Ab diesem Tag (yyyy-mm-dd) gilt der neue Zinssatz bzw. die neue Rate (Raten mit Zahltag ab diesem Tag). */
  ab: string;
  zinssatz: number;
  /** Neue monatliche Rate; ohne Angabe bleibt die bisherige. */
  rate?: number;
};

export type Bankwert = { jahr: number; zinsen?: number; tilgung?: number; restschuld?: number };

export type TilgungsplanEingabe = {
  /** Restschuld nach der letzten bekannten Rate (z.B. „Kapitalstand“ im Plan der Bank). */
  startRestschuld: number;
  /** Stichtag dieser Restschuld; die erste berechnete Rate ist der erste Zahltag danach. */
  startDatum: Date;
  rate: number;
  zinssatz: number;
  zahltag: number;
  laufzeitEnde: Date | null;
  zinsbindungBis: Date | null;
  stufen: Zinsstufe[];
};

export type Rate = {
  datum: Date;
  jahr: number;
  monat: number;
  zinssatz: number;
  rate: number;
  zins: number;
  tilgung: number;
  restschuld: number;
  /** Zahltag liegt nach dem Ende der Zinsbindung: der Zinssatz ist dann nur angenommen. */
  nachZinsbindung: boolean;
  /** Halbe Schlussrate zum Laufzeitende (liegt dieses nach dem Zahltag des Monats). */
  teilrate: boolean;
};

export type Jahressumme = { jahr: number; rate: number; zins: number; tilgung: number; restschuld: number };

const MAX_MONATE = 480;
const OHNE_ENDE_MONATE = 360; // ohne Laufzeitende höchstens 30 Jahre vorausrechnen

const isoTag = (d: Date) => d.toISOString().slice(0, 10);
const euro = (cent: number) => cent / 100;

/** Ganzzahl-Division, kaufmännisch gerundet (nur für nichtnegative Zähler). */
function rundeDiv(zaehler: number, nenner: number): number {
  return Math.floor((2 * zaehler + nenner) / (2 * nenner));
}

/** Zahltag eines Monats: der gewünschte Tag, bei Wochenende der folgende Montag (so datiert die Bank ihre Raten). */
export function zahltagImMonat(jahr: number, monat: number, tag: number): Date {
  const letzter = new Date(Date.UTC(jahr, monat, 0)).getUTCDate();
  const d = new Date(Date.UTC(jahr, monat - 1, Math.min(Math.max(tag, 1), letzter)));
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export function berechneTilgungsplan(e: TilgungsplanEingabe): Rate[] {
  const stufen = [...e.stufen].sort((a, b) => a.ab.localeCompare(b.ab));
  let restCent = Math.round(e.startRestschuld * 100);
  const raten: Rate[] = [];
  let jahr = e.startDatum.getUTCFullYear();
  let monat = e.startDatum.getUTCMonth() + 1;
  const endeMonate = e.laufzeitEnde ? MAX_MONATE : OHNE_ENDE_MONATE;

  for (let i = 0; i < endeMonate && restCent > 0; i++) {
    const datum = zahltagImMonat(jahr, monat, e.zahltag);
    const naechster = () => {
      monat++;
      if (monat > 12) {
        monat = 1;
        jahr++;
      }
    };
    if (datum.getTime() <= e.startDatum.getTime()) {
      naechster();
      continue;
    }
    if (e.laufzeitEnde && datum.getTime() > e.laufzeitEnde.getTime()) break;

    let satz = e.zinssatz;
    let rateCent = Math.round(e.rate * 100);
    const tag = isoTag(datum);
    for (const s of stufen) {
      if (s.ab > tag) break;
      satz = s.zinssatz;
      if (s.rate !== undefined) rateCent = Math.round(s.rate * 100);
    }
    const satzE4 = Math.round(satz * 10000);
    const zinsCent = rundeDiv(restCent * satzE4, 12_000_000);
    let tilgungCent = rateCent - zinsCent;
    if (tilgungCent >= restCent) {
      tilgungCent = restCent;
      rateCent = zinsCent + tilgungCent;
    }
    restCent -= tilgungCent;
    raten.push({
      datum,
      jahr,
      monat,
      zinssatz: satz,
      rate: euro(rateCent),
      zins: euro(zinsCent),
      tilgung: euro(tilgungCent),
      restschuld: euro(restCent),
      nachZinsbindung: !!e.zinsbindungBis && datum.getTime() > e.zinsbindungBis.getTime(),
      teilrate: false,
    });
    naechster();
  }

  // Liegt das Laufzeitende nach dem Zahltag seines Monats (z.B. 31.03. nach der Rate vom 15.03.), rechnet die Bank
  // zum Laufzeitende noch eine halbe Rate (Zins für einen halben Monat, Tilgung bis zur halben Rate) ein.
  const letzte = raten.at(-1);
  if (e.laufzeitEnde && letzte && restCent > 0 && letzte.datum.getUTCFullYear() === e.laufzeitEnde.getUTCFullYear()
    && letzte.datum.getUTCMonth() === e.laufzeitEnde.getUTCMonth() && e.laufzeitEnde.getTime() > letzte.datum.getTime()) {
    const satzE4 = Math.round(letzte.zinssatz * 10000);
    const zinsCent = rundeDiv(restCent * satzE4, 24_000_000);
    const rateCent = Math.floor(Math.round(letzte.rate * 100) / 2);
    const tilgungCent = Math.min(Math.max(rateCent - zinsCent, 0), restCent);
    restCent -= tilgungCent;
    raten.push({
      ...letzte,
      datum: e.laufzeitEnde,
      rate: euro(zinsCent + tilgungCent),
      zins: euro(zinsCent),
      tilgung: euro(tilgungCent),
      restschuld: euro(restCent),
      nachZinsbindung: !!e.zinsbindungBis && e.laufzeitEnde.getTime() > e.zinsbindungBis.getTime(),
      teilrate: true,
    });
  }
  return raten;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function jahressummen(raten: Rate[]): Jahressumme[] {
  const map = new Map<number, Jahressumme>();
  for (const r of raten) {
    const s = map.get(r.jahr) ?? { jahr: r.jahr, rate: 0, zins: 0, tilgung: 0, restschuld: 0 };
    s.rate = cent(s.rate + r.rate);
    s.zins = cent(s.zins + r.zins);
    s.tilgung = cent(s.tilgung + r.tilgung);
    s.restschuld = r.restschuld;
    map.set(r.jahr, s);
  }
  return [...map.values()].sort((a, b) => a.jahr - b.jahr);
}

/** Restschuld nach der letzten Rate mit Zahltag bis einschließlich `stichtag` (vor der ersten Rate: der Ausgangsstand). */
export function restschuldAm(e: Pick<TilgungsplanEingabe, "startRestschuld">, raten: Rate[], stichtag: Date): number {
  let rest = e.startRestschuld;
  for (const r of raten) {
    if (r.datum.getTime() > stichtag.getTime()) break;
    rest = r.restschuld;
  }
  return rest;
}

export type BankwertVergleich = {
  jahr: number;
  zinsenBank?: number;
  zinsenPlan: number;
  tilgungBank?: number;
  tilgungPlan: number;
  restschuldBank?: number;
  restschuldPlan: number;
  /** true = alle angegebenen Bankwerte stimmen (bis auf 2 Cent Rundung der Bank, z.B. in der Schlussrate). */
  stimmt: boolean;
};

/** Vergleicht die Jahreswerte der Bank (Zins-/Saldenbescheinigung) mit dem nachgerechneten Plan. */
export function vergleicheMitBank(summen: Jahressumme[], bankwerte: Bankwert[]): BankwertVergleich[] {
  const result: BankwertVergleich[] = [];
  for (const b of [...bankwerte].sort((x, y) => x.jahr - y.jahr)) {
    const s = summen.find((x) => x.jahr === b.jahr);
    // Ohne Rate im Jahr (Darlehen schon getilgt) bleibt die Restschuld des letzten Jahres davor stehen.
    const davor = [...summen].filter((x) => x.jahr < b.jahr).pop();
    const zinsenPlan = s?.zins ?? 0;
    const tilgungPlan = s?.tilgung ?? 0;
    const restschuldPlan = s?.restschuld ?? davor?.restschuld ?? 0;
    const gleich = (a: number | undefined, p: number) => a === undefined || Math.abs(a - p) < 0.025;
    result.push({
      jahr: b.jahr,
      zinsenBank: b.zinsen,
      zinsenPlan,
      tilgungBank: b.tilgung,
      tilgungPlan,
      restschuldBank: b.restschuld,
      restschuldPlan,
      stimmt: gleich(b.zinsen, zinsenPlan) && gleich(b.tilgung, tilgungPlan) && gleich(b.restschuld, restschuldPlan),
    });
  }
  return result;
}
