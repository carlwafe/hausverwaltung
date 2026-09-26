// Kautionskonto eines Mietvertrags: alle Kautionsbewegungen chronologisch mit laufendem Stand des
// Kautionsguthabens des Mieters, dazu die Kautionsabrechnung bei Mietende (Guthaben ./. Einbehalte
// ./. bereits ausgezahlt = noch auszuzahlen). Reine Darstellung auf Basis der Journalbuchungen
// (Kontokreis KAUTIONSKONTO) und der KautionEinbehalt-Zeilen — gespeichert wird nichts.
//
// Wirkung auf das Guthaben des Mieters:
//  - KAUTION_EINZAHLUNG: + (Einzahlung des Mieters)
//  - KAUTION_ANLAGE / KAUTION_AUFLOESUNG: 0 (nur Umbuchung zwischen Geschäfts- und Kautionskonto)
//  - KAUTION_AUSZAHLUNG / KAUTION_VIRTUELLE_AUSZAHLUNG: − (an den Mieter bzw. für ihn bezahlt)
//  - KAUTION_SONSTIGES: mit Buchungsvorzeichen (z.B. Zinsen +, Kontoführungsgebühr −)
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
const r2 = (v: number) => Math.round(v * 100) / 100;

const EINBEHALT_STATUS_TEXT: Record<KautionEinbehaltEingabe["status"], string> = {
  UNSTRITTIG: "unstrittig",
  STRITTIG_OFFEN: "strittig, offen",
  STRITTIG_BESTAETIGT: "strittig, bestätigt",
  STRITTIG_VERWORFEN: "verworfen",
};

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export function baueKautionskonto(input: {
  sollBetrag: number | null;
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
      if (istAnlage) anlage += Math.abs(b.betrag);
      else aufloesung += Math.abs(b.betrag);
      roh.push({
        id: b.id,
        datum: b.datum,
        vorgang: istAnlage ? "Anlage auf Kautionskonto" : "Auflösung Kautionskonto",
        bemerkung,
        buchungsbetrag: b.betrag,
        wirkung: 0,
        art: "umbuchung",
      });
    } else if (b.code === "KAUTION_AUSZAHLUNG" || b.code === "KAUTION_VIRTUELLE_AUSZAHLUNG") {
      const w = -Math.abs(b.betrag);
      const virtuell = b.code === "KAUTION_VIRTUELLE_AUSZAHLUNG";
      const text = virtuell ? "Verrechnet mit bezahlter Rechnung" : "Auszahlung an Mieter";
      ausgezahlt.push({ text, betrag: -w, datum: b.datum, hinweis: b.verwendungszweck ?? undefined });
      roh.push({ id: b.id, datum: b.datum, vorgang: text, bemerkung, buchungsbetrag: b.betrag, wirkung: w, art: "auszahlung" });
    } else {
      sonstiges += b.betrag;
      roh.push({ id: b.id, datum: b.datum, vorgang: b.bezeichnung.replace(/^Kaution:\s*/, ""), bemerkung, buchungsbetrag: b.betrag, wirkung: b.betrag, art: "sonstiges" });
    }
  }

  const einbehaltePositionen: KautionEinbehaltPosten[] = [];
  for (const e of input.einbehalte) {
    const nk = e.nkJahr !== null ? `mit Nebenkostenabrechnung ${e.nkJahr} verrechnet` : undefined;
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
