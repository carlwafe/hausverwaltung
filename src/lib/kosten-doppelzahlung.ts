import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { findColumn, normalizeText } from "@/lib/import/bank-csv";
import { parseSuchbegriffe, findeDienstleister } from "@/lib/import/dienstleister";
import {
  extrahiereRechnungsnummern,
  findeDoppelzahlungsPaare,
  type DoppelzahlungZahlung,
} from "@/lib/import/doppelzahlung";

export type DoppelzahlungBuchung = {
  id: string;
  datum: string | null;
  kostenart: string;
  verwendungszweck: string;
};

export type DoppelzahlungPaar = {
  rechnungsnummer: string;
  betrag: number;
  empfaenger: string;
  a: DoppelzahlungBuchung;
  b: DoppelzahlungBuchung;
  /** Gutschrift (negative Kostenposition) über denselben Betrag nach der ersten Zahlung, falls gebucht. */
  rueckzahlung: { id: string; datum: string | null } | null;
};

export function ibanAus(rohdaten: unknown): string | null {
  if (!rohdaten || typeof rohdaten !== "object") return null;
  const r = rohdaten as Record<string, string>;
  const col = findColumn(Object.keys(r), ["kontonummeriban", "iban"]);
  return col ? (r[col] ?? "").trim() || null : null;
}

/**
 * Sucht unter den aktiven Kostenpositionen Paare, die dieselbe Rechnung zweimal bezahlen (siehe
 * doppelzahlung.ts) und prüft je Paar, ob schon eine Rückzahlung als Gutschrift gebucht ist. Läuft
 * nur auf Knopfdruck (Kosten-Seite). Aufgeteilte Positionen bleiben außen vor: ihre Teile tragen
 * denselben Text und können gleich hoch sein, ohne doppelt zu sein.
 */
export async function ladeKostenDoppelzahlungen(): Promise<DoppelzahlungPaar[]> {
  const alle = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
    select: {
      id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true, aufteilungGruppeId: true,
      kostenart: { select: { name: true } },
    },
  });
  const ausgaben = alle.filter(
    (k) => Number(k.betrag) > 0 && k.datum && !k.aufteilungGruppeId && extrahiereRechnungsnummern(k.verwendungszweck ?? "").length > 0,
  );
  if (ausgaben.length < 2) return [];

  // Bankzeile (für die IBAN) nur für die Kandidaten nachladen.
  const rohdatenMap = new Map(
    (await prisma.buchung.findMany({ where: { id: { in: ausgaben.map((k) => k.id) } }, select: { id: true, rohdaten: true } })).map((r) => [r.id, r.rohdaten]),
  );
  const dienstleister = (await prisma.dienstleister.findMany({ select: { id: true, name: true, suchbegriffe: true } })).map((d) => ({
    id: d.id,
    name: d.name,
    suchbegriffe: parseSuchbegriffe(d.suchbegriffe),
    kostenartIds: [],
  }));

  const zahlungen: DoppelzahlungZahlung[] = ausgaben.map((k, i) => ({
    rowNumber: i + 1,
    datum: k.datum!.toISOString().slice(0, 10),
    betrag: Number(k.betrag),
    name: k.empfaenger ?? "",
    iban: ibanAus(rohdatenMap.get(k.id)),
    verwendungszweck: k.verwendungszweck ?? "",
    dienstleisterId: findeDienstleister(k.empfaenger ?? "", k.verwendungszweck ?? "", dienstleister)?.id ?? null,
  }));

  const gutschriften = alle.filter((k) => Number(k.betrag) < 0 && k.datum);
  const zeige = (k: (typeof ausgaben)[number]): DoppelzahlungBuchung => ({
    id: k.id,
    datum: k.datum!.toISOString().slice(0, 10),
    kostenart: k.kostenart?.name ?? "",
    verwendungszweck: k.verwendungszweck ?? "",
  });

  return findeDoppelzahlungsPaare(zahlungen)
    .map(({ a, b, rechnungsnummer }) => {
      const [erste, zweite] = [ausgaben[a], ausgaben[b]].sort((x, y) => x.datum!.getTime() - y.datum!.getTime());
      const betrag = Number(erste.betrag);
      const name = normalizeText(erste.empfaenger ?? "");
      const gutschrift = gutschriften.find(
        (g) =>
          Math.round(Math.abs(Number(g.betrag)) * 100) === Math.round(betrag * 100) &&
          g.datum!.getTime() >= erste.datum!.getTime() &&
          (extrahiereRechnungsnummern(g.verwendungszweck ?? "").some((n) => rechnungsnummer.startsWith(n.nummer)) ||
            (name.length > 0 && normalizeText(g.empfaenger ?? "") === name)),
      );
      return {
        rechnungsnummer,
        betrag,
        empfaenger: erste.empfaenger ?? "",
        a: zeige(erste),
        b: zeige(zweite),
        rueckzahlung: gutschrift ? { id: gutschrift.id, datum: gutschrift.datum!.toISOString().slice(0, 10) } : null,
      };
    })
    .sort((x, y) => Number(x.rueckzahlung !== null) - Number(y.rueckzahlung !== null) || y.b.datum!.localeCompare(x.b.datum!));
}
