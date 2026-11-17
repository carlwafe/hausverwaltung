// Daten der Kautionsseite: je Mietvertrag mit Kaution (oder mit Kautionsbuchungen ohne Kaution-Stammdatensatz)
// das Kautionskonto, die Einordnung in die Reiter und die Bewegungen für die aufgeklappte Zeile.
// Alles serialisierbar (Datumswerte als ISO-Text), weil es an eine Client-Komponente geht.

import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { baueKautionskonto, rechnungstext, ZINSEN_ZEILE_ID, type KautionskontoZeile } from "@/lib/kautionskonto";
import { ordneKautionEin, type KautionPhase, type KautionSchrittTon } from "@/lib/kaution-schritt";
import { NK_VERRECHNUNG_BEZUG } from "@/lib/nk-verrechnung";
import { idsMitRohdaten } from "@/lib/rohdaten-vorhanden";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { mieterName } from "@/lib/mieter-name";
import type { Prisma } from "@/generated/prisma/client";

export type KautionEinbehaltStatusWert = "UNSTRITTIG" | "STRITTIG_OFFEN" | "STRITTIG_BESTAETIGT" | "STRITTIG_VERWORFEN";

export type KautionBewegungZeile = {
  id: string;
  datum: string | null;
  vorgang: string;
  bemerkung: string;
  buchungsbetrag: number | null;
  wirkung: number;
  stand: number;
  art: KautionskontoZeile["art"];
  // Journalbuchung mit eigener Detailseite (/kautionen/buchung/[id]); false bei Einbehalten, der Zinszeile und
  // der Einzahlung vor Buchhaltungsbeginn.
  buchung: boolean;
  hatRohdaten: boolean;
  importBatchId: string | null;
  importDateiname: string | null;
  // Nur bei Einbehalten (id = KautionEinbehalt-id).
  einbehalt: {
    status: KautionEinbehaltStatusWert;
    pauschal: boolean;
    nkJahr: number | null;
    mieterkonto: boolean;
  } | null;
};

export type KautionUebersichtZeile = {
  id: string;
  mietvertragId: string;
  // null = kein Kaution-Stammdatensatz (nur Kautionsbuchungen vorhanden).
  kautionId: string | null;
  einheitBezeichnung: string;
  mieterNamen: string;
  mietende: string | null;
  anlageform: string | null;
  soll: number | null;
  eingezahlt: number;
  erhaltenAm: string | null;
  zinsen: number;
  guthaben: number;
  einbehalten: number;
  strittig: number;
  ausgezahlt: number;
  nochOffen: number;
  // Kautionsguthaben des Mieters (laufender Stand des Kautionskontos).
  stand: number;
  liegtAuf: "Kautionskonto" | "Geschäftskonto" | null;
  // Datum der letzten Bewegung (für „Erledigt“).
  letzteBewegung: string | null;
  phase: KautionPhase;
  schritt: string | null;
  ton: KautionSchrittTon | null;
  warnung: string | null;
  // Vereinbarte Kaution weicht von den Einzahlungen ab.
  abweichung: string | null;
  notizen: string | null;
  zeilen: KautionBewegungZeile[];
};

const TOLERANZ = 0.01;
const r2 = (v: number) => Math.round(v * 100) / 100;

function euro(v: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v);
}

export async function ladeKautionsuebersicht(heute = new Date()): Promise<KautionUebersichtZeile[]> {
  const buchungWhere: Prisma.BuchungWhereInput = {
    buchungsart: { kontokreis: "KAUTIONSKONTO" },
    mietvertragId: { not: null },
    ...AKTIVE_BUCHUNG_FILTER,
  };
  const [kautionen, buchungen, mitRohdaten] = await Promise.all([
    prisma.kaution.findMany({
      include: { mietvertrag: { include: { einheit: true, mieter: true } }, einbehalte: true },
    }),
    prisma.buchung.findMany({
      where: buchungWhere,
      orderBy: { datum: "asc" },
      select: {
        id: true,
        datum: true,
        betrag: true,
        verwendungszweck: true,
        mietvertragId: true,
        importBatchId: true,
        importBatch: { select: { dateiname: true } },
        buchungsart: { select: { code: true, bezeichnung: true } },
      },
    }),
    idsMitRohdaten(buchungWhere),
  ]);

  // Verrechnung mit Rechnung: Empfänger und Text der Gegen-Kostenposition für die Anzeige.
  const virtuelleIds = buchungen.filter((b) => b.buchungsart.code === "KAUTION_VIRTUELLE_AUSZAHLUNG").map((b) => b.id);
  const rechnungJeVirtueller = new Map<string, string | null>();
  if (virtuelleIds.length > 0) {
    const gegenbuchungen = await prisma.buchung.findMany({
      where: { bezugTyp: "Buchung", bezugId: { in: virtuelleIds }, ...AKTIVE_BUCHUNG_FILTER },
      select: { bezugId: true, empfaenger: true, verwendungszweck: true },
    });
    for (const g of gegenbuchungen) rechnungJeVirtueller.set(g.bezugId!, rechnungstext(g));
  }

  // Einbehalte stehen als KautionEinbehalt-Zeilen im Konto (auch strittige ohne Buchung); ihre
  // KAUTION_EINBEHALT-Buchungen deshalb nicht noch einmal als Bewegung.
  const bewegungenJeVertrag = new Map<string, typeof buchungen>();
  for (const b of buchungen) {
    if (b.buchungsart.code === "KAUTION_EINBEHALT") continue;
    const liste = bewegungenJeVertrag.get(b.mietvertragId!) ?? [];
    liste.push(b);
    bewegungenJeVertrag.set(b.mietvertragId!, liste);
  }

  // Mietverträge mit Kautionsbuchungen, aber ohne Kaution-Stammdatensatz.
  const bekannt = new Set(kautionen.map((k) => k.mietvertragId));
  const verwaisteIds = [...bewegungenJeVertrag.keys()].filter((id) => !bekannt.has(id));
  const verwaiste = verwaisteIds.length
    ? await prisma.mietvertrag.findMany({ where: { id: { in: verwaisteIds } }, include: { einheit: true, mieter: true } })
    : [];

  type Eingang = {
    mietvertrag: (typeof verwaiste)[number];
    kaution: (typeof kautionen)[number] | null;
  };
  const eingaenge: Eingang[] = [
    ...kautionen.map((k) => ({ mietvertrag: k.mietvertrag, kaution: k })),
    ...verwaiste.map((v) => ({ mietvertrag: v, kaution: null })),
  ];

  const zeilen = eingaenge.map(({ mietvertrag, kaution }): KautionUebersichtZeile => {
    const bewegungen = bewegungenJeVertrag.get(mietvertrag.id) ?? [];
    const einbehalte = kaution?.einbehalte ?? [];
    const soll = kaution ? Number(kaution.betrag) : null;
    const einzahlungUnbekannt = kaution?.einzahlungUnbekannt ?? false;

    const konto = baueKautionskonto({
      sollBetrag: soll,
      einzahlungUnbekannt,
      mietbeginn: mietvertrag.beginn,
      bewegungen: bewegungen.map((b) => ({
        id: b.id,
        datum: b.datum,
        code: b.buchungsart.code,
        bezeichnung: b.buchungsart.bezeichnung,
        betrag: Number(b.betrag),
        verwendungszweck: b.verwendungszweck,
        rechnung: rechnungJeVirtueller.get(b.id) ?? null,
      })),
      einbehalte: einbehalte.map((e) => ({
        id: e.id,
        datum: e.datum ?? e.erstelltAm,
        positionText: e.positionText,
        betrag: Number(e.betrag),
        status: e.status,
        nkJahr: e.bezugTyp === NK_VERRECHNUNG_BEZUG && e.bezugId ? Number(e.bezugId) : null,
        mieterkonto: e.bezugTyp === "Mieterkonto",
      })),
    });
    const a = konto.abrechnung;

    const vorlaeufigEinbehalten = einbehalte
      .filter((e) => !e.pauschal && !e.bezugTyp && (e.status === "UNSTRITTIG" || e.status === "STRITTIG_BESTAETIGT"))
      .reduce((s, e) => s + Number(e.betrag), 0);

    // Kautionsbewegung ohne Einzahlung des Mieters: meist wurde die Einzahlung als normale Zahlung importiert.
    const hatEinzahlung = bewegungen.some((b) => b.buchungsart.code === "KAUTION_EINZAHLUNG");
    const warnung = !kaution
      ? "Kein Kaution-Stammdatensatz angelegt — aber Kautionsbuchungen für diesen Mietvertrag vorhanden."
      : !hatEinzahlung && !einzahlungUnbekannt && bewegungen.length > 0
        ? "Keine Einzahlung des Mieters in den Kautionsbuchungen gefunden — vermutlich wurde die tatsächliche Einzahlung fälschlich als normale Zahlung importiert."
        : null;
    const abweichung =
      soll !== null && hatEinzahlung && Math.abs(a.eingezahlt - soll) > TOLERANZ
        ? `Eingezahlt ${euro(a.eingezahlt)}, vereinbart ${euro(soll)}`
        : null;

    const einordnung = ordneKautionEin({ konto, mietende: mietvertrag.ende, heute, vorlaeufigEinbehalten, warnung });

    const buchungJeId = new Map(bewegungen.map((b) => [b.id, b]));
    const einbehaltJeId = new Map(einbehalte.map((e) => [e.id, e]));
    const letzte = [...konto.zeilen].reverse().find((z) => z.datum);

    return {
      id: kaution?.id ?? `verwaist-${mietvertrag.id}`,
      mietvertragId: mietvertrag.id,
      kautionId: kaution?.id ?? null,
      einheitBezeichnung: mietvertrag.einheit.bezeichnung,
      mieterNamen: mietvertrag.mieter.map((m) => mieterName(m)).join(" & "),
      mietende: mietvertrag.ende?.toISOString() ?? null,
      anlageform: kaution?.anlageform ?? null,
      soll,
      eingezahlt: a.eingezahlt,
      erhaltenAm: a.erhaltenAm?.toISOString() ?? null,
      zinsen: konto.zeilen.find((z) => z.id === ZINSEN_ZEILE_ID)?.wirkung ?? 0,
      guthaben: a.guthaben,
      einbehalten: a.einbehalteSumme,
      strittig: a.strittigOffenSumme,
      ausgezahlt: a.ausgezahltSumme,
      nochOffen: a.nochOffen,
      stand: r2(konto.stand),
      liegtAuf: konto.stand <= 0.005 ? null : konto.aufKautionskonto ? "Kautionskonto" : "Geschäftskonto",
      letzteBewegung: letzte?.datum?.toISOString() ?? null,
      ...einordnung,
      warnung,
      abweichung,
      notizen: kaution?.notizen ?? null,
      zeilen: konto.zeilen.map((z) => {
        const b = buchungJeId.get(z.id);
        const e = einbehaltJeId.get(z.id);
        return {
          id: z.id,
          datum: z.datum?.toISOString() ?? null,
          vorgang: z.vorgang,
          bemerkung: z.bemerkung,
          buchungsbetrag: z.buchungsbetrag,
          wirkung: z.wirkung,
          stand: z.stand,
          art: z.art,
          buchung: !!b,
          hatRohdaten: mitRohdaten.has(z.id),
          importBatchId: b?.importBatchId ?? null,
          importDateiname: b?.importBatch?.dateiname ?? null,
          einbehalt: e
            ? {
                status: e.status,
                pauschal: e.pauschal,
                nkJahr: e.bezugTyp === NK_VERRECHNUNG_BEZUG && e.bezugId ? Number(e.bezugId) : null,
                mieterkonto: e.bezugTyp === "Mieterkonto",
              }
            : null,
        };
      }),
    };
  });

  return zeilen.sort((x, y) => vergleicheEinheitBezeichnung(x.einheitBezeichnung, y.einheitBezeichnung));
}
