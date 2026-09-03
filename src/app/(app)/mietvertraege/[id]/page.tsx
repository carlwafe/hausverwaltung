import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../mietvertrag-form";
import { toDateInputValue } from "@/lib/date-utils";
import { updateMietvertrag, deleteMietvertrag } from "../actions";
import { deleteZahlung } from "../../zahlungen/actions";
import { DeleteButton } from "@/components/delete-button";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import { berechneSoll, berechneIst } from "@/lib/soll-ist";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

const MONATE_KURZ = [
  "Jan",
  "Feb",
  "Mär",
  "Apr",
  "Mai",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Okt",
  "Nov",
  "Dez",
];

export default async function MietvertragDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vertrag, einheitenRaw, mieter, objekt] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: {
        einheit: true,
        mieter: true,
        kaution: true,
        zahlungen: { orderBy: { datum: "desc" } },
      },
    }),
    prisma.einheit.findMany({ include: { gebaeude: true } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true } }),
  ]);

  if (!vertrag) notFound();
  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);

  const soll = berechneSoll(
    {
      beginn: vertrag.beginn,
      ende: vertrag.ende,
      kaltmiete: Number(vertrag.kaltmiete),
      nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
    },
    new Date(),
    objekt?.buchhaltungAb ?? null,
  );
  const ist = berechneIst(
    vertrag.zahlungen.map((z) => ({ datum: z.datum, betrag: Number(z.betrag) })),
    objekt?.buchhaltungAb ?? null,
  );
  const saldo = ist - soll;

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          {vertrag.einheit.bezeichnung} —{" "}
          {vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
        </h1>
        <DeleteButton
          action={deleteMietvertrag.bind(null, id)}
          confirmText="Mietvertrag wirklich löschen? Zahlungen und Kaution werden mitgelöscht."
        />
      </div>
      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${m.vorname} ${m.nachname}` }))}
        initial={{
          einheitId: vertrag.einheitId,
          mieterId1: vertrag.mieter[0]?.id ?? "",
          mieterId2: vertrag.mieter[1]?.id,
          beginn: toDateInputValue(vertrag.beginn),
          ende: toDateInputValue(vertrag.ende),
          kaltmiete: vertrag.kaltmiete.toString(),
          nebenkostenVorauszahlung: vertrag.nebenkostenVorauszahlung.toString(),
          status: vertrag.status,
          kautionBetrag: vertrag.kaution?.betrag.toString() ?? "",
          kautionAnlageform: vertrag.kaution?.anlageform ?? "KAUTIONSKONTO",
          kautionZinssatz: vertrag.kaution?.zinssatz?.toString() ?? "",
        }}
        action={updateMietvertrag.bind(null, id)}
      />

      <div className="mt-10 flex items-center justify-between">
        <h2 className="text-lg font-medium text-white">Zahlungen ({vertrag.zahlungen.length})</h2>
        <Link
          href={`/zahlungen/neu?mietvertragId=${vertrag.id}`}
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          + Zahlung erfassen
        </Link>
      </div>

      <div className="my-4 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">
            Soll ({objekt?.buchhaltungAb ? "seit Buchhaltungs-Stichtag" : "seit Mietbeginn"})
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(soll)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">
            Ist (erhaltene Zahlungen{objekt?.buchhaltungAb ? " seit Stichtag" : ""})
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(ist)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Saldo</p>
          <p
            className={`mt-1 text-lg font-semibold ${saldo < 0 ? "text-red-400" : saldo > 0 ? "text-green-400" : "text-white"}`}
          >
            {formatEuro(saldo)}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Datum</th>
              <th className="px-4 py-2">Für Periode</th>
              <th className="px-4 py-2">Betrag</th>
              <th className="px-4 py-2">Verwendungszweck</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {vertrag.zahlungen.map((z) => (
              <tr key={z.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">{formatDate(z.datum)}</td>
                <td className="px-4 py-2 text-white">
                  {MONATE_KURZ[z.periodeMonat - 1]} {z.periodeJahr}
                </td>
                <td className="px-4 py-2 text-white">{formatEuro(Number(z.betrag))}</td>
                <td className="px-4 py-2 text-white">{z.verwendungszweck || "–"}</td>
                <td className="px-4 py-2 text-right">
                  <DeleteButton
                    action={deleteZahlung.bind(null, z.id)}
                    confirmText="Zahlung wirklich löschen?"
                    label="Löschen"
                  />
                </td>
              </tr>
            ))}
            {vertrag.zahlungen.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                  Noch keine Zahlungen erfasst.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
