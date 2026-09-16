import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { JahrFilterForm } from "./jahr-filter-form";
import { VerifikationsStern } from "./verifikations-stern";
import { berechneMieterJahresbericht, type MietvertragFuerJahresbericht } from "@/lib/jahresbericht-mieter";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

async function ladeJahresuebersicht(jahr: number) {
  const jahresanfang = new Date(jahr, 0, 1);
  const jahresende = new Date(jahr + 1, 0, 1);

  const [zahlungen, kostenpositionen, nebenkostenausgleichZahlungen] = await Promise.all([
    prisma.zahlung.findMany({
      where: { datum: { gte: jahresanfang, lt: jahresende } },
      select: { betrag: true },
    }),
    prisma.kostenposition.findMany({
      where: { jahr },
      include: { kostenart: true },
    }),
    // Auszahlungen/Einzüge aus der Nebenkostenabrechnung (Guthaben-Auszahlungen, Nachzahlungen)
    // fließen nie als Zahlung/Kostenposition ein — werden direkt aus dem Nebenkostenausgleich-
    // Archiv gezählt (nach tatsächlichem Zahlungsdatum, nicht Abrechnungsjahr), das seit dem
    // vereinfachten Import die einzige Quelle für jede Nebenkostenausgleich-Buchung ist.
    prisma.nebenkostenausgleichZahlung.findMany({
      where: { datum: { gte: jahresanfang, lt: jahresende } },
      select: { betrag: true },
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
  for (const z of nebenkostenausgleichZahlungen) {
    const betrag = -Number(z.betrag);
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
  };
}

async function ladeMieterZeilen(jahr: number) {
  const [objekt, vertraegeRaw] = await Promise.all([
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
    prisma.mietvertrag.findMany({
      where: { status: { in: ["AKTIV", "BEENDET"] } },
      include: {
        einheit: true,
        mieter: true,
        zahlungen: { select: { periodeMonat: true, periodeJahr: true, betrag: true } },
        abrechnungspositionen: {
          select: { saldo: true, abrechnung: { select: { jahr: true } } },
        },
        mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
      },
    }),
  ]);

  // Tatsächlich gezahlte/erhaltene Summe je Mietvertrag+Abrechnungsjahr aus dem Nebenkostenausgleich-
  // Archiv (dieselbe Quelle wie die "Rückzahlung/Gutschrift"-Spalte auf der Abrechnungs-
  // Detailseite) — ersetzt das frühere, direkt auf der Position gepflegte beglichenBetrag.
  const nebenkostenausgleichZahlungen = await prisma.nebenkostenausgleichZahlung.findMany({
    where: { mietvertragId: { in: vertraegeRaw.map((v) => v.id) } },
    select: { mietvertragId: true, jahr: true, betrag: true },
  });
  const zahlungSummenMap = new Map<string, number>();
  for (const z of nebenkostenausgleichZahlungen) {
    if (!z.mietvertragId || z.jahr === null) continue;
    const key = `${z.mietvertragId}|${z.jahr}`;
    zahlungSummenMap.set(key, (zahlungSummenMap.get(key) ?? 0) - Number(z.betrag));
  }

  const vertraege: MietvertragFuerJahresbericht[] = vertraegeRaw.map((v) => ({
    id: v.id,
    beginn: v.beginn,
    ende: v.ende,
    kaltmiete: Number(v.kaltmiete),
    nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
    mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
    saldovortrag: Number(v.saldovortrag),
    mieterhoehungen: v.mieterhoehungen.map((m) => ({
      gueltigAb: m.gueltigAb,
      kaltmiete: Number(m.kaltmiete),
      nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    })),
    einheitBezeichnung: v.einheit.bezeichnung,
    mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    zahlungen: v.zahlungen.map((z) => ({
      periodeMonat: z.periodeMonat,
      periodeJahr: z.periodeJahr,
      betrag: Number(z.betrag),
    })),
    nebenkostenPositionen: v.abrechnungspositionen.map((p) => ({
      jahr: p.abrechnung.jahr,
      saldo: Number(p.saldo),
      zahlungSumme: zahlungSummenMap.get(`${v.id}|${p.abrechnung.jahr}`) ?? 0,
    })),
  }));

  return berechneMieterJahresbericht(
    vertraege,
    jahr,
    objekt?.buchhaltungAb ?? null,
    objekt?.buchhaltungBis ?? null,
  );
}

export default async function JahresuebersichtPage({
  searchParams,
}: {
  searchParams: Promise<{ jahr?: string }>;
}) {
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear();

  const [daten, mieterZeilen, verifikationen] = await Promise.all([
    ladeJahresuebersicht(jahr),
    ladeMieterZeilen(jahr),
    prisma.jahresberichtVerifikation.findMany({ where: { jahr }, select: { mietvertragId: true } }),
  ]);
  const verifizierteIds = new Set(verifikationen.map((v) => v.mietvertragId));

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

      <div className="mb-6">
        <h2 className="mb-3 text-lg font-medium text-white">Mieteinnahmen nach Mietvertrag</h2>
        <p className="mb-3 text-sm text-neutral-400">
          Saldo neu = Saldo alt − Soll + Miete + Nebenkostenabrechnung offen (Vorjahr). Negativer
          Saldo = Rückstand, positiver Saldo = Guthaben/Vorauszahlung. &bdquo;Nebenkostenabrechnung
          offen (Vorjahr)&ldquo; zeigt den offenen Saldo der {jahr - 1}er-Abrechnung (eine
          Nebenkostenabrechnung wird typischerweise erst im Folgejahr beglichen, fließt daher erst
          in Saldo neu ein, nicht in Saldo alt): positiv = noch auszuzahlendes Guthaben, negativ =
          noch einzuziehende Nachzahlung.
        </p>
        <p className="mb-3 text-sm text-neutral-400">
          Miete sowie Saldo alt/neu zählen nach der{" "}
          <Link href="/zahlungen" className="underline hover:text-white">
            zugeordneten Periode
          </Link>{" "}
          einer Zahlung, nicht nach ihrem tatsächlichen Buchungsdatum — eine z.B. Ende Dezember
          schon für Januar überwiesene Miete zählt so korrekt zum Folgejahr, statt das laufende
          Jahr künstlich ins Plus zu ziehen.
        </p>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-xs text-neutral-400">
                <th className="px-4 py-2">Mietvertrag</th>
                <th className="px-4 py-2 text-right">Saldo alt</th>
                <th className="px-4 py-2 text-right">Soll</th>
                <th className="px-4 py-2 text-right">Miete</th>
                <th className="px-4 py-2 text-right">Nebenkostenabrechnung offen (Vorjahr)</th>
                <th className="px-4 py-2 text-right">Saldo neu</th>
                <th className="px-4 py-2 text-center" title="Stimmt mit dem vorhandenen Jahresbericht des früheren Verwalters überein">
                  ✓
                </th>
              </tr>
            </thead>
            <tbody>
              {mieterZeilen.map((z) => (
                <tr key={z.mietvertragId} className="border-b border-neutral-800">
                  <td className="px-4 py-2">
                    <Link href={`/mietvertraege/${z.mietvertragId}`} className="text-white hover:underline">
                      {z.einheitBezeichnung} – {z.mieterNamen}
                    </Link>
                  </td>
                  <td className={`px-4 py-2 text-right ${z.saldoAlt < 0 ? "text-red-400" : "text-neutral-300"}`}>
                    {formatEuro(z.saldoAlt)}
                  </td>
                  <td className="px-4 py-2 text-right text-neutral-300">{formatEuro(z.soll)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">{formatEuro(z.miete)}</td>
                  <td className="px-4 py-2 text-right text-neutral-300">
                    {z.nebenkostenabrechnungOffen ? formatEuro(z.nebenkostenabrechnungOffen) : "–"}
                  </td>
                  <td
                    className={`px-4 py-2 text-right font-medium ${z.saldoNeu < 0 ? "text-red-400" : "text-white"}`}
                  >
                    {formatEuro(z.saldoNeu)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <VerifikationsStern
                      mietvertragId={z.mietvertragId}
                      jahr={jahr}
                      verifiziert={verifizierteIds.has(z.mietvertragId)}
                    />
                  </td>
                </tr>
              ))}
              {mieterZeilen.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-4 text-center text-neutral-500">
                    Keine Mietverträge mit Bewegung in {jahr}.
                  </td>
                </tr>
              )}
            </tbody>
            {mieterZeilen.length > 0 && (
              <tfoot>
                <tr className="border-t border-neutral-800 font-medium">
                  <td className="px-4 py-2 text-white">Summe</td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.saldoAlt, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.soll, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.miete, 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + (z.nebenkostenabrechnungOffen ?? 0), 0))}
                  </td>
                  <td className="px-4 py-2 text-right text-white">
                    {formatEuro(mieterZeilen.reduce((s, z) => s + z.saldoNeu, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

    </div>
  );
}
