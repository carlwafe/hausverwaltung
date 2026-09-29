// Kautionskonto eines Mietvertrags: alle Kautionsbewegungen chronologisch mit laufendem Stand des
// Kautionsguthabens des Mieters, dazu die Kautionsabrechnung bei Mietende (Guthaben ./. Einbehalte
// ./. bereits ausgezahlt = noch auszuzahlen). Reine Darstellung auf Basis der Journalbuchungen
// (Kontokreis KAUTIONSKONTO) und der KautionEinbehalt-Zeilen — gespeichert wird nichts.
//
// Wirkung auf das Guthaben des Mieters:
//  - KAUTION_EINZAHLUNG: + (Einzahlung des Mieters)
//  - Einzahlung vor Buchhaltungsbeginn (Kaution.einzahlungUnbekannt, keine Journalbuchung): + sollBetrag,
//    als erste Zeile ohne Datum
//  - KAUTION_ANLAGE / KAUTION_AUFLOESUNG: 0 (nur Umbuchung zwischen Geschäfts- und Kautionskonto);
//    eine positive (eingehende) KAUTION_ANLAGE ist eine Rückbuchung vom Kautionskonto (z.B. doppelt
//    angelegt, Kontowechsel) und mindert den angelegten Betrag, statt das Mietverhältnis aufzulösen
//  - KAUTION_AUSZAHLUNG / KAUTION_VIRTUELLE_AUSZAHLUNG: − (an den Mieter bzw. für ihn bezahlt); eine
//    positive KAUTION_AUSZAHLUNG ist eine zurückgekommene Auszahlung (Rücküberweisung, z.B. "Konto
//    aufgelöst") und mindert die ausgezahlte Summe wieder
//  - KAUTION_SONSTIGES: mit Buchungsvorzeichen (z.B. Zinsen +, Kontoführungsgebühr −)
//  - Zinsen in der Auflösung (keine Buchung): kommt vom Kautionskonto mehr zurück als angelegt wurde,
//    ist die Differenz Zins und steht dem Mieter zu — automatische Zeile "+" beim Auflösungsdatum
//  - Einbehalt (unstrittig/bestätigt): −; strittig offen: vorläufig zurückbehalten, noch ohne
//    Wirkung auf den Stand; verworfen: ohne Wirkung.

export type KautionBewegung = {
  id: string;
  datum: Date | null;
  code: string;
  bezeichnung: string;
  betrag: number;
  verwendungszweck: string | null;
};

export type KautionEinbehaltEingabe = {
  id: string;
  datum: Date;
  positionText: string;
  betrag: number; // positiv
  status: "UNSTRITTIG" | "STRITTIG_OFFEN" | "STRITTIG_BESTAETIGT" | "STRITTIG_VERWORFEN";
  nkJahr: number | null;
  // Mit einer Forderung aus dem Mieterkonto (Mietrückstand, Gebühren) verrechnet.
  mieterkonto?: boolean;
};

export type KautionskontoZeile = {
  id: string;
  datum: Date | null;
  vorgang: string;
  bemerkung: string;
  // Betrag der Buchung wie im Journal/Kontoauszug (Einbehalte negativ), null = keine Buchung.
  buchungsbetrag: number | null;
  // Veränderung des Kautionsguthabens des Mieters.
  wirkung: number;
  stand: number;
  art: "einzahlung" | "umbuchung" | "auszahlung" | "sonstiges" | "einbehalt" | "einbehalt_offen" | "einbehalt_verworfen";
};

export type KautionsabrechnungPosten = { text: string; betrag: number; datum: Date | null; hinweis?: string };

// Einbehalt-Position der Kautionsabrechnung (wie im Muster: unstrittig = sofort verrechenbar,
// strittig offen = zurückbehalten bis Klärung).
export type KautionEinbehaltPosten = {
  text: string;
  bezug: string;
  betrag: number;
  datum: Date;
  unstrittig: boolean;
  statusText: string;
};

export type Kautionskonto = {
  sollBetrag: number | null;
  zeilen: KautionskontoZeile[];
  stand: number;
  // Aktueller Ort des Geldes, soweit aus den Umbuchungen ablesbar.
  aufKautionskonto: boolean;
  status: "KEINE" | "OFFEN" | "HINTERLEGT" | "AUFGELOEST" | "ABGERECHNET";
  abrechnung: {
    eingezahlt: number;
    // Datum der ersten Einzahlung des Mieters.
    erhaltenAm: Date | null;
    sonstiges: number;
    guthaben: number;
    // Unstrittige/bestätigte und strittig offene Einbehalte (verworfene entfallen).
    einbehaltePositionen: KautionEinbehaltPosten[];
    einbehalteSumme: number;
    strittigOffenSumme: number;
    // Restbetrag, jetzt auszuzahlen = Guthaben − unstrittige − strittig offene Einbehalte.
    restbetrag: number;
    ausgezahlt: KautionsabrechnungPosten[];
    ausgezahltSumme: number;
    nochOffen: number;
  };
};

const TOLERANZ = 0.005;
// Id der automatisch erzeugten Zinszeile (siehe "Zinsen in der Auflösung" unten).
export const ZINSEN_ZEILE_ID = "zinsen-aufloesung";
const r2 = (v: number) => Math.round(v * 100) / 100;

const EINBEHALT_STATUS_TEXT: Record<KautionEinbehaltEingabe["status"], string> = {
  UNSTRITTIG: "unstrittig",
  STRITTIG_OFFEN: "strittig, offen",
  STRITTIG_BESTAETIGT: "strittig, bestätigt",
  STRITTIG_VERWORFEN: "verworfen",
};

// Obergrenze der jährlichen Zinsen auf einem Mietkautions-Sparkonto je Zeitraum — bewusst eher über
// den tatsächlichen Sparbuchzinsen (in den Auflösungen seit 2023 lag der Zins bei rund 0,1 % p.a.).
function maxZinssatz(jahr: number): number {
  if (jahr <= 2001) return 0.03;
  if (jahr <= 2008) return 0.02;
  if (jahr <= 2012) return 0.01;
  if (jahr <= 2022) return 0.0025;
  return 0.015;
}

// Maximaler Aufzinsungsfaktor von "seit" bis zur Auflösung (Jahr für Jahr, anteilig im ersten und
// letzten Jahr). Unbekannter Beginn: 10 Jahre vor der Auflösung.
function maxZinsfaktor(seit: Date | null, bis: Date): number {
  const start = seit ?? new Date(bis.getFullYear() - 10, bis.getMonth(), bis.getDate());
  let faktor = 1;
  for (let jahr = start.getFullYear(); jahr <= bis.getFullYear(); jahr++) {
    const von = Math.max(start.getTime(), new Date(jahr, 0, 1).getTime());
    const nach = Math.min(bis.getTime(), new Date(jahr + 1, 0, 1).getTime());
    if (nach > von) faktor *= 1 + (maxZinssatz(jahr) * (nach - von)) / (365.25 * 86400000);
  }
  return faktor;
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export function baueKautionskonto(input: {
  sollBetrag: number | null;
  // Kaution.einzahlungUnbekannt — nur wirksam, solange keine KAUTION_EINZAHLUNG gebucht ist.
  einzahlungUnbekannt?: boolean;
  // Mietbeginn — Anhaltspunkt, seit wann die Kaution angelegt war (für die Plausibilität der Zinsen).
  mietbeginn?: Date | null;
  bewegungen: KautionBewegung[];
  einbehalte: KautionEinbehaltEingabe[];
}): Kautionskonto {
  type Roh = Omit<KautionskontoZeile, "stand">;
  const roh: Roh[] = [];
  let eingezahlt = 0;
  let erhaltenAm: Date | null = null;
  let sonstiges = 0;
  let anlage = 0;
  let aufloesung = 0;
  // Für die Zinsen in der Auflösung: was aufs Kautionskonto ging und was von dort zurückkam.
  let anlageAusgehend = 0;
  let rueckfluss = 0;
  let aufloesungsDatum: Date | null = null;
  let ersteAnlage: Date | null = null;
  const ausgezahlt: KautionsabrechnungPosten[] = [];

  for (const b of input.bewegungen) {
    const bemerkung = b.verwendungszweck ?? "";
    if (b.code === "KAUTION_EINZAHLUNG") {
      const w = Math.abs(b.betrag);
      eingezahlt += w;
      if (b.datum && (!erhaltenAm || b.datum < erhaltenAm)) erhaltenAm = b.datum;
      roh.push({ id: b.id, datum: b.datum, vorgang: "Einzahlung Mieter", bemerkung, buchungsbetrag: b.betrag, wirkung: w, art: "einzahlung" });
    } else if (b.code === "KAUTION_ANLAGE" || b.code === "KAUTION_AUFLOESUNG") {
      const istAnlage = b.code === "KAUTION_ANLAGE";
      // Anlage mit Bankvorzeichen: ausgehend (negativ) erhöht, Rückbuchung (positiv) mindert.
      if (istAnlage) anlage -= b.betrag;
      else aufloesung += Math.abs(b.betrag);
      if (istAnlage && b.betrag < 0) anlageAusgehend -= b.betrag;
      if (istAnlage && b.betrag < 0 && b.datum && (!ersteAnlage || b.datum < ersteAnlage)) ersteAnlage = b.datum;
      else rueckfluss += Math.abs(b.betrag);
      if (!istAnlage && b.datum && (!aufloesungsDatum || b.datum > aufloesungsDatum)) aufloesungsDatum = b.datum;
      roh.push({
        id: b.id,
        datum: b.datum,
        vorgang: !istAnlage
          ? "Auflösung Kautionskonto"
          : b.betrag > 0
            ? "Rückbuchung vom Kautionskonto"
            : "Anlage auf Kautionskonto",
        bemerkung,
        buchungsbetrag: b.betrag,
        wirkung: 0,
        art: "umbuchung",
      });
    } else if (b.code === "KAUTION_AUSZAHLUNG" || b.code === "KAUTION_VIRTUELLE_AUSZAHLUNG") {
      const virtuell = b.code === "KAUTION_VIRTUELLE_AUSZAHLUNG";
      // Echte Auszahlung mit Bankvorzeichen: ausgehend mindert, eine Rücküberweisung (positiv) erhöht.
      const w = virtuell ? -Math.abs(b.betrag) : b.betrag;
      const text = virtuell
        ? "Verrechnet mit bezahlter Rechnung"
        : w > 0
          ? "Auszahlung zurückgekommen"
          : "Auszahlung an Mieter";
      ausgezahlt.push({ text, betrag: -w, datum: b.datum, hinweis: b.verwendungszweck ?? undefined });
      roh.push({ id: b.id, datum: b.datum, vorgang: text, bemerkung, buchungsbetrag: b.betrag, wirkung: w, art: "auszahlung" });
    } else {
      sonstiges += b.betrag;
      roh.push({ id: b.id, datum: b.datum, vorgang: b.bezeichnung.replace(/^Kaution:\s*/, ""), bemerkung, buchungsbetrag: b.betrag, wirkung: b.betrag, art: "sonstiges" });
    }
  }

  const einbehaltePositionen: KautionEinbehaltPosten[] = [];
  for (const e of input.einbehalte) {
    const nk =
      e.nkJahr !== null
        ? `mit Nebenkostenabrechnung ${e.nkJahr} verrechnet`
        : e.mieterkonto
          ? "mit dem Mieterkonto verrechnet"
          : undefined;
    const statusText = EINBEHALT_STATUS_TEXT[e.status];
    const bezug = [nk ?? "", `erfasst ${formatDatum(e.datum)}`].filter(Boolean).join(" · ");
    if (e.status === "UNSTRITTIG" || e.status === "STRITTIG_BESTAETIGT") {
      einbehaltePositionen.push({ text: e.positionText, bezug, betrag: e.betrag, datum: e.datum, unstrittig: true, statusText });
      roh.push({
        id: e.id,
        datum: e.datum,
        vorgang: "Einbehalt",
        bemerkung: [e.positionText, statusText, nk].filter(Boolean).join(" · "),
        buchungsbetrag: -e.betrag,
        wirkung: -e.betrag,
        art: "einbehalt",
      });
    } else if (e.status === "STRITTIG_OFFEN") {
      einbehaltePositionen.push({ text: e.positionText, bezug, betrag: e.betrag, datum: e.datum, unstrittig: false, statusText });
      roh.push({
        id: e.id,
        datum: e.datum,
        vorgang: "Einbehalt (strittig)",
        bemerkung: `${e.positionText} · vorläufig zurückbehalten, noch nicht gebucht`,
        buchungsbetrag: null,
        wirkung: 0,
        art: "einbehalt_offen",
      });
    } else {
      roh.push({
        id: e.id,
        datum: e.datum,
        vorgang: "Einbehalt (verworfen)",
        bemerkung: e.positionText,
        buchungsbetrag: null,
        wirkung: 0,
        art: "einbehalt_verworfen",
      });
    }
  }

  // Einzahlung aus der Zeit vor dem Buchhaltungsbeginn: steht nicht im Journal, gilt aber als in
  // Höhe des Kaution-Solls erfolgt. Wird nach dem Sortieren vorangestellt (ohne Datum würde sie
  // sonst ans Ende rutschen).
  const vorBuchhaltung: Roh | null =
    input.einzahlungUnbekannt && eingezahlt === 0 && input.sollBetrag
      ? {
          id: "einzahlung-vor-buchhaltung",
          datum: null,
          vorgang: "Einzahlung Mieter",
          bemerkung: "vor Buchhaltungsbeginn, Datum unbekannt",
          buchungsbetrag: null,
          wirkung: input.sollBetrag,
          art: "einzahlung",
        }
      : null;
  if (vorBuchhaltung) eingezahlt += vorBuchhaltung.wirkung;

  // Zinsen in der Auflösung: die Sparkasse zahlt beim Auflösen Kaution + Zinsen aus, gebucht wird
  // nur der Gesamtbetrag. Was vom Kautionskonto mehr zurückkam als hinging (angelegte Beträge, oder
  // ohne gebuchte Anlage die eingezahlte Kaution), steht dem Mieter als Zins zu — aber nur bis zu
  // einer großzügigen Obergrenze nach historischen Sparbuchzinsen (siehe maxZinsfaktor), damit eine
  // größere Differenz als möglicher Buchungsfehler sichtbar bleibt.
  const hin = anlageAusgehend > TOLERANZ ? anlageAusgehend : eingezahlt;
  const zinsen = aufloesung > TOLERANZ ? r2(rueckfluss - hin) : 0;
  const zinsenObergrenze =
    aufloesungsDatum !== null ? hin * (maxZinsfaktor(ersteAnlage ?? input.mietbeginn ?? null, aufloesungsDatum) - 1) + 1 : 0;
  if (zinsen > TOLERANZ && zinsen <= zinsenObergrenze) {
    sonstiges += zinsen;
    roh.push({
      id: ZINSEN_ZEILE_ID,
      datum: aufloesungsDatum,
      vorgang: "Zinsen (in Auflösung enthalten)",
      bemerkung: "Differenz zwischen Auflösungsbetrag und angelegter Kaution",
      buchungsbetrag: null,
      wirkung: zinsen,
      art: "sonstiges",
    });
  }

  // Chronologisch; ohne Datum ans Ende. Bei gleichem Datum Einzahlungen vor Abgängen.
  const reihenfolge: Record<KautionskontoZeile["art"], number> = {
    einzahlung: 0,
    sonstiges: 1,
    umbuchung: 2,
    einbehalt: 3,
    einbehalt_offen: 4,
    einbehalt_verworfen: 5,
    auszahlung: 6,
  };
  roh.sort((a, b) => {
    const ta = a.datum ? a.datum.getTime() : Number.POSITIVE_INFINITY;
    const tb = b.datum ? b.datum.getTime() : Number.POSITIVE_INFINITY;
    return ta - tb || reihenfolge[a.art] - reihenfolge[b.art];
  });
  if (vorBuchhaltung) roh.unshift(vorBuchhaltung);
  let stand = 0;
  const zeilen = roh.map((z) => {
    stand = r2(stand + z.wirkung);
    return { ...z, stand };
  });

  const einbehalteSumme = r2(einbehaltePositionen.filter((e) => e.unstrittig).reduce((s, e) => s + e.betrag, 0));
  const strittigOffenSumme = r2(einbehaltePositionen.filter((e) => !e.unstrittig).reduce((s, e) => s + e.betrag, 0));
  const ausgezahltSumme = r2(ausgezahlt.reduce((s, e) => s + e.betrag, 0));
  const guthaben = r2(eingezahlt + sonstiges);
  const restbetrag = r2(guthaben - einbehalteSumme - strittigOffenSumme);
  // Noch offen gegenüber dem Mieter ohne die strittigen Einbehalte (die bleiben bis zur Klärung
  // zurückbehalten und werden danach entweder gebucht oder nachträglich ausgezahlt).
  const nochOffen = r2(restbetrag - ausgezahltSumme);

  const aufKautionskonto = anlage - aufloesung > TOLERANZ;
  const abgerechnet = ausgezahltSumme > TOLERANZ || einbehalteSumme > TOLERANZ;
  const status: Kautionskonto["status"] =
    zeilen.length === 0 && !input.sollBetrag
      ? "KEINE"
      : abgerechnet && Math.abs(nochOffen) < TOLERANZ && strittigOffenSumme < TOLERANZ
        ? "ABGERECHNET"
        : aufloesung > TOLERANZ
          ? "AUFGELOEST"
          : eingezahlt > TOLERANZ
            ? "HINTERLEGT"
            : "OFFEN";

  return {
    sollBetrag: input.sollBetrag,
    zeilen,
    stand,
    aufKautionskonto,
    status,
    abrechnung: {
      eingezahlt: r2(eingezahlt),
      erhaltenAm,
      sonstiges: r2(sonstiges),
      guthaben,
      einbehaltePositionen,
      einbehalteSumme,
      strittigOffenSumme,
      restbetrag,
      ausgezahlt,
      ausgezahltSumme,
      nochOffen,
    },
  };
}
