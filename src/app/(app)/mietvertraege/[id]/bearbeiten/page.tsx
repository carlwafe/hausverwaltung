import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../../mietvertrag-form";
import { DeleteButton } from "@/components/delete-button";
import { toDateInputValue } from "@/lib/date-utils";
import { ermittleAktuelleMiete } from "@/lib/soll-ist";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
import {
  updateMietvertrag,
  deleteMietvertrag,
  erfasseMieterhoehung,
  loescheMieterhoehung,
} from "../../actions";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

/**
 * Eigene Unterseite fürs Bearbeiten (statt eingeklappt auf der Detailseite) — hier stehen
 * ausschließlich das Formular, die Mieterhöhungen-Verwaltung und der Löschen-Knopf. Die normale
 * Detailseite bleibt dadurch ein reiner Lesebereich ohne Löschen-Knopf.
 */
export default async function MietvertragBearbeitenPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vertrag, einheitenRaw, mieter] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: {
        einheit: true,
        mieter: true,
        kaution: true,
        mieterhoehungen: { orderBy: { gueltigAb: "desc" } },
      },
    }),
    prisma.einheit.findMany({ include: { gebaeude: { include: { haus: { include: { gebaeude: true } } } } } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
  ]);
  if (!vertrag) notFound();

  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);
  const mieterhoehungen = vertrag.mieterhoehungen.map((m) => ({
    id: m.id,
    gueltigAb: m.gueltigAb,
    kaltmiete: Number(m.kaltmiete),
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    notizen: m.notizen,
  }));
  const aktuelleMiete = ermittleAktuelleMiete({
    kaltmiete: Number(vertrag.kaltmiete),
    nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
    mieterhoehungen,
  });
  const mieterNamen = vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">
            Mietvertrag bearbeiten — {vertrag.einheit.bezeichnung} ({mieterNamen})
          </h1>
          <Link href={`/mietvertraege/${id}`} className="text-sm text-neutral-400 hover:text-white hover:underline">
            ← Zurück ohne zu speichern
          </Link>
        </div>
        <DeleteButton
          action={deleteMietvertrag.bind(null, id)}
          confirmText="Mietvertrag wirklich löschen? Zahlungen und Kaution werden mitgelöscht."
        />
      </div>

      <MietvertragForm
        einheiten={einheiten.map((e) => ({ id: e.id, label: e.bezeichnung, typ: e.typ }))}
        mieter={mieter.map((m) => ({ id: m.id, label: `${m.nachname}, ${m.vorname}` }))}
        initial={{
          einheitId: vertrag.einheitId,
          mieterId1: vertrag.mieter[0]?.id ?? "",
          mieterId2: vertrag.mieter[1]?.id,
          beginn: toDateInputValue(vertrag.beginn),
          beginnUnbekannt: vertrag.beginn === null,
          ende: toDateInputValue(vertrag.ende),
          kaltmiete: vertrag.kaltmiete.toString(),
          nebenkostenVorauszahlung: vertrag.nebenkostenVorauszahlung.toString(),
          mehrwertsteuer: vertrag.mehrwertsteuer?.toString() ?? "",
          status: vertrag.status,
          kautionBetrag: vertrag.kaution?.betrag.toString() ?? "",
          kautionAnlageform: vertrag.kaution?.anlageform ?? "KAUTIONSKONTO",
          kautionZinssatz: vertrag.kaution?.zinssatz?.toString() ?? "",
          saldovortrag: vertrag.saldovortrag.toString(),
        }}
        action={updateMietvertrag.bind(null, id)}
      />

      <div className="mt-8">
        <h2 className="mb-4 text-lg font-medium text-white">Mieterhöhungen ({mieterhoehungen.length})</h2>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Gültig ab</th>
                <th className="px-4 py-2">Kaltmiete</th>
                <th className="px-4 py-2">NK-Vorauszahlung</th>
                <th className="px-4 py-2">Notizen</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {mieterhoehungen.map((m) => (
                <tr key={m.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">{formatDate(m.gueltigAb)}</td>
                  <td className="px-4 py-2 text-white">{formatEuro(m.kaltmiete)}</td>
                  <td className="px-4 py-2 text-white">{formatEuro(m.nebenkostenVorauszahlung)}</td>
                  <td className="max-w-[160px] truncate px-4 py-2 text-white" title={m.notizen ?? ""}>
                    {m.notizen || "–"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteButton
                      action={loescheMieterhoehung.bind(null, m.id)}
                      confirmText="Mieterhöhung wirklich löschen?"
                      label="Löschen"
                    />
                  </td>
                </tr>
              ))}
              {mieterhoehungen.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                    Noch keine Mieterhöhung erfasst.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={erfasseMieterhoehung.bind(null, vertrag.id)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
        >
          <div>
            <label className="block text-xs text-neutral-400">Gültig ab</label>
            <input
              type="date"
              name="gueltigAb"
              required
              className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400">Kaltmiete</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="kaltmiete"
              required
              defaultValue={aktuelleMiete.kaltmiete}
              className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs text-neutral-400">NK-Vorauszahlung</label>
            <input
              type="number"
              step="0.01"
              min="0"
              name="nebenkostenVorauszahlung"
              required
              defaultValue={aktuelleMiete.nebenkostenVorauszahlung}
              className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-neutral-400">Notizen (optional)</label>
            <input
              type="text"
              name="notizen"
              className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white"
            />
          </div>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            + Mieterhöhung erfassen
          </button>
        </form>
      </div>
    </div>
  );
}
