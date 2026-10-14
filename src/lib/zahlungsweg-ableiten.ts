import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findColumn } from "@/lib/import/bank-csv";
import type { ZahlungswegArt } from "@/lib/zahlungsweg-anzeige";

/**
 * Zahlungsweg eines Mietvertrags aus den Bankzeilen (`Buchung.rohdaten`) der Mietzahlungen ableiten.
 *
 * Je Zahlung: Lastschrift = Buchungstext enthält LASTSCHRIFT (Einzug/Folge/Einmal; Rückbelastungen zählen nicht),
 * Behörde = Überweisung, deren Zahler das Jobcenter/die Bundesagentur oder der Kreis Ostholstein ist,
 * Überweisung = sonstige Überweisung/Dauerauftrag. Der Vertrag bekommt einen Zahlungsweg nur, wenn die jüngsten
 * Zahlungen (höchstens `FENSTER`, mindestens `MIN_ZAHLUNGEN`) alle dieselbe Art haben — gemischte Fälle bleiben offen
 * und werden von Hand entschieden (z.B. Einzug, Rücklastschrift, dann Dauerauftrag; Amt zahlt nur einen Teil).
 */
const FENSTER = 4;
const MIN_ZAHLUNGEN = 3;

export const AMT_BUNDESAGENTUR = /bundesagentur|jobcenter/i;
export const AMT_KREIS = /kreis\s*ostholstein/i;

function text(zeile: Record<string, unknown>, kandidaten: string[]): string {
  const spalte = findColumn(Object.keys(zeile), kandidaten);
  const v = spalte ? zeile[spalte] : undefined;
  return typeof v === "string" || typeof v === "number" ? String(v).trim() : "";
}

/** Art einer einzelnen Bankzeile (Gutschrift einer Mietzahlung); null, wenn sie sich nicht eindeutig einordnen lässt. */
export function zahlungswegAusBankzeile(rohdaten: unknown): ZahlungswegArt | null {
  if (!rohdaten || typeof rohdaten !== "object" || Array.isArray(rohdaten)) return null;
  const zeile = rohdaten as Record<string, unknown>;
  const buchungstext = text(zeile, ["buchungstext"]).toUpperCase();
  if (!buchungstext || buchungstext.includes("RUECK") || buchungstext.includes("WIEDER")) return null;
  if (buchungstext.includes("LASTSCHRIFT")) return "LASTSCHRIFT";
  // Gutschrift per Überweisung, Dauerauftrag oder Echtzeit-Überweisung (Buchungstext „ECHTZEIT-GUTSCHRIFT“).
  if (!/UEBERWEISUNG|DAUERAUFTR|ECHTZEIT|GUTSCHR/.test(buchungstext)) return null;
  const zahler = text(zeile, ["beguenstigterzahlungspflichtiger"]);
  return AMT_BUNDESAGENTUR.test(zahler) || AMT_KREIS.test(zahler) ? "BEHOERDE" : "UEBERWEISUNG";
}

/** Zahlungsweg aus den Bankzeilen der jüngsten Zahlungen (neueste zuerst); null = nicht eindeutig. */
export function leiteZahlungswegAb(rohdatenNeuesteZuerst: unknown[]): ZahlungswegArt | null {
  const arten: ZahlungswegArt[] = [];
  for (const r of rohdatenNeuesteZuerst) {
    const art = zahlungswegAusBankzeile(r);
    if (art) arten.push(art);
    if (arten.length === FENSTER) break;
  }
  if (arten.length < MIN_ZAHLUNGEN) return null;
  return arten.every((a) => a === arten[0]) ? arten[0] : null;
}

/** Bankzeilen der jüngsten Mietzahlungen eines Vertrags, neueste zuerst. */
async function ladeBankzeilen(mietvertragId: string): Promise<unknown[]> {
  const zeilen = await prisma.buchung.findMany({
    where: {
      mietvertragId,
      ...AKTIVE_BUCHUNG_FILTER,
      buchungsart: { code: "MIETZAHLUNG" },
      betrag: { gt: 0 },
      rohdaten: { not: Prisma.DbNull },
    },
    orderBy: [{ datum: "desc" }, { erstelltAm: "desc" }],
    // Ein paar Reserven, weil Rückbelastungs-Wiedergutschriften und Sonstiges nicht zählen.
    take: FENSTER + 8,
    select: { rohdaten: true },
  });
  return zeilen.map((z) => z.rohdaten);
}

/** Vorschlag für einen Vertrag aus dem Journal (null = nicht eindeutig oder zu wenige Zahlungen mit Bankzeile). */
export async function ermittleZahlungsweg(mietvertragId: string): Promise<ZahlungswegArt | null> {
  return leiteZahlungswegAb(await ladeBankzeilen(mietvertragId));
}

const WARN_ZAHLUNGEN = 2;

/**
 * Warnung, wenn der erfasste Zahlungsweg nicht mehr stimmt: die jüngsten 2 Zahlungen sind beide von einer anderen Art
 * (z.B. zahlt der Mieter nach einem neuen Job wieder selbst statt über das Amt). Bewusst früher als beim Ausfüllen leerer
 * Felder (dort 3 von 4), weil es nur ein Hinweis ist; abwechselnde Zahlungen (Amt + Eigenanteil) lösen nichts aus.
 * Liefert den vorgeschlagenen Zahlungsweg oder null.
 */
export function leiteAbweichungAb(rohdatenNeuesteZuerst: unknown[], erfasst: ZahlungswegArt): ZahlungswegArt | null {
  const arten: ZahlungswegArt[] = [];
  for (const r of rohdatenNeuesteZuerst) {
    const art = zahlungswegAusBankzeile(r);
    if (art) arten.push(art);
    if (arten.length === WARN_ZAHLUNGEN) break;
  }
  if (arten.length < WARN_ZAHLUNGEN) return null;
  return arten.every((a) => a === arten[0]) && arten[0] !== erfasst ? arten[0] : null;
}

/** Neue Werte für Hinweis und verworfenen Hinweis (rein, gut testbar). */
export function bestimmeHinweis(
  abweichung: ZahlungswegArt | null,
  bisher: { hinweis: ZahlungswegArt | null; verworfen: ZahlungswegArt | null },
): { hinweis: ZahlungswegArt | null; verworfen: ZahlungswegArt | null } {
  // Passen die Zahlungen wieder zum erfassten Weg, ist auch ein früher verworfener Vorschlag erledigt.
  if (!abweichung) return { hinweis: null, verworfen: null };
  // Derselbe Vorschlag wie der verworfene bleibt ausgeblendet.
  if (abweichung === bisher.verworfen) return { hinweis: null, verworfen: bisher.verworfen };
  return { hinweis: abweichung, verworfen: bisher.verworfen };
}

/**
 * Nach einem Import, bei den betroffenen Verträgen: Ist noch kein Zahlungsweg erfasst, wird er aus den Zahlungen
 * eingetragen (wenn eindeutig). Ist einer erfasst, wird er **nie überschrieben** — weichen die jüngsten Zahlungen davon
 * ab, merkt sich die App den Vorschlag als Warnung (`zahlungswegHinweis`; Mietverträge-Seite, Vertragsseite). Beendete
 * Verträge bekommen keine Warnung. Fehler dürfen den Import nicht stören.
 */
export async function aktualisiereZahlungswege(mietvertragIds: string[]): Promise<void> {
  try {
    const vertraege = await prisma.mietvertrag.findMany({
      where: { id: { in: [...new Set(mietvertragIds)] } },
      select: { id: true, status: true, zahlungsweg: true, zahlungswegHinweis: true, zahlungswegHinweisVerworfen: true },
    });
    for (const v of vertraege) {
      const bankzeilen = await ladeBankzeilen(v.id);
      if (v.zahlungsweg === null) {
        const art = leiteZahlungswegAb(bankzeilen);
        if (art) await prisma.mietvertrag.updateMany({ where: { id: v.id, zahlungsweg: null }, data: { zahlungsweg: art } });
        continue;
      }
      const abweichung = v.status === "BEENDET" ? null : leiteAbweichungAb(bankzeilen, v.zahlungsweg);
      const neu = bestimmeHinweis(abweichung, { hinweis: v.zahlungswegHinweis, verworfen: v.zahlungswegHinweisVerworfen });
      if (neu.hinweis !== v.zahlungswegHinweis || neu.verworfen !== v.zahlungswegHinweisVerworfen) {
        await prisma.mietvertrag.update({
          where: { id: v.id },
          data: { zahlungswegHinweis: neu.hinweis, zahlungswegHinweisVerworfen: neu.verworfen },
        });
      }
    }
  } catch (e) {
    console.error("Zahlungswege konnten nicht aktualisiert werden", e);
  }
}
