// Jahresbericht Kontoführung: alle Kontobewegungen eines Jahres als Journal mit fortlaufendem
// Kontostand. Die Zahlen folgen exakt der Kontostand-Seite und dem Kontenabgleich der Jahresübersicht
// (gleiche Buchungsauswahl, gleiches Vorzeichen, gleicher Anker) — der Endbestand wird zur Kontrolle
// unabhängig über `kontostandAmStichtag` nachgerechnet (Rechenprobe im Bericht).
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { mieterName } from "@/lib/mieter-name";

export const NICHT_ZUGEORDNET = "NICHT_ZUGEORDNET";

// Kurzbezeichnungen der Buchungsarten für die Tabelle (Fallback: Bezeichnung aus dem Katalog).
const ART_KURZ: Record<string, string> = {
  MIETZAHLUNG: "Miete",
  SONDERZAHLUNG: "Gebührenzahlung",
  KOSTENPOSITION: "Kosten",
  MIETWEITERLEITUNG: "Mietweiterleitung",
  NEBENKOSTENAUSGLEICH: "NK-Ausgleich",
  KAUTION_EINZAHLUNG: "Kaution Einzahlung",
  KAUTION_ANLAGE: "Kaution Anlage",
  KAUTION_AUFLOESUNG: "Kaution Auflösung",
  KAUTION_AUSZAHLUNG: "Kaution Auszahlung",
  KAUTION_SONSTIGES: "Kaution Sonstiges",
  KAUTION_VIRTUELLE_AUSZAHLUNG: "Kaution Verrechnung",
  DARLEHEN_TILGUNG: "Darlehenstilgung",
  [NICHT_ZUGEORDNET]: "Nicht zugeordnet",
};

// Reihenfolge der Arten in der Zusammenfassung.
const ART_REIHENFOLGE = [
  "MIETZAHLUNG",
  "SONDERZAHLUNG",
  "NEBENKOSTENAUSGLEICH",
  "KOSTENPOSITION",
  "MIETWEITERLEITUNG",
  "DARLEHEN_TILGUNG",
  "KAUTION_EINZAHLUNG",
  "KAUTION_ANLAGE",
  "KAUTION_AUFLOESUNG",
  "KAUTION_AUSZAHLUNG",
  "KAUTION_VIRTUELLE_AUSZAHLUNG",
  "KAUTION_SONSTIGES",
  NICHT_ZUGEORDNET,
];

export type JournalZeile = {
  nr: number;
  datum: Date;
  artCode: string;
  art: string;
  eurRelevant: boolean | null; // null = nicht zugeordnet
  gegenpartei: string;
  zweck: string;
  zuordnung: string;
  // Vorzeichen wie auf dem Kontoauszug: positiv = eingegangen, negativ = abgegangen.
  betrag: number;
  kontostand: number;
};

export type ArtSumme = {
  artCode: string;
  art: string;
  eurRelevant: boolean | null;
  anzahl: number;
  einnahmen: number;
  ausgaben: number; // negativ
  saldo: number;
};

export type MonatsSumme = {
  monat: number; // 1–12
  anfang: number;
  einnahmen: number;
  ausgaben: number; // negativ
  ende: number;
  anzahl: number;
};

export type StornoZeile = {
  datum: Date;
  artCode: string;
  art: string;
  gegenpartei: string;
  zweck: string;
  betrag: number;
  storniertAm: Date | null;
  storniertVon: string | null;
};

export type Kontrollwert = { datum: Date; bank: number; berechnet: number; differenz: number; notiz: string | null };

export type Jahresjournal = {
  jahr: number;
  objekt: { name: string; adresse: string } | null;
  anker: { datum: Date; betrag: number };
  anfangsbestand: number;
  endbestand: number;
  endbestandUnabhaengig: number;
  rechenprobeDifferenz: number;
  einnahmen: number;
  ausgaben: number; // negativ
  zeilen: JournalZeile[];
  arten: ArtSumme[];
  monate: MonatsSumme[];
  kontrollen: Kontrollwert[];
  verifikation: { bank: number; berechnet: number; differenz: number } | null;
  stornoAnzahl: number;
  stornos: StornoZeile[] | null; // nur auf Wunsch geladen
};

const rund = (n: number) => Math.round(n * 100) / 100;

/** Kostenpositionen tragen intern das umgekehrte Vorzeichen (positiv = Ausgabe) — wie im Kontostand. */
function bankBetrag(code: string, roh: number): number {
  return code === "KOSTENPOSITION" ? -roh : roh;
}

const artName = (code: string, bezeichnung?: string) => ART_KURZ[code] ?? bezeichnung ?? code;

function textOderLeer(s: string | null | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

type BuchungRoh = Awaited<ReturnType<typeof ladeBuchungen>>[number];

async function ladeBuchungen(von: Date, bis: Date) {
  return prisma.buchung.findMany({
    where: { buchungsart: { zahlungswirksam: true }, datum: { gte: von, lte: bis }, ...AKTIVE_BUCHUNG_FILTER },
    // `rohdaten` (schwere Spalte) bewusst nicht laden.
    select: {
      id: true,
      datum: true,
      betrag: true,
      empfaenger: true,
      verwendungszweck: true,
      bemerkung: true,
      periodeMonat: true,
      periodeJahr: true,
      jahr: true,
      erstelltAm: true,
      buchungsart: { select: { code: true, bezeichnung: true, eurRelevant: true } },
      kostenart: { select: { name: true } },
      einheit: { select: { bezeichnung: true } },
      gebaeude: { select: { strasse: true, hausnummer: true } },
      kostengruppe: { select: { bezeichnung: true } },
      mietvertrag: {
        select: {
          einheit: { select: { bezeichnung: true } },
          mieter: { select: { vorname: true, nachname: true } },
        },
      },
    },
  });
}

function zuordnungsText(b: BuchungRoh, datumsJahr: number): string {
  const teile: string[] = [];
  if (b.mietvertrag) {
    teile.push(b.mietvertrag.einheit.bezeichnung);
    const namen = b.mietvertrag.mieter.map((m) => mieterName(m)).filter(Boolean).join(", ");
    if (namen) teile.push(namen);
  } else if (b.einheit) {
    teile.push(b.einheit.bezeichnung);
  } else if (b.gebaeude) {
    teile.push(`${b.gebaeude.strasse} ${b.gebaeude.hausnummer}`);
  } else if (b.kostengruppe) {
    teile.push(b.kostengruppe.bezeichnung);
  }
  if (b.buchungsart.code === "KOSTENPOSITION") {
    if (b.kostenart) teile.unshift(b.kostenart.name);
    if (b.jahr && b.jahr !== datumsJahr) teile.push(`Kostenjahr ${b.jahr}`);
  }
  if (b.buchungsart.code === "MIETZAHLUNG" && b.periodeMonat && b.periodeJahr) {
    teile.push(`Miete ${String(b.periodeMonat).padStart(2, "0")}/${String(b.periodeJahr).slice(2)}`);
  }
  if (b.buchungsart.code === "NEBENKOSTENAUSGLEICH" && b.jahr) teile.push(`Abrechnung ${b.jahr}`);
  return teile.map((t) => t.trim()).filter(Boolean).join(" · ");
}

export async function ladeJahresjournal(jahr: number, optionen: { mitStornos?: boolean } = {}): Promise<Jahresjournal | null> {
  const objekt = await prisma.objekt.findFirst({
    select: { name: true, strasse: true, hausnummer: true, plz: true, ort: true, kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });
  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) return null;
  const anker = { datum: objekt.kontostandAnkerDatum, betrag: Number(objekt.kontostandAnkerBetrag) };

  // Datumsfelder sind UTC-Mitternacht (Import/Formulare) — Jahresgrenzen deshalb ebenfalls in UTC.
  const von = new Date(Date.UTC(jahr, 0, 1));
  const bis = new Date(Date.UTC(jahr, 11, 31, 23, 59, 59, 999));
  const vorjahresende = new Date(von.getTime() - 1);

  const [eintraege, buchungen, geparkt, stornoAnzahl, kontrollenRoh, verifikationRoh] = await Promise.all([
    ladeKontostandEintraege(),
    ladeBuchungen(von, bis),
    prisma.nichtZugeordneteBuchung.findMany({
      where: { datum: { gte: von, lte: bis } },
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true, createdAt: true },
    }),
    prisma.buchung.count({
      where: { buchungsart: { zahlungswirksam: true }, datum: { gte: von, lte: bis }, storniertDurchBuchungId: { not: null } },
    }),
    prisma.kontostandKontrolle.findMany({ where: { datum: { gte: von, lte: bis } }, orderBy: { datum: "asc" } }),
    prisma.kontenabgleichVerifikation.findUnique({ where: { jahr_quartal: { jahr, quartal: 0 } } }),
  ]);

  const anfangsbestand = rund(kontostandAmStichtag(eintraege, anker, vorjahresende));
  const endbestandUnabhaengig = rund(kontostandAmStichtag(eintraege, anker, bis));

  type Roh = Omit<JournalZeile, "nr" | "kontostand"> & { sort: number };
  const roh: Roh[] = [];
  for (const b of buchungen) {
    if (!b.datum) continue;
    const code = b.buchungsart.code;
    roh.push({
      datum: b.datum,
      artCode: code,
      art: artName(code, b.buchungsart.bezeichnung),
      eurRelevant: b.buchungsart.eurRelevant,
      gegenpartei: textOderLeer(b.empfaenger),
      zweck: textOderLeer(b.verwendungszweck) || textOderLeer(b.bemerkung),
      zuordnung: zuordnungsText(b, b.datum.getUTCFullYear()),
      betrag: bankBetrag(code, Number(b.betrag)),
      sort: b.erstelltAm.getTime(),
    });
  }
  for (const g of geparkt) {
    roh.push({
      datum: g.datum,
      artCode: NICHT_ZUGEORDNET,
      art: artName(NICHT_ZUGEORDNET),
      eurRelevant: null,
      gegenpartei: textOderLeer(g.empfaenger),
      zweck: textOderLeer(g.verwendungszweck),
      zuordnung: "",
      betrag: Number(g.betrag),
      sort: g.createdAt.getTime(),
    });
  }
  roh.sort((a, b) => a.datum.getTime() - b.datum.getTime() || a.sort - b.sort);

  // Laufender Kontostand in Cent (Ganzzahl), damit sich keine Gleitkomma-Reste aufsummieren.
  let stand = Math.round(anfangsbestand * 100);
  const zeilen: JournalZeile[] = roh.map((r, i) => {
    stand += Math.round(r.betrag * 100);
    return {
      nr: i + 1,
      datum: r.datum,
      artCode: r.artCode,
      art: r.art,
      eurRelevant: r.eurRelevant,
      gegenpartei: r.gegenpartei,
      zweck: r.zweck,
      zuordnung: r.zuordnung,
      betrag: r.betrag,
      kontostand: stand / 100,
    };
  });
  const endbestand = stand / 100;

  // Zusammenfassung nach Buchungsart.
  const artMap = new Map<string, ArtSumme>();
  for (const z of zeilen) {
    const s = artMap.get(z.artCode) ?? { artCode: z.artCode, art: z.art, eurRelevant: z.eurRelevant, anzahl: 0, einnahmen: 0, ausgaben: 0, saldo: 0 };
    s.anzahl += 1;
    if (z.betrag >= 0) s.einnahmen += z.betrag;
    else s.ausgaben += z.betrag;
    s.saldo += z.betrag;
    artMap.set(z.artCode, s);
  }
  const arten = [...artMap.values()]
    .map((s) => ({ ...s, einnahmen: rund(s.einnahmen), ausgaben: rund(s.ausgaben), saldo: rund(s.saldo) }))
    .sort((a, b) => {
      const ia = ART_REIHENFOLGE.indexOf(a.artCode);
      const ib = ART_REIHENFOLGE.indexOf(b.artCode);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

  // Monatsübersicht (immer alle 12 Monate, damit Anfang/Ende lückenlos aneinander anschließen).
  const monate: MonatsSumme[] = [];
  let laufend = Math.round(anfangsbestand * 100);
  for (let m = 1; m <= 12; m++) {
    const imMonat = zeilen.filter((z) => z.datum.getUTCMonth() === m - 1);
    const anfang = laufend;
    let ein = 0;
    let aus = 0;
    for (const z of imMonat) {
      const c = Math.round(z.betrag * 100);
      if (c >= 0) ein += c;
      else aus += c;
    }
    laufend += ein + aus;
    monate.push({ monat: m, anfang: anfang / 100, einnahmen: ein / 100, ausgaben: aus / 100, ende: laufend / 100, anzahl: imMonat.length });
  }

  const einnahmen = rund(zeilen.filter((z) => z.betrag >= 0).reduce((s, z) => s + z.betrag, 0));
  const ausgaben = rund(zeilen.filter((z) => z.betrag < 0).reduce((s, z) => s + z.betrag, 0));

  const kontrollen: Kontrollwert[] = kontrollenRoh.map((k) => {
    const berechnet = rund(kontostandAmStichtag(eintraege, anker, new Date(k.datum.getTime() + 24 * 60 * 60 * 1000 - 1)));
    const bank = Number(k.betrag);
    return { datum: k.datum, bank, berechnet, differenz: rund(berechnet - bank), notiz: k.notiz };
  });
  const verifikation = verifikationRoh
    ? (() => {
        const bank = Number(verifikationRoh.kontostandLautBankauszug);
        return { bank, berechnet: endbestandUnabhaengig, differenz: rund(endbestandUnabhaengig - bank) };
      })()
    : null;

  let stornos: StornoZeile[] | null = null;
  if (optionen.mitStornos) {
    const originale = await prisma.buchung.findMany({
      where: { buchungsart: { zahlungswirksam: true }, datum: { gte: von, lte: bis }, storniertDurchBuchungId: { not: null } },
      select: {
        datum: true,
        betrag: true,
        empfaenger: true,
        verwendungszweck: true,
        buchungsart: { select: { code: true, bezeichnung: true } },
        storniertDurch: { select: { erstelltAm: true, erstelltVon: true } },
      },
      orderBy: [{ datum: "asc" }, { erstelltAm: "asc" }],
    });
    stornos = originale.map((o) => ({
      datum: o.datum!,
      artCode: o.buchungsart.code,
      art: artName(o.buchungsart.code, o.buchungsart.bezeichnung),
      gegenpartei: textOderLeer(o.empfaenger),
      zweck: textOderLeer(o.verwendungszweck),
      betrag: bankBetrag(o.buchungsart.code, Number(o.betrag)),
      storniertAm: o.storniertDurch?.erstelltAm ?? null,
      storniertVon: o.storniertDurch?.erstelltVon ?? null,
    }));
  }

  return {
    jahr,
    objekt: { name: objekt.name, adresse: `${objekt.strasse} ${objekt.hausnummer}, ${objekt.plz} ${objekt.ort}` },
    anker,
    anfangsbestand,
    endbestand,
    endbestandUnabhaengig,
    rechenprobeDifferenz: rund(endbestand - endbestandUnabhaengig),
    einnahmen,
    ausgaben,
    zeilen,
    arten,
    monate,
    kontrollen,
    verifikation,
    stornoAnzahl,
    stornos,
  };
}
