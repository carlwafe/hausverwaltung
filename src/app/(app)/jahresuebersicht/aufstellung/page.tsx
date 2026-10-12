import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ladeJahresuebersicht, bildeZeitraum } from "../bericht-seite";
import { aufstellungZeilen, kostenNachGruppe, sonstigeEinnahmenZeilen, type ExportZeile } from "@/lib/aufstellung-export";
import { DruckenKnopf } from "./drucken-knopf";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function Tabelle({ titel, zeilen }: { titel: string; zeilen: ExportZeile[] }) {
  return (
    <div className="mb-5">
      <h2 className="mb-1 text-[11pt] font-semibold">{titel}</h2>
      <table className="w-full border-collapse text-[10pt]">
        <tbody>
          {zeilen.map((z) => (
            <tr key={z.text} className={`border-b border-neutral-300 ${z.fett ? "font-semibold" : ""} ${z.davon ? "text-[9pt] text-neutral-700" : ""}`}>
              <td className={`pr-2 ${z.davon ? "py-0.5 pl-6" : "py-1"}`}>
                {z.text}
                {z.hinweis && <span className="ml-2 text-[8pt] font-normal text-neutral-600">({z.hinweis})</span>}
              </td>
              <td className={`whitespace-nowrap text-right ${z.davon ? "py-0.5" : "py-1"}`}>{formatEuro(z.betrag)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Druckansicht der Aufstellung für den Steuerberater (A4, über "Drucken / als PDF sichern").
export default async function AufstellungDruckPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const { jahr: jahrParam } = await searchParams;
  const jahr = Number(jahrParam) || new Date().getFullYear() - 1;
  const [daten, objekt] = await Promise.all([
    ladeJahresuebersicht(bildeZeitraum(jahr, 0)),
    prisma.objekt.findFirst({ select: { name: true, strasse: true, hausnummer: true, plz: true, ort: true } }),
  ]);
  const z = aufstellungZeilen(daten.steuer, jahr);
  const gruppen = kostenNachGruppe(daten.steuerKosten);
  const sonstige = sonstigeEinnahmenZeilen(daten.steuer, daten.steuerKosten);

  return (
    <div>
      <div className="mb-6">
        <Link href={`/jahresuebersicht?jahr=${jahr}&quartal=0`} className="text-sm text-neutral-400 hover:text-white">
          ← Jahresübersicht {jahr}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold text-white">Aufstellung für die Steuererklärung {jahr}</h1>
        <p className="text-sm text-neutral-400">Druckansicht für den Steuerberater (A4, 2 Seiten).</p>
        <div className="flex flex-wrap gap-3 pt-3">
          <DruckenKnopf />
          <a href={`/api/aufstellung?jahr=${jahr}`} className="rounded-md border border-neutral-700 px-4 py-2 text-sm text-neutral-300 hover:text-white">
            Als CSV herunterladen
          </a>
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="druckbereich mx-auto w-[210mm] bg-white font-sans text-black shadow">
          <section className="box-border h-[297mm] overflow-hidden px-[20mm] py-[18mm]">
            <h1 className="text-[15pt] font-semibold">Einnahmen und Ausgaben {jahr}</h1>
            <p className="mb-6 text-[10pt] text-neutral-700">
              Aufstellung für die Anlage V (Einkünfte aus Vermietung und Verpachtung)
              {objekt && <> · Objekt: {objekt.strasse} {objekt.hausnummer}, {objekt.plz} {objekt.ort}</>}
            </p>
            <Tabelle titel="Einnahmen" zeilen={z.einnahmen} />
            <Tabelle titel="Kosten" zeilen={z.kosten} />
            <Tabelle titel="Überschuss" zeilen={z.ueberschuss} />
            {z.zehnTage.length > 0 && <Tabelle titel="Hinweis: 10-Tage-Regel" zeilen={z.zehnTage} />}
            <p className="mt-6 text-[8.5pt] leading-snug text-neutral-700">
              Grundlage: Mieten und Nebenkosten nach tatsächlichem Zahlungseingang (Zuflussprinzip), Kosten nach
              Abbuchungsdatum. Zahlungen ab dem 22.12. für die Januarmiete des Folgejahres sind nach der
              10-Tage-Regel (§ 11 Abs. 1 Satz 2 EStG) dem Folgejahr zugeordnet, entsprechende Zahlungen des
              Vorjahres diesem Jahr. Die Umsatzsteuer auf Garagenmieten ist von der Kaltmiete getrennt
              ausgewiesen; ihre Abführung an das Finanzamt ist hier nicht enthalten. Mieten und Nebenkosten: Zahlungen sind je Monat zuerst auf die
              Nebenkosten-Vorauszahlung angerechnet, der Rest ist Kaltmiete. Ausgezahlte Nebenkosten-Guthaben
              mindern die Nebenkosten-Einnahmen, Nachzahlungen erhöhen sie. Nicht enthalten: Absetzung für
              Abnutzung und Schuldzinsen.
            </p>
          </section>
          <section className="box-border h-[297mm] overflow-hidden px-[20mm] py-[18mm] [break-before:page]">
            <h2 className="mb-3 text-[13pt] font-semibold">Anlage: Kosten nach Kostenart und sonstige Einnahmen {jahr}</h2>
            {gruppen.map((g) => (
              <div key={g.gruppe} className="mb-4">
                <h3 className="mb-1 text-[10pt] font-semibold">
                  {g.label} <span className="font-normal text-neutral-600">— {formatEuro(g.summe)}</span>
                </h3>
                <table className="w-full border-collapse text-[9pt]">
                  <tbody>
                    {g.arten.map((a) => (
                      <tr key={a.name} className="border-b border-neutral-300">
                        <td className="py-0.5 pr-2">{a.name}</td>
                        <td className="whitespace-nowrap py-0.5 text-right">{formatEuro(a.summe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {sonstige.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-1 text-[10pt] font-semibold">
                  Sonstige Einnahmen <span className="font-normal text-neutral-600">— {formatEuro(daten.steuer.sonstigeEinnahmen)}</span>
                </h3>
                <table className="w-full border-collapse text-[9pt]">
                  <tbody>
                    {sonstige.map((e) => (
                      <tr key={e.text} className="border-b border-neutral-300">
                        <td className="py-0.5 pr-2">{e.text}</td>
                        <td className="whitespace-nowrap py-0.5 text-right">{formatEuro(e.betrag)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
