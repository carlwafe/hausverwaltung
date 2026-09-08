import { prisma } from "@/lib/prisma";
import { berechneSoll, berechneIst } from "@/lib/soll-ist";
import { DateInput } from "@/components/date-input";
import { toDateInputValue } from "@/lib/date-utils";
import { OffenePostenTable, type OffenePostenRow } from "./offene-posten-table";
import { setBuchhaltungBis, resetBuchhaltungBis } from "./actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDatum(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
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

export default async function OffenePostenPage() {
  const heute = new Date();
  const objekt = await prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } });
  const bis = objekt?.buchhaltungBis ?? heute;
  const istHeute = !objekt?.buchhaltungBis;

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

      <form className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4">
        <DateInput
          key={toDateInputValue(bis)}
          id="bis"
          name="bis"
          label="Buchhaltung erfasst bis"
          defaultValue={toDateInputValue(bis)}
        />
        <button
          type="submit"
          formAction={setBuchhaltungBis}
          className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
        >
          Speichern
        </button>
        {!istHeute && (
          <button
            type="submit"
            formAction={resetBuchhaltungBis}
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Zurücksetzen (auf heute)
          </button>
        )}
      </form>
      <p className="-mt-4 mb-6 text-xs text-neutral-500">
        Der Stichtag bleibt gespeichert, bis er zurückgesetzt wird — nicht nur für diesen Aufruf.
      </p>

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
