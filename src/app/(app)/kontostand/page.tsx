import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ladeKontostandVerlauf, ladeKontostandEintraege } from "@/lib/buchungsjournal";
import { kontostandAmStichtag } from "@/lib/kontostand";
import { DeleteButton } from "@/components/delete-button";
import { KontostandKontrolleForm } from "./kontostand-kontrolle-form";
import { loescheKontostandKontrolle } from "./actions";
import { KontostandTable, type KontostandRow } from "./kontostand-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function KontostandPage() {
  const objekt = await prisma.objekt.findFirst({
    select: { kontostandAnkerDatum: true, kontostandAnkerBetrag: true },
  });

  if (!objekt?.kontostandAnkerDatum || objekt.kontostandAnkerBetrag === null) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
        <p className="max-w-xl text-sm text-neutral-400">
          Um den Kontostand-Verlauf zu simulieren, brauche ich einen Referenzpunkt — den echten
          Kontostand an einem bestimmten Tag (z.B. von einem Kontoauszug abgelesen). Trag ihn unter{" "}
          <Link href="/objekt" className="underline hover:text-white">
            Objekt-Einstellungen
          </Link>{" "}
          ein.
        </p>
      </div>
    );
  }

  const anker = {
    datum: objekt.kontostandAnkerDatum,
    betrag: Number(objekt.kontostandAnkerBetrag),
  };

  const [verlauf, eintraege, kontrollen] = await Promise.all([
    ladeKontostandVerlauf(anker),
    ladeKontostandEintraege(),
    prisma.kontostandKontrolle.findMany({ orderBy: { datum: "desc" } }),
  ]);

  // Simulierter Stand am Ende des Kontrolltags (Buchungen des Tages zählen mit) gegen den echten Stand.
  const kontrollZeilen = kontrollen.map((k) => {
    const simuliert = kontostandAmStichtag(eintraege, anker, new Date(k.datum.getTime() + 24 * 60 * 60 * 1000 - 1));
    const bank = Number(k.betrag);
    const differenz = Math.round((simuliert - bank) * 100) / 100;
    return { id: k.id, datum: k.datum, notiz: k.notiz, bank, simuliert, differenz };
  });

  const rows: KontostandRow[] = verlauf
    .slice()
    .reverse()
    .map((z) => ({
      id: z.id,
      datum: z.datum.toISOString(),
      betrag: z.betrag,
      kategorie: z.kategorie,
      beschreibung: z.beschreibung,
      kontostand: z.kontostand,
    }));

  const aktuellerStand = rows[0]?.kontostand ?? anker.betrag;

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-white">Kontostand</h1>
      <p className="mb-6 max-w-2xl text-sm text-neutral-400">
        Simulierter Verlauf, aus allen erfassten Buchungen (Zahlungen, Kosten, Mietweiterleitungen,
        Kautionsbuchungen, nicht kategorisierte Buchungen) relativ zum Anker am {formatDate(anker.datum)} (
        {formatEuro(anker.betrag)}) berechnet. Die Genauigkeit hängt davon ab, dass alle Kontoauszüge
        vollständig importiert sind —{" "}
        <Link href="/kontoauszug/importe" className="underline hover:text-white">
          dort lässt sich das je Importdatei prüfen
        </Link>
        .
      </p>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-400">Aktueller simulierter Kontostand</p>
        <p className="mt-1 text-lg font-semibold text-white">{formatEuro(aktuellerStand)}</p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <h2 className="mb-1 text-sm font-medium text-white">Kontostand prüfen</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Trag den echten Kontostand von einem Kontoauszug ein (Stand am Ende des Tages). Er wird mit dem
          simulierten Kontostand desselben Tages verglichen — eine Abweichung heißt, dass eine Buchung fehlt oder
          falsch erfasst ist. Die Prüfwerte ändern den Verlauf nicht.
        </p>
        <KontostandKontrolleForm />
        {kontrollZeilen.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="py-2 pr-4">Datum</th>
                  <th className="px-4 py-2 text-right">Laut Kontoauszug</th>
                  <th className="px-4 py-2 text-right">Simuliert</th>
                  <th className="px-4 py-2 text-right">Differenz</th>
                  <th className="px-4 py-2">Ergebnis</th>
                  <th className="px-4 py-2">Notiz</th>
                  <th className="py-2 pl-4" />
                </tr>
              </thead>
              <tbody>
                {kontrollZeilen.map((k) => {
                  const stimmt = Math.abs(k.differenz) < 0.005;
                  return (
                    <tr key={k.id} className="border-t border-neutral-800">
                      <td className="py-2 pr-4 text-white">{formatDate(k.datum)}</td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(k.bank)}</td>
                      <td className="px-4 py-2 text-right text-neutral-200">{formatEuro(k.simuliert)}</td>
                      <td className={`px-4 py-2 text-right ${stimmt ? "text-neutral-500" : "text-red-400"}`}>
                        {formatEuro(k.differenz)}
                      </td>
                      <td className="px-4 py-2">
                        {stimmt ? (
                          <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-400">stimmt</span>
                        ) : (
                          <span
                            className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs text-red-400"
                            title="Simulierter Stand minus Kontoauszug: negativ = im Journal fehlen Einnahmen/es sind zu viele Ausgaben erfasst, positiv = umgekehrt"
                          >
                            Abweichung
                          </span>
                        )}
                      </td>
                      <td className="max-w-[240px] truncate px-4 py-2 text-xs text-neutral-500" title={k.notiz ?? ""}>
                        {k.notiz}
                      </td>
                      <td className="py-2 pl-4 text-right">
                        <DeleteButton
                          action={loescheKontostandKontrolle.bind(null, k.id)}
                          confirmText="Prüfwert wirklich entfernen?"
                          label="Entfernen"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <KontostandTable rows={rows} />
    </div>
  );
}
