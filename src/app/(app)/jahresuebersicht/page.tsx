import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JahrFilterForm } from "./jahr-filter-form";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

async function ladeJahresuebersicht(jahr: number) {
  const jahresanfang = new Date(jahr, 0, 1);
  const jahresende = new Date(jahr + 1, 0, 1);

  const [zahlungen, kostenpositionen, begleichungen, sonstigeBuchungen] = await Promise.all([
    prisma.zahlung.findMany({
      where: { datum: { gte: jahresanfang, lt: jahresende } },
      select: { betrag: true },
    }),
    prisma.kostenposition.findMany({
      where: { jahr },
      include: { kostenart: true },
    }),
    // Auszahlungen/Einzüge aus der Nebenkostenabrechnung (Guthaben-Auszahlungen, Nachzahlungen)
    // fließen nie als Zahlung/Kostenposition ein — werden separat auf der Position selbst
    // festgehalten (siehe kontoauszug/import/actions.ts: commitNebenkostenausgleich). Für eine
    // vollständige Einnahmen/Ausgaben-Übersicht müssen sie hier zusätzlich berücksichtigt werden.
    prisma.nebenkostenabrechnungPosition.findMany({
      where: { beglichenAm: { gte: jahresanfang, lt: jahresende } },
      select: { beglichenBetrag: true },
    }),
    prisma.sonstigeBuchung.findMany({
      where: { datum: { gte: jahresanfang, lt: jahresende } },
      orderBy: { datum: "asc" },
    }),
  ]);

  const mieteinnahmen = zahlungen.reduce((sum, z) => sum + Number(z.betrag), 0);

  const kostenNachArtMap = new Map<string, { summe: number; umlagefaehig: boolean }>();
  for (const k of kostenpositionen) {
    const eintrag = kostenNachArtMap.get(k.kostenart.name) ?? {
      summe: 0,
      umlagefaehig: k.kostenart.umlagefaehig,
    };
    eintrag.summe += Number(k.betrag);
    kostenNachArtMap.set(k.kostenart.name, eintrag);
  }
  const kostenNachArt = [...kostenNachArtMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.summe - a.summe);
  const kostenSumme = kostenpositionen.reduce((sum, k) => sum + Number(k.betrag), 0);

  // Vorzeichen wie NebenkostenabrechnungPosition.saldo: positiv = ausgezahltes Guthaben (Ausgabe
  // für den Eigentümer), negativ = eingezogene Nachzahlung (Einnahme).
  let nachzahlungenEingezogen = 0;
  let guthabenAusgezahlt = 0;
  for (const b of begleichungen) {
    const betrag = Number(b.beglichenBetrag);
    if (betrag > 0) guthabenAusgezahlt += betrag;
    else nachzahlungenEingezogen += -betrag;
  }

  const einnahmen = mieteinnahmen + nachzahlungenEingezogen;
  const ausgaben = kostenSumme + guthabenAusgezahlt;
  const ergebnis = einnahmen - ausgaben;

  return {
    mieteinnahmen,
    kostenNachArt,
    kostenSumme,
    nachzahlungenEingezogen,
    guthabenAusgezahlt,
    einnahmen,
    ausgaben,
    ergebnis,
    sonstigeBuchungen: sonstigeBuchungen.map((s) => ({
      id: s.id,
      datum: s.datum,
      betrag: Number(s.betrag),
      empfaenger: s.empfaenger,
      verwendungszweck: s.verwendungszweck,
    })),
  };
}

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const daten = await ladeJahresuebersicht(jahr);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Jahresübersicht</h1>
        <p className="text-sm text-neutral-400">
          Mieteinnahmen ./. Ausgaben nach dem Zuflussprinzip (Anlage V) — Einnahmen nach
          tatsächlichem Zahlungseingang, Kosten nach dem erfassten Abrechnungsjahr.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-neutral-800 p-4">
        <JahrFilterForm jahr={jahr} />
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Einnahmen {jahr}</p>
          <p className="mt-1 text-xl font-semibold text-green-400">{formatEuro(daten.einnahmen)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ausgaben {jahr}</p>
          <p className="mt-1 text-xl font-semibold text-red-400">{formatEuro(daten.ausgaben)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Ergebnis {jahr}</p>
          <p
            className={`mt-1 text-xl font-semibold ${daten.ergebnis < 0 ? "text-red-400" : "text-white"}`}
          >
            {formatEuro(daten.ergebnis)}
          </p>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-3 text-lg font-medium text-white">Einnahmen</h2>
          <div className="rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                <tr className="border-b border-neutral-800">
                  <td className="px-4 py-2 text-white">
                    <Link href="/zahlungen" className="hover:underline">
                      Mieteinnahmen (Zahlungen)
                    </Link>
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(daten.mieteinnahmen)}
                  </td>
                </tr>
                {daten.nachzahlungenEingezogen > 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href="/nebenkostenabrechnungen" className="hover:underline">
                        Nebenkosten-Nachzahlungen eingezogen
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.nachzahlungenEingezogen)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 font-medium text-white">Summe</td>
                  <td className="px-4 py-2 text-right font-medium text-white">
                    {formatEuro(daten.einnahmen)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-lg font-medium text-white">Ausgaben nach Kostenart</h2>
          <div className="max-h-[400px] overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {daten.kostenNachArt.map((k) => (
                  <tr key={k.name} className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      {k.name}
                      {!k.umlagefaehig && (
                        <span className="ml-2 text-xs text-neutral-500">(nicht umlagefähig)</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right text-white">{formatEuro(k.summe)}</td>
                  </tr>
                ))}
                {daten.kostenNachArt.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-4 text-center text-neutral-500">
                      Keine Kostenpositionen für {jahr}.
                    </td>
                  </tr>
                )}
                {daten.guthabenAusgezahlt > 0 && (
                  <tr className="border-b border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href="/nebenkostenabrechnungen" className="hover:underline">
                        Nebenkosten-Guthaben ausgezahlt
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-right text-white">
                      {formatEuro(daten.guthabenAusgezahlt)}
                    </td>
                  </tr>
                )}
                <tr>
                  <td className="px-4 py-2 font-medium text-white">Summe</td>
                  <td className="px-4 py-2 text-right font-medium text-white">
                    {formatEuro(daten.ausgaben)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {daten.sonstigeBuchungen.length > 0 && (
        <div className="rounded-lg border border-amber-900 bg-amber-950/30 p-4">
          <p className="mb-2 text-sm font-medium text-amber-400">
            {daten.sonstigeBuchungen.length} Sonstige Buchung(en) in {jahr} — nicht in der
            Berechnung oben enthalten, bitte manuell prüfen
          </p>
          <ul className="space-y-1 text-sm text-neutral-300">
            {daten.sonstigeBuchungen.map((s) => (
              <li key={s.id}>
                {formatDate(s.datum)} · {formatEuro(s.betrag)} · {s.empfaenger ?? s.verwendungszweck ?? "–"}
              </li>
            ))}
          </ul>
          <Link
            href="/sonstige-buchungen"
            className="mt-2 inline-block text-sm text-amber-400 hover:underline"
          >
            Zu Sonstige Buchungen →
          </Link>
        </div>
      )}
    </div>
  );
}
