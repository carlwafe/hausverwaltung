import { prisma } from "@/lib/prisma";
import { berechneSoll, berechneIstNachPeriode, ermittleAktuelleMiete, mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import { ladeSonderforderungSalden } from "@/lib/sonderforderungen";
import { ladeNkGegenrechnungen } from "@/lib/nk-gegenrechnung";
import { gegenrechnungBis } from "@/lib/nk-saldo";
import { berechneMieteMonat } from "@/lib/miete-monat";
import { effektiverStichtag } from "@/lib/buchhaltung-stichtag";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { heuteUtc, sichtbareTickets } from "@/lib/ticket";

// Kachelwerte der Startseite. Die Rechnung lädt alle Mietzahlungen aller abrechenbaren Verträge —
// die Seite ruft sie deshalb nicht direkt auf, sondern über den Zwischenspeicher in
// startseite-cache.ts. Nur einfache Zahlen/Texte zurückgeben (der Zwischenspeicher legt JSON ab).
export type StartseiteWerte = {
  /** Kopfzeile mit Name und Anschrift des Objekts; null = kein Objekt angelegt. */
  objektZeile: string | null;
  gebaeude: number;
  einheiten: number;
  vermietet: number;
  leerstand: number;
  sollKaltmiete: number;
  sollNebenkosten: number;
  summeKautionen: number;
  gesamtRueckstand: number;
  /** Monat (1–12) und Jahr, für die die Mieten-Kachel gerechnet wurde. */
  mietenMonat: number;
  mietenJahr: number;
  mietenAnzahl: number;
  mietenBezahlt: number;
  mietenUnbezahlt: number;
  mietenOffenBetrag: number;
};

export async function berechneStartseiteWerte(): Promise<StartseiteWerte> {
  const [objekt, gebaeudeGruppen, einheitenCount, aktiveVertraege, abrechenbareVertraege, aktiveKautionen] =
    await Promise.all([
      prisma.objekt.findFirst(),
      // "Gebäude" meint hier das physische Bauwerk (mehrere Hausnummern desselben Hauses, z.B.
      // "Breslauer Str. 2, 4, 6"), nicht die einzelne Adresse — siehe /gebaeude, das aus demselben
      // Grund nach Haus gruppiert statt alle Adressen flach zu zählen.
      prisma.gebaeude.groupBy({ by: ["hausId"], where: { hausId: { not: null } } }),
      prisma.einheit.count(),
      prisma.mietvertrag.findMany({
        where: { status: "AKTIV" },
        select: {
          einheitId: true,
          kaltmiete: true,
          nebenkostenVorauszahlung: true,
          mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
        },
      }),
      prisma.mietvertrag.findMany({
        where: { status: { in: ["AKTIV", "BEENDET"] } },
        select: {
          id: true,
          beginn: true,
          ende: true,
          kaltmiete: true,
          nebenkostenVorauszahlung: true,
          mehrwertsteuer: true,
          buchhaltungAb: true,
          saldovortrag: true,
          buchungen: {
            where: { buchungsart: { code: "MIETZAHLUNG" }, ...AKTIVE_BUCHUNG_FILTER },
            select: { datum: true, betrag: true, periodeMonat: true, periodeJahr: true },
          },
          mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
          mietnachlaesse: { select: { jahr: true, monat: true, betrag: true } },
        },
      }),
      prisma.kaution.findMany({ where: { status: "AKTIV" }, select: { betrag: true } }),
    ]);

  const summeKautionen = aktiveKautionen.reduce((sum, k) => sum + Number(k.betrag), 0);

  const belegteEinheiten = new Set(aktiveVertraege.map((v) => v.einheitId)).size;
  const aktuelleMieten = aktiveVertraege.map((v) =>
    ermittleAktuelleMiete({
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      mieterhoehungen: v.mieterhoehungen.map((m) => ({
        gueltigAb: m.gueltigAb,
        kaltmiete: Number(m.kaltmiete),
        nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
      })),
    }),
  );

  // Stichtag je Vertrag: eigener (früherer) oder der des Objekts.
  const sonderforderungen = await ladeSonderforderungSalden(
    abrechenbareVertraege.map((v) => v.id),
    {
      ab: objekt?.buchhaltungAb ?? null,
      abJeVertrag: new Map(abrechenbareVertraege.map((v) => [v.id, effektiverStichtag(v, objekt)])),
    },
  );
  const heute = new Date();
  const sollIstDaten = (v: (typeof abrechenbareVertraege)[number]) => ({
    beginn: v.beginn,
    ende: v.ende,
    kaltmiete: Number(v.kaltmiete),
    nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
    mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
    mieterhoehungen: v.mieterhoehungen.map((m) => ({
      gueltigAb: m.gueltigAb,
      kaltmiete: Number(m.kaltmiete),
      nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    })),
    mietnachlaesse: mietnachlaesseFuerSoll(v.mietnachlaesse),
  });
  // Wie in den Offenen Posten: unbezahlte BK-Vorauszahlung versendeter Abrechnungen ist kein Rückstand.
  const gegenrechnungen = await ladeNkGegenrechnungen(
    abrechenbareVertraege.map((v) => ({ id: v.id, vertrag: sollIstDaten(v), buchhaltungAb: effektiverStichtag(v, objekt) })),
    heute,
  );
  const gesamtRueckstand = abrechenbareVertraege.reduce((sum, v) => {
    const buchhaltungAb = effektiverStichtag(v, objekt);
    const soll = berechneSoll(sollIstDaten(v), heute, buchhaltungAb);
    const ist = berechneIstNachPeriode(
      v.buchungen.map((z) => ({
        datum: z.datum!,
        betrag: Number(z.betrag),
        periodeMonat: z.periodeMonat,
        periodeJahr: z.periodeJahr,
      })),
      buchhaltungAb,
    );
    const saldo =
      ist - soll + Number(v.saldovortrag) - (sonderforderungen.get(v.id)?.offen ?? 0) +
      gegenrechnungBis(gegenrechnungen.get(v.id) ?? [], heute);
    return sum + Math.min(saldo, 0);
  }, 0);

  // Mieten des laufenden Monats (wie /miete-monat): wer hat Kaltmiete + BK-Vorauszahlung voll gezahlt?
  const mietenMonat = abrechenbareVertraege
    .map((v) =>
      berechneMieteMonat(
        sollIstDaten(v),
        effektiverStichtag(v, objekt),
        v.buchungen.map((z) => ({ ...z, betrag: Number(z.betrag) })),
        heute.getFullYear(),
        heute.getMonth() + 1,
        heute,
      ),
    )
    .filter((e) => e !== null);
  const mietenUnbezahlt = mietenMonat.filter((e) => e.status === "offen" || e.status === "teilweise");

  return {
    objektZeile: objekt
      ? `${objekt.name} · ${objekt.strasse} ${objekt.hausnummer}, ${objekt.plz} ${objekt.ort}`
      : null,
    gebaeude: gebaeudeGruppen.length,
    einheiten: einheitenCount,
    vermietet: belegteEinheiten,
    leerstand: einheitenCount - belegteEinheiten,
    sollKaltmiete: aktuelleMieten.reduce((sum, m) => sum + m.kaltmiete, 0),
    sollNebenkosten: aktuelleMieten.reduce((sum, m) => sum + m.nebenkostenVorauszahlung, 0),
    summeKautionen,
    gesamtRueckstand,
    mietenMonat: heute.getMonth() + 1,
    mietenJahr: heute.getFullYear(),
    mietenAnzahl: mietenMonat.length,
    mietenBezahlt: mietenMonat.filter((e) => e.status === "bezahlt").length,
    mietenUnbezahlt: mietenUnbezahlt.length,
    mietenOffenBetrag: mietenUnbezahlt.reduce((sum, e) => sum + e.offen, 0),
  };
}

/** Ticket-Kachel: je Nutzer, weil private Tickets nur der Ersteller sieht. */
export async function zaehleStartseiteTickets(userId: string): Promise<{ offen: number; ueberfaellig: number }> {
  const [offen, ueberfaellig] = await Promise.all([
    prisma.ticket.count({ where: { status: { not: "ERLEDIGT" }, ...sichtbareTickets(userId) } }),
    prisma.ticket.count({
      where: { status: { not: "ERLEDIGT" }, faelligAm: { lt: heuteUtc() }, ...sichtbareTickets(userId) },
    }),
  ]);
  return { offen, ueberfaellig };
}
