import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { DeleteButton } from "@/components/delete-button";
import { deleteZahlung } from "./actions";

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

export default async function ZahlungenPage() {
  const zahlungen = await prisma.zahlung.findMany({
    orderBy: { datum: "desc" },
    include: { mietvertrag: { include: { einheit: true, mieter: true } } },
  });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Zahlungen</h1>
          <p className="text-sm text-neutral-400">{zahlungen.length} Zahlungen erfasst</p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/zahlungen/import"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Aus Kontoauszug importieren
          </Link>
          <Link
            href="/zahlungen/neu"
            className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
          >
            + Neue Zahlung
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-neutral-800">
        <table className="w-full text-sm">
          <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
            <tr>
              <th className="px-4 py-2">Datum</th>
              <th className="px-4 py-2">Einheit</th>
              <th className="px-4 py-2">Mieter</th>
              <th className="px-4 py-2">Für Periode</th>
              <th className="px-4 py-2">Betrag</th>
              <th className="px-4 py-2">Verwendungszweck</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {zahlungen.map((z) => (
              <tr key={z.id} className="border-t border-neutral-800 hover:bg-neutral-900">
                <td className="px-4 py-2 text-white">{formatDate(z.datum)}</td>
                <td className="px-4 py-2 text-white">
                  <Link
                    href={`/mietvertraege/${z.mietvertragId}`}
                    className="font-medium hover:underline"
                  >
                    {z.mietvertrag.einheit.bezeichnung}
                  </Link>
                </td>
                <td className="px-4 py-2 text-white">
                  {z.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
                </td>
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
            {zahlungen.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-neutral-500">
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
