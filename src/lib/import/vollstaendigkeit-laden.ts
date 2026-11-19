// Laden der Prüfdaten für den Vollständigkeits-Check der Kontoauszug-Importe (Seite /kontoauszug/importe):
// die Rohdaten-Schlüssel aller aktiven Buchungen und die Monatsprüfung der CAMT-Importe. Nur lesend.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { leseDatei } from "@/lib/storage";
import {
  datumUndBetrag,
  leseKontoauszugDatei,
  pruefeVollstaendigkeitZeilen,
  zeilenSchluesselAusRohdaten,
  type BekannteSchluessel,
  type CamtMonatsErgebnis,
} from "@/lib/import/vollstaendigkeit";
import { camtZeitraum, monateImZeitraum, monatsGrenzen } from "@/lib/import/camt-monat";
import { findeSaldoLuecken, type Kontosaldo } from "@/lib/kontosalden";

/**
 * Rohdaten-Schlüssel aller aktiven Buchungen je Kategorie, gegen die eine Kontoauszug-Zeile geprüft wird.
 */
export async function ladeBekannteSchluessel(): Promise<BekannteSchluessel> {
  // Stornierte Buchungen (und Storno-Gegenbuchungen) zählen nicht: sonst meldet z.B. ein nach
  // "Umbuchen" stornierter Betriebskostenausgleich neben der neuen Zahlung fälschlich "mehrfach erfasst".
  // Bewusst über den gesamten Bestand geprüft, nicht nur gegen diesen Batch: eine Zeile, die
  // schon in einem früheren Import gelandet ist und hier korrekt als Duplikat übersprungen
  // wurde, soll nicht fälschlich als "ungeklärt" gemeldet werden.
  const [
    alleZahlungen,
    alleKosten,
    alleMietweiterleitungen,
    alleKautionsbuchungen,
    alleSonstigenBuchungen,
    alleNichtZugeordneten,
    alleAufgeteilten,
  ] = await Promise.all([
      prisma.buchung.findMany({ where: { buchungsart: { code: "MIETZAHLUNG" }, ...AKTIVE_BUCHUNG_FILTER }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: "MIETWEITERLEITUNG" }, ...AKTIVE_BUCHUNG_FILTER }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { kontokreis: "KAUTIONSKONTO" }, ...AKTIVE_BUCHUNG_FILTER }, select: { rohdaten: true } }),
      prisma.buchung.findMany({ where: { buchungsart: { code: { in: ["NEBENKOSTENAUSGLEICH", "SONDERZAHLUNG", "MAHNGEBUEHR", "DARLEHEN_TILGUNG"] } }, ...AKTIVE_BUCHUNG_FILTER }, select: { rohdaten: true } }),
      prisma.nichtZugeordneteBuchung.findMany({ select: { rohdaten: true } }),
      // Nur nicht stornierte Teile einer Aufteilung (das stornierte Original zählt nicht mehr mit).
      prisma.buchung.findMany({
        where: {
          OR: [{ aufteilungGruppeId: { not: null } }, { bezugTyp: "Umbuchung" }, { bezugTyp: "Darlehensrate" }],
          ...AKTIVE_BUCHUNG_FILTER,
        },
        select: { rohdaten: true },
      }),
    ]);
  const zahlung = new Set(
    alleZahlungen
      .map((z) => zeilenSchluesselAusRohdaten(z.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const kosten = new Set(
    alleKosten
      .map((k) => zeilenSchluesselAusRohdaten(k.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const mietweiterleitung = new Set(
    alleMietweiterleitungen
      .map((m) => zeilenSchluesselAusRohdaten(m.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const kautionsbuchung = new Set(
    alleKautionsbuchungen
      .map((k) => zeilenSchluesselAusRohdaten(k.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const sonstige = new Set(
    alleSonstigenBuchungen
      .map((s) => zeilenSchluesselAusRohdaten(s.rohdaten))
      .filter((s): s is string => s !== null),
  );
  const nichtZugeordnet = new Set(
    alleNichtZugeordneten
      .map((n) => zeilenSchluesselAusRohdaten(n.rohdaten))
      .filter((s): s is string => s !== null),
  );

  const aufgeteilt = new Set(
    alleAufgeteilten
      .map((b) => zeilenSchluesselAusRohdaten(b.rohdaten))
      .filter((s): s is string => s !== null),
  );

  return { zahlung, kosten, mietweiterleitung, kautionsbuchung, sonstige, nichtZugeordnet, aufgeteilt };
}

/**
 * Vollständigkeit eines Monats über alle CAMT-Importe, deren Zeitraum den Monat berührt: Die gespeicherten
 * Dateien werden zusammengeführt (gleiche Bank-Referenz nur einmal), auf die Buchungstage des Monats beschränkt
 * und wie eine einzelne Datei geprüft. Dazu der Abgleich je Tag mit den Tagessalden der Bank (`kontosalden`),
 * damit auch ein Tag auffällt, der in keinem übernommenen Import steckt.
 */
export async function pruefeCamtMonat(monat: string): Promise<CamtMonatsErgebnis | { error: string }> {
  if (!/^\d{4}-\d{2}$/.test(monat)) return { error: "Ungültiger Monat." };

  // Dieselbe Auswahl wie die Monatszeile der Seite: CAMT-Importe mit übernommener oder geparkter Buchung.
  const kandidaten = await prisma.importBatch.findMany({
    where: {
      typ: "KONTOAUSZUG",
      dateiname: { startsWith: "Kontoauszug CAMT " },
      OR: [{ buchungen: { some: {} } }, { nichtZugeordneteBuchungen: { some: {} } }],
    },
    select: { id: true, dateiname: true, speicherpfad: true },
  });
  const batches = kandidaten.filter((b) => {
    const z = camtZeitraum(b.dateiname);
    return z !== null && monateImZeitraum(z.von, z.bis).includes(monat);
  });
  if (batches.length === 0) return { error: "Keine Importdateien für diesen Monat." };
  if (batches.some((b) => !b.speicherpfad)) return { error: "Eine Originaldatei des Monats ist nicht verfügbar." };

  // Teils per CSV importierter Monat (Übergang CSV → XML): Bankabgleich nur für die Tage der XML-Importe.
  const { erster, letzter } = monatsGrenzen(monat);
  const csvBuchungen = await prisma.buchung.count({
    where: {
      ...AKTIVE_BUCHUNG_FILTER,
      datum: { gte: new Date(erster), lt: new Date(`${letzter}T23:59:59.999Z`) },
      importBatch: { typ: "KONTOAUSZUG", NOT: { dateiname: { startsWith: "Kontoauszug CAMT " } } },
    },
  });
  const nurZeitraeume = csvBuchungen > 0 ? batches.map((b) => camtZeitraum(b.dateiname)!) : undefined;

  let inhalte: { dateiname: string; inhalt: Buffer }[];
  try {
    inhalte = await Promise.all(
      batches.map(async (b) => ({ dateiname: b.dateiname, inhalt: await leseDatei(b.speicherpfad!) })),
    );
  } catch {
    return { error: "Eine Originaldatei des Monats ist nicht mehr verfügbar." };
  }

  return pruefeCamtMonatDateien(monat, inhalte, nurZeitraeume);
}

/**
 * Die Zeilen einer gespeicherten CAMT-Importdatei mit Buchungstag, Betrag und dem Schlüssel, über den gleiche
 * Umsätze aus sich überschneidenden Dateien zusammenfallen (Bank-Referenz, ohne sie der Zeilenschlüssel).
 */
async function leseCamtZeilen(
  inhalt: Buffer,
  dateiname: string,
): Promise<{
  headers: string[];
  zeilen: { row: Record<string, string>; datum: string; betrag: number; schluessel: string }[];
}> {
  const datei = await leseKontoauszugDatei(inhalt, dateiname);
  const zeilen: { row: Record<string, string>; datum: string; betrag: number; schluessel: string }[] = [];
  for (const row of datei.rows) {
    const { datum, betrag } = datumUndBetrag(row, datei.headers);
    if (!datum || betrag === null) continue;
    const ref = (row["Bank-Referenz"] ?? "").trim();
    const schluessel = ref ? `id|${ref}` : zeilenSchluesselAusRohdaten(row);
    if (schluessel) zeilen.push({ row, datum, betrag, schluessel });
  }
  return { headers: datei.headers, zeilen };
}

/**
 * Buchungstag und Schlüssel je Zeile einer CAMT-Importdatei — für die Spalte „Zeilen“ der Monatszeilen auf
 * /kontoauszug/importe. Im Datencache von Next je Import gespeichert (die Datei ändert sich nie), damit die Seite
 * die Dateien nicht bei jedem Aufruf liest. null = Datei nicht lesbar.
 */
export function ladeCamtZeilenSchluessel(
  batchId: string,
  speicherpfad: string,
  dateiname: string,
): Promise<[datum: string, schluessel: string][] | null> {
  // Ein Lesefehler wird außerhalb des Speichers abgefangen, damit er nicht dauerhaft als Ergebnis liegen bleibt.
  return unstable_cache(
    async () => {
      const { zeilen } = await leseCamtZeilen(await leseDatei(speicherpfad), dateiname);
      return zeilen.map((z): [string, string] => [z.datum, z.schluessel]);
    },
    ["camt-zeilen", batchId],
  )().catch(() => null);
}

/** Prüft die gelesenen Importdateien eines Monats (zusammengeführt) und gleicht sie mit den Bank-Salden ab. */
export async function pruefeCamtMonatDateien(
  monat: string,
  inhalte: { dateiname: string; inhalt: Buffer }[],
  /** Bankabgleich nur für Tage in diesen Zeiträumen (Monat teils per CSV importiert); ohne = ganzer Monat. */
  nurZeitraeume?: { von: string; bis: string }[],
): Promise<CamtMonatsErgebnis> {
  const { erster, letzter } = monatsGrenzen(monat);
  // Zusammenführen: nur Buchungstage des Monats, jede Bank-Referenz (bzw. ohne Referenz jeder Zeilenschlüssel) einmal.
  let headers: string[] = [];
  const gesehen = new Set<string>();
  const zeilen: { row: Record<string, string>; datum: string; betrag: number }[] = [];
  for (const d of inhalte) {
    const datei = await leseCamtZeilen(d.inhalt, d.dateiname);
    if (headers.length === 0) headers = datei.headers;
    for (const z of datei.zeilen) {
      if (z.datum < erster || z.datum > letzter || gesehen.has(z.schluessel)) continue;
      gesehen.add(z.schluessel);
      zeilen.push(z);
    }
  }
  zeilen.sort((x, y) => x.datum.localeCompare(y.datum));

  const ergebnis = pruefeVollstaendigkeitZeilen(
    headers,
    zeilen.map((z) => z.row),
    await ladeBekannteSchluessel(),
  );

  // Abgleich mit den Tagessalden der Bank: Summe je Tag und Saldokette (inkl. letztem Bank-Tag vor dem Monat).
  const [vorher, imMonat] = await Promise.all([
    prisma.kontosaldo.findFirst({ where: { datum: { lt: new Date(erster) } }, orderBy: { datum: "desc" } }),
    prisma.kontosaldo.findMany({
      where: { datum: { gte: new Date(erster), lte: new Date(letzter) } },
      orderBy: { datum: "asc" },
    }),
  ]);
  const alsSaldo = (z: NonNullable<typeof vorher>): Kontosaldo => ({
    datum: z.datum.toISOString().slice(0, 10),
    anfangssaldo: z.anfangssaldo === null ? null : Number(z.anfangssaldo),
    endsaldo: Number(z.endsaldo),
    anzahlUmsaetze: z.anzahlUmsaetze,
    summeUmsaetze: Number(z.summeUmsaetze),
  });
  const salden = [...(vorher ? [vorher] : []), ...imMonat].map(alsSaldo);
  const summeDateienCent = new Map<string, number>();
  for (const z of zeilen) {
    summeDateienCent.set(z.datum, (summeDateienCent.get(z.datum) ?? 0) + Math.round(z.betrag * 100));
  }
  const bankTageMonat = salden.filter((t) => t.datum >= erster);
  const bankTage = nurZeitraeume
    ? bankTageMonat.filter((t) => nurZeitraeume.some((z) => t.datum >= z.von && t.datum <= z.bis))
    : bankTageMonat;
  // Nur Tage mit gespeichertem Bank-Saldo lassen sich abgleichen; fehlt ein solcher Tag in allen Importen,
  // ist die Summe der Dateien 0 und der Tag fällt hier auf.
  const abweichendeTage: CamtMonatsErgebnis["bank"]["abweichendeTage"] = [];
  for (const tag of bankTage) {
    const bankCent = Math.round(tag.summeUmsaetze * 100);
    const dateienCent = summeDateienCent.get(tag.datum) ?? 0;
    if (bankCent !== dateienCent) {
      abweichendeTage.push({ datum: tag.datum, bank: bankCent / 100, dateien: dateienCent / 100 });
    }
  }

  return {
    ...ergebnis,
    bank: {
      dateien: inhalte.length,
      bankTage: bankTage.length,
      bisTag: bankTageMonat.length > 0 ? bankTageMonat[bankTageMonat.length - 1].datum : null,
      abweichendeTage,
      luecken: findeSaldoLuecken(salden).map((l) => ({ von: l.von, bis: l.bis })),
      nichtAbgeglichen: bankTageMonat.length - bankTage.length,
    },
  };
}

