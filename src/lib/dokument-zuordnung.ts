import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { mieterName } from "@/lib/mieter-name";
import { normalizeText } from "@/lib/import/bank-csv";
import { parseSuchbegriffe, findeDienstleister } from "@/lib/import/dienstleister";
import { extrahiereRechnungsnummern } from "@/lib/import/doppelzahlung";
import { ibanAus } from "@/lib/kosten-doppelzahlung";

// Vorschläge, wohin ein Dokument im Eingang gehört: zu welcher Kostenposition (Buchung), welchem
// Mietvertrag oder Dienstleister. Reine Bewertung über die Labels des Dokuments (Betrag,
// Rechnungsnummer, Aussteller, IBAN, Datum / Adressat, Objekt) — zugeordnet wird erst nach Bestätigung.

export type DokumentLabels = {
  aussteller: string | null;
  rechnungsnummer: string | null;
  /** Wie eine Kostenposition: positiv = Rechnung (Ausgabe), negativ = Gutschrift. */
  betrag: number | null;
  belegDatum: Date | null;
  kostenjahr: number | null;
  iban: string | null;
  adressat: string | null;
  objektHinweis: string | null;
  /** Dokumenttyp; bei einem Angebot zählen Objekt und Zeitraum statt Betrag und Rechnungsnummer. */
  art?: string | null;
};

export type BuchungFuerBewertung = {
  datum: Date | null;
  jahr: number | null;
  betrag: number;
  empfaenger: string | null;
  verwendungszweck: string | null;
  iban: string | null;
  /** Bezeichnung der Einheit der Kostenposition (z.B. „HS 15 WHG 4 - 1OG recht“) bzw. Hausnummer des Gebäudes. */
  einheit?: string | null;
  hausnummer?: string | null;
};

/** hart = Betrag, Rechnungsnummer oder IBAN stimmen — Name, Datum und Jahr allein reichen nicht für einen Vorschlag. */
export type Bewertung = { punkte: number; gruende: string[]; sicher: boolean; hart: boolean };

const cent = (x: number) => Math.round(x * 100);

// Rechtsformen und Allerweltswörter tragen nichts zur Namensähnlichkeit bei.
const FUELLWOERTER = new Set(["gmbh", "mbh", "kg", "ag", "ug", "ohg", "gbr", "eg", "ev", "co", "und", "der", "die", "das", "bau", "service", "gruppe", "haustechnik", "inh", "inhaber"]);

// Einzelne Namenswörter des Ausstellers (z.B. „Wagner - Inh. Oliver Wignanek“ → wagner, oliver, wignanek). normalizeText zieht
// alles zu einem Wort zusammen, deshalb wird vorher an Nicht-Buchstaben getrennt.
function namenstoken(name: string | null): string[] {
  return (name ?? "")
    .split(/[^\p{L}\p{N}]+/u)
    .map((w) => normalizeText(w))
    .filter((t) => t.length >= 4 && !FUELLWOERTER.has(t));
}

function alnum(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Kommt die Rechnungsnummer des Dokuments im Verwendungszweck der Zahlung vor? */
export function rechnungsnummerImText(nummer: string | null, text: string | null): boolean {
  if (!nummer || !text) return false;
  const kern = alnum(nummer).replace(/^0+/, "");
  if (!kern) return false;
  // Kurze Nummern nur über die Schlüsselwort-Erkennung (sonst Zufallstreffer in langen Ziffernfolgen).
  const ueberSchluesselwort = extrahiereRechnungsnummern(text).some((n) => alnum(n.nummer).replace(/^0+/, "") === kern);
  if (ueberSchluesselwort) return true;
  const mindest = /^\d+$/.test(kern) ? 5 : 4;
  return kern.length >= mindest && alnum(text).includes(kern);
}

// Straße vereinheitlichen („Breslauer Straße“ / „Breslauer Str.“ / „Breslauerstr.“ → „breslauer str“).
function normStrasse(s: string): string {
  return s
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/straße|strasse|str\./g, "str")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Hausnummern („…str. 15“) und Wohnungsnummer („Wohnung Nr. 4“, „WHG 4“) aus einer Objektangabe. */
export function objektAusText(text: string): { hausnummern: Set<string>; whg: string | null } {
  const t = normStrasse(text);
  const hausnummern = new Set<string>();
  for (const m of t.matchAll(/str\s*(\d+[a-z]?)(?![0-9a-z])/g)) hausnummern.add(m[1]);
  const whg = t.match(/(?:wohnung|whg|wohn)\s*(?:nr|nummer)?\s*(\d{1,2})(?![0-9])/)?.[1] ?? null;
  return { hausnummern, whg };
}

/** Steht „Straße Hausnummer“ des Gebäudes in der Objektangabe? (Hausnummer als ganzes Wort, damit „2“ nicht „23“ trifft) */
function adresseImText(strasse: string, hausnummer: string, text: string): boolean {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`${esc(normStrasse(strasse))}\\s*${esc(hausnummer.toLowerCase())}(?![0-9a-z])`).test(normStrasse(text));
}

/**
 * Bewertet, wie gut eine Kostenposition zu den Labels eines Dokuments passt. „sicher“ = Betrag stimmt und
 * zusätzlich Rechnungsnummer im Verwendungszweck oder (Empfänger/IBAN passt und die Zahlung liegt zeitlich
 * nach dem Beleg).
 */
export function bewerteBuchung(d: DokumentLabels, b: BuchungFuerBewertung): Bewertung {
  let punkte = 0;
  const gruende: string[] = [];

  let betragGleich = false;
  if (d.betrag !== null) {
    if (cent(d.betrag) === cent(b.betrag)) {
      punkte += 50;
      betragGleich = true;
      gruende.push("Betrag stimmt");
    } else if (cent(Math.abs(d.betrag)) === cent(Math.abs(b.betrag))) {
      punkte += 15;
      gruende.push("Betrag gleich, Vorzeichen abweichend");
    }
  }

  const nummerTreffer = rechnungsnummerImText(d.rechnungsnummer, b.verwendungszweck);
  if (nummerTreffer) {
    punkte += 40;
    gruende.push("Rechnungsnummer im Verwendungszweck");
  }

  const ibanTreffer = !!d.iban && !!b.iban && d.iban.replace(/\s/g, "").toUpperCase() === b.iban.replace(/\s/g, "").toUpperCase();
  if (ibanTreffer) {
    punkte += 30;
    gruende.push("IBAN stimmt");
  }

  const text = normalizeText(`${b.empfaenger ?? ""} ${b.verwendungszweck ?? ""}`);
  const nameTreffer = namenstoken(d.aussteller).some((t) => text.includes(t));
  if (nameTreffer) {
    punkte += 20;
    gruende.push("Aussteller passt zum Empfänger");
  }

  // Angebot: es hat keine eigene Zahlung — die Rechnung zum Auftrag trägt eine andere Nummer und oft einen anderen Betrag
  // (Aufwand nach Nachweis). Maßgeblich sind Objekt (Haus und Wohnung), Aussteller und Zeitraum bis zu einem Jahr danach.
  const angebot = d.art === "ANGEBOT";
  let objektStark = false;
  if (angebot && d.objektHinweis) {
    const o = objektAusText(d.objektHinweis);
    const hn = (b.hausnummer ?? b.einheit?.match(/HS\s*(\d+[a-z]?)/i)?.[1] ?? "").toLowerCase();
    const whg = b.einheit?.match(/WHG\s*(\d+)/i)?.[1] ?? null;
    if (hn && o.hausnummern.has(hn)) {
      if (whg && o.whg === whg) {
        punkte += 45;
        objektStark = true;
        gruende.push("Objekt passt (Haus und Wohnung)");
      } else if (!whg && !o.whg) {
        punkte += 25;
        objektStark = true;
        gruende.push("Objekt passt (Haus)");
      } else {
        punkte += 10;
        gruende.push("Haus passt");
      }
    }
  }

  let datumPassend = false;
  if (d.belegDatum && b.datum) {
    const tage = (b.datum.getTime() - d.belegDatum.getTime()) / 86400000;
    if (tage >= -10 && tage <= (angebot ? 400 : 150)) {
      punkte += 10;
      datumPassend = true;
      gruende.push("Zahlung zeitlich passend zum Beleg");
    }
  }

  const jahr = b.jahr ?? b.datum?.getUTCFullYear() ?? null;
  if (d.kostenjahr && jahr === d.kostenjahr) {
    punkte += 5;
    gruende.push("Kostenjahr stimmt");
  }

  const sicher = betragGleich && (nummerTreffer || ((ibanTreffer || nameTreffer) && datumPassend));
  // Ein Angebot braucht neben dem Objekt auch einen passenden Aussteller, sonst stünde jede Kostenposition der Einheit zur Wahl.
  return { punkte, gruende, sicher, hart: betragGleich || nummerTreffer || ibanTreffer || (angebot && objektStark && nameTreffer) };
}

export type BuchungVorschlag = {
  buchungId: string;
  datum: string | null;
  empfaenger: string;
  kostenart: string;
  verwendungszweck: string;
  betrag: number;
  /** Anzahl der Belege, die schon an dieser Kostenposition hängen. */
  belege: number;
  bewertung: Bewertung;
};

const MIN_PUNKTE = 30;

/** Kandidaten: aktive Kostenpositionen im passenden Zeitraum (Beleg-/Kostenjahr bzw. letzte 15 Monate). */
export async function ladeBuchungVorschlaege(d: DokumentLabels, max = 8): Promise<BuchungVorschlag[]> {
  const heute = new Date();
  const bezug = d.belegDatum ?? (d.kostenjahr ? new Date(Date.UTC(d.kostenjahr, 6, 1)) : heute);
  const von = new Date(bezug.getTime() - 120 * 86400000);
  const bis = new Date(bezug.getTime() + (d.art === "ANGEBOT" ? 420 : 330) * 86400000);

  const kandidaten = await prisma.buchung.findMany({
    where: {
      buchungsart: { code: "KOSTENPOSITION" },
      ...AKTIVE_BUCHUNG_FILTER,
      OR: [{ datum: { gte: von, lte: bis } }, { datum: null, jahr: d.kostenjahr ?? bezug.getUTCFullYear() }],
    },
    select: {
      id: true, datum: true, jahr: true, betrag: true, empfaenger: true, verwendungszweck: true,
      kostenart: { select: { name: true } },
      einheit: { select: { bezeichnung: true, gebaeude: { select: { hausnummer: true } } } },
      gebaeude: { select: { hausnummer: true } },
      _count: { select: { dokumente: { where: { ausgeblendetAm: null } } } },
    },
    take: 1500,
  });

  const bewertet = kandidaten.map((k) => ({
    k,
    bewertung: bewerteBuchung(d, {
      datum: k.datum, jahr: k.jahr, betrag: Number(k.betrag), empfaenger: k.empfaenger, verwendungszweck: k.verwendungszweck, iban: null,
      einheit: k.einheit?.bezeichnung ?? null, hausnummer: k.gebaeude?.hausnummer ?? k.einheit?.gebaeude.hausnummer ?? null,
    }),
  }));

  // IBAN steckt in der Bankzeile: nur für die aussichtsreichen Kandidaten nachladen und neu bewerten.
  if (d.iban) {
    const aussichtsreich = bewertet.filter((x) => x.bewertung.punkte >= 15).slice(0, 60);
    const roh = await prisma.buchung.findMany({ where: { id: { in: aussichtsreich.map((x) => x.k.id) } }, select: { id: true, rohdaten: true } });
    const ibans = new Map(roh.map((r) => [r.id, ibanAus(r.rohdaten)]));
    for (const x of aussichtsreich) {
      x.bewertung = bewerteBuchung(d, {
        datum: x.k.datum, jahr: x.k.jahr, betrag: Number(x.k.betrag), empfaenger: x.k.empfaenger,
        verwendungszweck: x.k.verwendungszweck, iban: ibans.get(x.k.id) ?? null,
        einheit: x.k.einheit?.bezeichnung ?? null, hausnummer: x.k.gebaeude?.hausnummer ?? x.k.einheit?.gebaeude.hausnummer ?? null,
      });
    }
  }

  return bewertet
    .filter((x) => x.bewertung.hart && x.bewertung.punkte >= MIN_PUNKTE)
    .sort((a, b) => Number(b.bewertung.sicher) - Number(a.bewertung.sicher) || b.bewertung.punkte - a.bewertung.punkte)
    .slice(0, max)
    .map(({ k, bewertung }) => ({
      buchungId: k.id,
      datum: k.datum?.toISOString().slice(0, 10) ?? null,
      empfaenger: k.empfaenger ?? "",
      kostenart: k.kostenart?.name ?? "",
      verwendungszweck: k.verwendungszweck ?? "",
      betrag: Number(k.betrag),
      belege: k._count.dokumente,
      bewertung,
    }));
}

/** Auswahlliste für die manuelle Zuordnung: Kostenpositionen im selben Zeitfenster, neueste zuerst. */
export async function ladeBuchungAuswahl(d: DokumentLabels): Promise<{ id: string; label: string }[]> {
  const bezug = d.belegDatum ?? (d.kostenjahr ? new Date(Date.UTC(d.kostenjahr, 6, 1)) : new Date());
  const von = new Date(bezug.getTime() - 240 * 86400000);
  const bis = new Date(bezug.getTime() + 420 * 86400000);
  const liste = await prisma.buchung.findMany({
    where: {
      buchungsart: { code: "KOSTENPOSITION" },
      ...AKTIVE_BUCHUNG_FILTER,
      OR: [{ datum: { gte: von, lte: bis } }, { datum: null, jahr: d.kostenjahr ?? bezug.getUTCFullYear() }],
    },
    orderBy: { datum: "desc" },
    take: 400,
    select: { id: true, datum: true, betrag: true, empfaenger: true, kostenart: { select: { name: true } } },
  });
  const euro = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" });
  return liste.map((k) => ({
    id: k.id,
    label: `${k.datum ? k.datum.toISOString().slice(0, 10).split("-").reverse().join(".") : "ohne Datum"} · ${k.empfaenger ?? "–"} · ${k.kostenart?.name ?? "–"} · ${euro.format(Number(k.betrag))}`,
  }));
}

export type VertragVorschlag = { mietvertragId: string; label: string; punkte: number; gruende: string[] };

/** Mietvertrag-Vorschläge über Adressat (Mietername) und Objektangabe (Straße, Wohnung) des Belegs. */
export async function ladeMietvertragVorschlaege(d: DokumentLabels, max = 5): Promise<VertragVorschlag[]> {
  if (!d.adressat && !d.objektHinweis) return [];
  const vertraege = await prisma.mietvertrag.findMany({
    include: { mieter: true, einheit: { include: { gebaeude: true } } },
  });
  // Der Mietername steht je nach Dokument beim Adressaten oder bei „Objekt: Name, Wohnung …“.
  const adressat = normalizeText(`${d.adressat ?? ""} ${d.objektHinweis ?? ""}`);
  const objekt = normalizeText(`${d.objektHinweis ?? ""} ${d.adressat ?? ""}`);

  return vertraege
    .map((v) => {
      let punkte = 0;
      const gruende: string[] = [];
      const namen = v.mieter.filter((m) => normalizeText(m.nachname).length >= 3 && adressat.includes(normalizeText(m.nachname)));
      if (namen.length > 0) {
        punkte += 50;
        gruende.push(`Name „${namen.map((m) => m.nachname).join(" & ")}“ im Dokument`);
        if (namen.some((m) => m.vorname && adressat.includes(normalizeText(m.vorname)))) punkte += 10;
      }
      const g = v.einheit.gebaeude;
      const strasse = normalizeText(`${g.strasse} ${g.hausnummer}`);
      if (d.objektHinweis && objekt.includes(strasse)) {
        punkte += 25;
        gruende.push("Adresse passt");
        const bez = normalizeText(v.einheit.bezeichnung);
        if (bez.length >= 3 && objekt.includes(bez)) {
          punkte += 15;
          gruende.push("Wohnung passt");
        }
      }
      return {
        mietvertragId: v.id,
        label: `${g.strasse} ${g.hausnummer} – ${v.einheit.bezeichnung} (${v.mieter.map(mieterName).join(" & ") || "ohne Mieter"})${v.status === "BEENDET" ? " – beendet" : ""}`,
        punkte,
        gruende,
      };
    })
    .filter((x) => x.punkte >= 50)
    .sort((a, b) => b.punkte - a.punkte)
    .slice(0, max);
}

export type GebaeudeVorschlag = { gebaeudeId: string; label: string };

/** Gebäude-Vorschläge: „Straße Hausnummer“ steht in der Objektangabe des Belegs. */
export async function ladeGebaeudeVorschlaege(d: DokumentLabels, max = 3): Promise<GebaeudeVorschlag[]> {
  if (!d.objektHinweis) return [];
  const gebaeude = await prisma.gebaeude.findMany({ select: { id: true, strasse: true, hausnummer: true } });
  return gebaeude
    .filter((g) => adresseImText(g.strasse, g.hausnummer, d.objektHinweis!))
    .slice(0, max)
    .map((g) => ({ gebaeudeId: g.id, label: `${g.strasse} ${g.hausnummer}` }));
}

export type EinheitVorschlag = { einheitId: string; label: string };

/** Einheit-Vorschläge: Gebäude über die Adresse und die Wohnung über „Wohnung Nr. 4“ / „WHG 4“ in der Objektangabe. */
export async function ladeEinheitVorschlaege(d: DokumentLabels, max = 3): Promise<EinheitVorschlag[]> {
  if (!d.objektHinweis) return [];
  const whg = objektAusText(d.objektHinweis).whg;
  if (!whg) return [];
  const einheiten = await prisma.einheit.findMany({ include: { gebaeude: true } });
  return einheiten
    .filter((e) => adresseImText(e.gebaeude.strasse, e.gebaeude.hausnummer, d.objektHinweis!) && e.bezeichnung.match(/WHG\s*(\d+)/i)?.[1] === whg)
    .slice(0, max)
    .map((e) => ({ einheitId: e.id, label: `${e.gebaeude.strasse} ${e.gebaeude.hausnummer} – ${e.bezeichnung}` }));
}

export type DienstleisterVorschlag = { dienstleisterId: string; name: string };

/** Dienstleister, dessen Suchbegriff im Aussteller des Belegs vorkommt (gleiche Regel wie im Kosten-Import). */
export async function ladeDienstleisterVorschlag(aussteller: string | null): Promise<DienstleisterVorschlag | null> {
  if (!aussteller) return null;
  const liste = (await prisma.dienstleister.findMany({ select: { id: true, name: true, suchbegriffe: true } })).map((x) => ({
    id: x.id, name: x.name, suchbegriffe: parseSuchbegriffe(x.suchbegriffe), kostenartIds: [],
  }));
  const treffer = findeDienstleister(aussteller, "", liste);
  return treffer ? { dienstleisterId: treffer.id, name: treffer.name } : null;
}

export type EingangFuerBuchung = {
  dokumentId: string;
  dateiname: string;
  aussteller: string | null;
  rechnungsnummer: string | null;
  betrag: number | null;
  bewertung: Bewertung;
};

/** Umgekehrte Richtung: passende Dokumente im Eingang zu einer Kostenposition (Hinweis auf deren Seite). */
export async function ladeEingangFuerBuchung(b: BuchungFuerBewertung): Promise<EingangFuerBuchung[]> {
  const dokumente = await prisma.dokument.findMany({
    where: { eingang: true, ausgeblendetAm: null },
    select: {
      id: true, dateiname: true, aussteller: true, rechnungsnummer: true, betrag: true, belegDatum: true,
      kostenjahr: true, iban: true, adressat: true, objektHinweis: true, art: true,
    },
  });
  return dokumente
    .map((x) => ({
      dokumentId: x.id,
      dateiname: x.dateiname,
      aussteller: x.aussteller,
      rechnungsnummer: x.rechnungsnummer,
      betrag: x.betrag === null ? null : Number(x.betrag),
      bewertung: bewerteBuchung(
        {
          aussteller: x.aussteller, rechnungsnummer: x.rechnungsnummer, betrag: x.betrag === null ? null : Number(x.betrag),
          belegDatum: x.belegDatum, kostenjahr: x.kostenjahr, iban: x.iban, adressat: x.adressat, objektHinweis: x.objektHinweis, art: x.art,
        },
        b,
      ),
    }))
    .filter((x) => x.bewertung.hart && x.bewertung.punkte >= MIN_PUNKTE)
    .sort((a, b) => Number(b.bewertung.sicher) - Number(a.bewertung.sicher) || b.bewertung.punkte - a.bewertung.punkte)
    .slice(0, 5);
}
