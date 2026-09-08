import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { berechneSoll, berechneIst } from "@/lib/soll-ist";
import { DateInput } from "@/components/date-input";
import { toDateInputValue } from "@/lib/date-utils";
import { OffenePostenTable, type OffenePostenRow } from "./offene-posten-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

/** Parst "yyyy-mm-dd" und setzt die Uhrzeit auf das Ende des Tages (inklusive Stichtag). */
function parseBisParam(raw: string | undefined): Date | null {
  if (!raw) return null;
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const [, jahr, monat, tag] = match;
  const datum = new Date(Number(jahr), Number(monat) - 1, Number(tag), 23, 59, 59, 999);
  return Number.isNaN(datum.getTime()) ? null : datum;
}

async function ladeZeilen(buchhaltungAb: Date | null, bis: Date): Promise<OffenePostenRow[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: {
      einheit: true,
      mieter: true,
      zahlungen: true,
    },
  });

  return vertraege
    .map((v) => {
      const soll = berechneSoll(
        {
          beginn: v.beginn,
          ende: v.ende,
          kaltmiete: Number(v.kaltmiete),
          nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
          mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
        },
        bis,
        buchhaltungAb,
      );
      const ist = berechneIst(
        v.zahlungen.map((z) => ({ datum: z.datum, betrag: Number(z.betrag) })),
        buchhaltungAb,
        bis,
      );
      const saldovortrag = Number(v.saldovortrag);
      const saldo = ist - soll + saldovortrag;

      return {
        id: v.id,
        einheit: v.einheit.bezeichnung,
        mieter: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
        status: v.status as "AKTIV" | "BEENDET",
        soll,
        ist,
        saldovortrag,
        saldo,
      };
    })
    .sort((a, b) => a.saldo - b.saldo);
}

export default async function OffenePostenPage({
  searchParams,
}: {
  searchParams: Promise<{ bis?: string }>;
}) {
  const { bis: bisParam } = await searchParams;
  const heute = new Date();
  const bis = parseBisParam(bisParam) ?? heute;
  const istHeute = !parseBisParam(bisParam);

  const objekt = await prisma.objekt.findFirst({ select: { buchhaltungAb: true } });
  const zeilen = await ladeZeilen(objekt?.buchhaltungAb ?? null, bis);
  const gesamtRueckstand = zeilen.filter((z) => z.saldo < 0).reduce((sum, z) => sum + z.saldo, 0);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Offene Posten</h1>
        <p className="text-sm text-neutral-400">
          Soll (Kaltmiete + NK-Vorauszahlung seit{" "}
          {objekt?.buchhaltungAb
            ? `Buchhaltungs-Stichtag ${formatDatum(objekt.buchhaltungAb)} bzw. späterem Mietbeginn`
            : "Mietbeginn"}
          , gerechnet bis {formatDatum(bis)}) im Vergleich zu den{" "}
          {objekt?.buchhaltungAb ? "seitdem " : ""}erfassten Zahlungen bis zu diesem Stichtag. Rot
          = Rückstand, Grün = Guthaben/Vorauszahlung.
        </p>
      </div>

      <form
        method="get"
        className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
      >
        <DateInput
          key={toDateInputValue(bis)}
          id="bis"
          name="bis"
          label="Buchhaltung erfasst bis"
          defaultValue={toDateInputValue(bis)}
        />
        <button
          type="submit"
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Anzeigen
        </button>
        {!istHeute && (
          <Link
            href="/offene-posten"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Zurück auf heute
          </Link>
        )}
      </form>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">
          Gesamtrückstand über alle Verträge{istHeute ? "" : ` (Stand ${formatDatum(bis)})`}
        </p>
        <p
          className={`mt-1 text-xl font-semibold ${gesamtRueckstand < 0 ? "text-red-400" : "text-white"}`}
        >
          {formatEuro(gesamtRueckstand)}
        </p>
      </div>

      <OffenePostenTable rows={zeilen} />
    </div>
  );
}
