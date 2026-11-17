// Einzugslauf der Mieten per SEPA-Lastschrift: wer wird für einen Mietmonat mit welchem Betrag eingezogen, und die
// daraus gebaute pain.008-Datei. Nur lesend (schreibt nichts ins Journal); Dateiaufbau in `sepa-pain008.ts`,
// Regeln und Abnahme in docs/sepa-lastschrift.md. Gläubiger- und Mandatsdaten kommen aus der DB, nie aus dem Quelltext.
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ermittleMieteFuerMonat, mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import { mandatDetailsAusEinzug } from "@/lib/lastschrift-mandat";
import { glaeubigerIdGueltig } from "@/lib/sepa-mandat";
import { baueLastschriftPain008, bereinigeIban, ibanGueltig, type SepaEinzug } from "@/lib/sepa-pain008";
import { mieterName } from "@/lib/mieter-name";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { heuteDeutschland, isoDatum, istTargetTag, nterTargetTag, targetTageZwischen } from "@/lib/target-tage";

const cent = (x: number) => Math.round(x * 100);

export type EinzugsZeile = {
  vertragId: string;
  einheit: string;
  mieter: string;
  betragCent: number;
  /** Betrag des letzten Monatseinzugs im Journal (Einzug in den ersten 7 Tagen eines Monats); null = noch keiner. */
  letzterEinzugCent: number | null;
  /** Anzahl Rücklastschriften auf diesem Vertrag in den letzten 6 Monaten. */
  ruecklastschriften: number;
  folge: SepaEinzug["folge"];
  ausgenommen: boolean;
};

export type AusgelasseneZeile = { vertragId: string; einheit: string; mieter: string; grund: string };

export type Einzugslauf = {
  jahr: number;
  monat: number;
  faelligAm: string;
  /** Hinweis zum Termin (liegt zu nah, kein Bankarbeitstag …), sonst null. */
  terminHinweis: string | null;
  /** Fehlende Gläubigerangaben am Objekt; leer = in Ordnung. */
  glaeubigerProbleme: string[];
  zeilen: EinzugsZeile[];
  ausgelassen: AusgelasseneZeile[];
  /** Summe und Anzahl der tatsächlich enthaltenen (nicht ausgenommenen) Einzüge. */
  anzahl: number;
  summeCent: number;
  /** Die Datei; null, wenn sie sich nicht bauen lässt (Grund in `dateiFehler`). */
  xml: string | null;
  dateiFehler: string | null;
  dateiname: string;
};

export type EinzugslaufParameter = {
  jahr: number;
  monat: number;
  /** Einzugstermin (yyyy-mm-dd); sonst der 3. Bankarbeitstag des Monats. */
  faelligAm?: string | null;
  /** Vertrags-IDs, die diesmal nicht eingezogen werden. */
  ohne?: string[];
};

export async function ladeEinzugslauf({ jahr, monat, faelligAm: terminWunsch, ohne = [] }: EinzugslaufParameter): Promise<Einzugslauf> {
  const monatsEnde = new Date(Date.UTC(jahr, monat, 0));
  const monatText = String(monat).padStart(2, "0");

  const standardTermin = isoDatum(nterTargetTag(jahr, monat, 3));
  const faelligAm = terminWunsch && /^\d{4}-\d{2}-\d{2}$/.test(terminWunsch) ? terminWunsch : standardTermin;
  const termin = new Date(`${faelligAm}T00:00:00Z`);
  let terminHinweis: string | null = null;
  if (Number.isNaN(termin.getTime()) || !istTargetTag(termin)) {
    terminHinweis = "Der Einzugstermin ist kein Bankarbeitstag (TARGET); die Bank lehnt die Datei sonst ab oder verschiebt sie.";
  } else if (targetTageZwischen(heuteDeutschland(), termin) < 1) {
    terminHinweis = "Der Einzugstermin liegt heute oder in der Vergangenheit. Für Core-Lastschriften braucht die Bank mindestens einen Bankarbeitstag Vorlauf.";
  }

  const objekt = await prisma.objekt.findFirst();
  const glaeubigerId = (objekt?.sepaGlaeubigerId ?? "").replace(/\s+/g, "").toUpperCase();
  const glaeubigerProbleme: string[] = [];
  if (!objekt?.sepaGlaeubigerName) glaeubigerProbleme.push("Gläubigername fehlt");
  if (!glaeubigerId || !glaeubigerIdGueltig(glaeubigerId)) glaeubigerProbleme.push("Gläubiger-ID fehlt oder ist ungültig");
  if (!objekt?.mietkontoIban || !ibanGueltig(objekt.mietkontoIban)) glaeubigerProbleme.push("IBAN des Mietkontos fehlt oder ist ungültig");

  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "GEPLANT"] }, zahlungsweg: "LASTSCHRIFT" },
    include: {
      mieter: true,
      einheit: { include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } },
      mieterhoehungen: true,
      mietnachlaesse: true,
    },
  });
  const sortiert = sortEinheitenNachGebaeude(vertraege.map((v) => ({ v, bezeichnung: v.einheit.bezeichnung, gebaeude: v.einheit.gebaeude }))).map((x) => x.v);

  const ids = sortiert.map((v) => v.id);
  const zahlungen = await prisma.buchung.findMany({
    where: { ...AKTIVE_BUCHUNG_FILTER, mietvertragId: { in: ids }, buchungsart: { code: "MIETZAHLUNG" }, rohdaten: { not: null as never } },
    select: { mietvertragId: true, datum: true, betrag: true, rohdaten: true },
    orderBy: { datum: "asc" },
  });
  const einzuegeJournal = zahlungen.flatMap((z) => {
    const d = mandatDetailsAusEinzug(z.rohdaten);
    return d && z.mietvertragId && z.datum ? [{ vertragId: z.mietvertragId, datum: z.datum, betrag: Number(z.betrag), referenz: d.referenz }] : [];
  });

  // Rücklastschriften der letzten 6 Monate (negative Mietzahlung mit RUECKLASTSCHRIFT in Bemerkung/Verwendungszweck).
  const rueckSeit = new Date(Date.UTC(jahr, monat - 1 - 6, 1));
  const rueck = await prisma.buchung.findMany({
    where: {
      ...AKTIVE_BUCHUNG_FILTER,
      mietvertragId: { in: ids },
      buchungsart: { code: "MIETZAHLUNG" },
      betrag: { lt: 0 },
      datum: { gte: rueckSeit },
      OR: [{ bemerkung: { contains: "RUECKLASTSCHRIFT", mode: "insensitive" } }, { verwendungszweck: { contains: "RUECKLASTSCHRIFT", mode: "insensitive" } }],
    },
    select: { mietvertragId: true },
  });
  const rueckProVertrag = new Map<string, number>();
  for (const r of rueck) if (r.mietvertragId) rueckProVertrag.set(r.mietvertragId, (rueckProVertrag.get(r.mietvertragId) ?? 0) + 1);

  const erwartet = (v: (typeof vertraege)[number]) => {
    const miete = ermittleMieteFuerMonat(
      {
        kaltmiete: Number(v.kaltmiete),
        nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
        mieterhoehungen: v.mieterhoehungen.map((h) => ({ ...h, kaltmiete: Number(h.kaltmiete), nebenkostenVorauszahlung: Number(h.nebenkostenVorauszahlung) })) as never,
      },
      jahr,
      monat,
    );
    const nachlass = mietnachlaesseFuerSoll(v.mietnachlaesse).filter((n) => n.jahr === jahr && n.monat === monat).reduce((s, n) => s + n.betrag, 0);
    return cent(miete.kaltmiete - nachlass + miete.nebenkostenVorauszahlung + Number(v.mehrwertsteuer ?? 0));
  };

  const zeilen: EinzugsZeile[] = [];
  const einzuege: { vertragId: string; einzug: SepaEinzug }[] = [];
  const ausgelassen: AusgelasseneZeile[] = [];
  const vor36 = new Date(Date.UTC(jahr, monat - 1 - 36, 1));
  const ohneMenge = new Set(ohne);

  for (const v of sortiert) {
    const einheit = v.einheit.bezeichnung.split(" - ")[0];
    const name = v.mieter.map(mieterName).join(" / ");
    const aus = (grund: string) => ausgelassen.push({ vertragId: v.id, einheit, mieter: name, grund });

    if (!v.beginn || v.beginn > monatsEnde) { aus("Mietbeginn nach dem Monat"); continue; }
    if (v.ende && v.ende < termin) { aus(`Vertrag endet am ${v.ende.toISOString().slice(0, 10).split("-").reverse().join(".")}, vor dem Einzugstermin`); continue; }
    if (!v.mandatReferenz || !v.mandatIban || !v.mandatKontoinhaber) { aus("Mandat unvollständig (Referenz, IBAN oder Kontoinhaber fehlt)"); continue; }
    if (!ibanGueltig(v.mandatIban)) { aus("Zahler-IBAN ungültig"); continue; }
    if ((v.mandatGlaeubigerId ?? glaeubigerId).replace(/\s+/g, "").toUpperCase() !== glaeubigerId) { aus("Mandat läuft unter anderer Gläubiger-ID"); continue; }
    const betrag = erwartet(v);
    if (betrag <= 0) { aus("Betrag 0"); continue; }

    const eigene = einzuegeJournal.filter((e) => e.vertragId === v.id && e.referenz === v.mandatReferenz);
    const letzter = eigene.at(-1)?.datum;
    const folge = letzter && letzter >= vor36 ? "RCUR" : "FRST";
    // Unterschriftsdatum: erfasstes Datum, sonst der Mietbeginn (nur plausibel, wenn er nicht nach dem ersten Einzug
    // unter dieser Referenz und nicht in der Zukunft liegt).
    let datum = v.mandatDatum ? isoDatum(v.mandatDatum) : null;
    if (!datum) {
      const erster = eigene[0]?.datum;
      if (v.beginn > new Date() || (erster && v.beginn > erster)) { aus("Mietbeginn als Unterschriftsdatum nicht plausibel"); continue; }
      datum = isoDatum(v.beginn);
    }

    const monatseinzuege = einzuegeJournal.filter((e) => e.vertragId === v.id && e.betrag > 0 && e.datum.getUTCDate() <= 7);
    const ausgenommen = ohneMenge.has(v.id);
    zeilen.push({
      vertragId: v.id,
      einheit,
      mieter: name,
      betragCent: betrag,
      letzterEinzugCent: monatseinzuege.length ? cent(monatseinzuege.at(-1)!.betrag) : null,
      ruecklastschriften: rueckProVertrag.get(v.id) ?? 0,
      folge,
      ausgenommen,
    });
    if (ausgenommen) continue;
    einzuege.push({
      vertragId: v.id,
      einzug: {
        endToEndId: `M${String(jahr).slice(2)}${monatText}-${v.mandatReferenz.slice(-28)}`,
        betragCent: betrag,
        mandatsreferenz: v.mandatReferenz,
        mandatsDatum: datum,
        schuldnerName: v.mandatKontoinhaber,
        schuldnerIban: bereinigeIban(v.mandatIban),
        verwendungszweck: `Miete+BK ${monatText}.${jahr} ${einheit}`,
        folge,
      },
    });
  }

  // Mehrere Verträge eines Mieters (Wohnung + Garage) können dasselbe Mandat nutzen: End-to-End-ID durchnummerieren.
  const gesehen = new Map<string, number>();
  for (const { einzug } of einzuege) {
    const n = (gesehen.get(einzug.endToEndId) ?? 0) + 1;
    gesehen.set(einzug.endToEndId, n);
    if (n > 1) einzug.endToEndId = `${einzug.endToEndId.slice(0, 33)}-${n}`;
  }

  const jetzt = new Date();
  const kompakt = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .format(jetzt)
    .replace(/\D/g, "");
  let xml: string | null = null;
  let dateiFehler: string | null = null;
  if (glaeubigerProbleme.length) {
    dateiFehler = glaeubigerProbleme.join("; ");
  } else {
    try {
      xml = baueLastschriftPain008({
        nachrichtenId: `MIETE-${jahr}${monatText}-${kompakt}`,
        erstelltAm: jetzt,
        faelligAm,
        glaeubiger: { name: objekt!.sepaGlaeubigerName ?? "", iban: objekt!.mietkontoIban ?? "", bic: objekt!.mietkontoBic, glaeubigerId },
        einzuege: einzuege.map((e) => e.einzug),
      });
    } catch (e) {
      dateiFehler = e instanceof Error ? e.message : "Die Datei lässt sich nicht bauen.";
    }
  }

  return {
    jahr,
    monat,
    faelligAm,
    terminHinweis,
    glaeubigerProbleme,
    zeilen,
    ausgelassen,
    anzahl: einzuege.length,
    summeCent: einzuege.reduce((s, e) => s + e.einzug.betragCent, 0),
    xml,
    dateiFehler,
    dateiname: `Lastschrift-Miete-${jahr}-${monatText}.xml`,
  };
}
