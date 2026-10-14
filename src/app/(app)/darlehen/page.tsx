import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { DARLEHEN_BEZUG, DARLEHEN_BUCHUNGSART } from "@/lib/darlehen";
import { getCurrentUser } from "@/lib/session";
import { formatEuro } from "@/lib/dokumente-anzeige";
import { DeleteButton } from "@/components/delete-button";
import { loescheDarlehensrate, loescheSchuldzinsenJahreswert } from "./actions";
import { JahreswertForm, type JahreswertDarlehen } from "./jahreswert-form";
import { RateDarlehenSelect } from "./rate-darlehen-select";
import { zeitraumText, zinsenJeMonat } from "@/lib/darlehen-zinsen";
import type { Bankwert, Zinsstufe } from "@/lib/tilgungsplan";

type Rate = {
  id: string;
  tilgungId: string | null; // null = reine Zinsbuchung ohne Tilgungsteil
  kostenId: string | null;
  datum: Date;
  text: string;
  zins: number;
  tilgung: number;
  darlehenId: string; // "" = noch keinem Darlehen zugeordnet
};

const datumText = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);

// Darlehensraten, die über das Mietkonto laufen: Tilgung (kein Aufwand) und Zinsen (Schuldzinsen,
// Werbungskosten) je Abbuchung. Erfasst werden sie im Kontoauszug-Import (Buchungsart „Darlehensrate“).
export default async function DarlehenPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const { jahr: jahrParam } = await searchParams;
  const user = await getCurrentUser();
  const kannBearbeiten = !!user && user.role !== "GAST";

  const [tilgungen, zinsen, jahreswerte, darlehenListe, zuordnungen] = await Promise.all([
    prisma.buchung.findMany({
      where: { buchungsart: { code: DARLEHEN_BUCHUNGSART }, datum: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
    }),
    prisma.buchung.findMany({
      where: { kostenart: { anlageVZeile: "SCHULDZINSEN" }, buchungsart: { code: "KOSTENPOSITION" }, datum: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true, bezugTyp: true, bezugId: true },
    }),
    prisma.schuldzinsenJahreswert.findMany({ orderBy: [{ jahr: "desc" }, { erstelltAm: "asc" }] }),
    prisma.darlehen.findMany({ where: { aktiv: true }, orderBy: { bezeichnung: "asc" } }),
    prisma.darlehenZuordnung.findMany({ select: { buchungId: true, darlehenId: true } }),
  ]);
  const darlehenJeRate = new Map(zuordnungen.map((z) => [z.buchungId, z.darlehenId]));

  const zinsZuTilgung = new Map<string, (typeof zinsen)[number]>();
  const zinsOhneTilgung: (typeof zinsen)[number][] = [];
  for (const z of zinsen) {
    if (z.bezugTyp === DARLEHEN_BEZUG && z.bezugId) zinsZuTilgung.set(z.bezugId, z);
    else zinsOhneTilgung.push(z);
  }
  const raten: Rate[] = [
    ...tilgungen.map((t) => {
      const z = zinsZuTilgung.get(t.id);
      return {
        id: t.id,
        tilgungId: t.id,
        kostenId: z?.id ?? null,
        datum: t.datum!,
        text: t.verwendungszweck || t.empfaenger || "Darlehensrate",
        zins: z ? Number(z.betrag) : 0,
        tilgung: -Number(t.betrag), // Bankvorzeichen negativ → positive Tilgung
        darlehenId: darlehenJeRate.get(t.id) ?? "",
      };
    }),
    ...zinsOhneTilgung.map((z) => ({
      id: z.id,
      tilgungId: null,
      kostenId: z.id,
      datum: z.datum!,
      text: z.verwendungszweck || z.empfaenger || "Darlehenszinsen",
      zins: Number(z.betrag),
      tilgung: 0,
      darlehenId: darlehenJeRate.get(z.id) ?? "",
    })),
  ].sort((a, b) => b.datum.getTime() - a.datum.getTime());

  const jahre = [
    ...new Set([...raten.map((r) => r.datum.getUTCFullYear()), ...jahreswerte.map((j) => j.jahr), new Date().getFullYear()]),
  ].sort((a, b) => b - a);
  const jahr = Number(jahrParam) || jahre[0];
  const imJahr = raten.filter((r) => r.datum.getUTCFullYear() === jahr);
  const summeZins = imJahr.reduce((s, r) => s + r.zins, 0);
  const summeTilgung = imJahr.reduce((s, r) => s + r.tilgung, 0);
  const werteImJahr = jahreswerte.filter((j) => j.jahr === jahr);
  const darlehenOptionen = darlehenListe.map((d) => ({ id: d.id, label: [d.bezeichnung, d.bank, d.darlehensnummer].filter(Boolean).join(" · ") }));
  // Raten, die zu keinem (aktiven) Darlehen gehören, und die Zinsen über das Mietkonto je Darlehen.
  const ohneDarlehen = imJahr.filter((r) => !darlehenListe.some((d) => d.id === r.darlehenId));
  const mietkontoZinsenJeDarlehen = new Map<string, number>();
  for (const r of imJahr) mietkontoZinsenJeDarlehen.set(r.darlehenId, Math.round(((mietkontoZinsenJeDarlehen.get(r.darlehenId) ?? 0) + r.zins) * 100) / 100);
  const summeAndere = werteImJahr.reduce((s, j) => s + Number(j.betrag), 0);

  // Darlehen der Stammdaten für das Formular: Zinsen je Monat laut Tilgungsplan, Bankwert des Jahres, vorhandener Eintrag.
  const formDarlehen: JahreswertDarlehen[] = darlehenListe.map((d) => {
    const bank = ((d.bankwerte as Bankwert[] | null) ?? []).find((b) => b.jahr === jahr)?.zinsen ?? null;
    const vorhanden = werteImJahr.find((j) => j.darlehenId === d.id);
    return {
      id: d.id,
      label: [d.bezeichnung, d.bank, d.darlehensnummer].filter(Boolean).join(" · "),
      monate: zinsenJeMonat(
        {
          startRestschuld: Number(d.startRestschuld),
          startDatum: d.startDatum,
          rate: Number(d.rate),
          zinssatz: Number(d.zinssatz),
          zahltag: d.zahltag,
          laufzeitEnde: d.laufzeitEnde,
          zinsbindungBis: d.zinsbindungBis,
          stufen: (d.stufen as Zinsstufe[] | null) ?? [],
        },
        jahr,
      ),
      bankZinsen: bank,
      mietkontoZinsen: mietkontoZinsenJeDarlehen.get(d.id) ?? 0,
      alleRatenZugeordnet: ohneDarlehen.length === 0,
      vorhanden: vorhanden ? { betrag: Number(vorhanden.betrag), vonMonat: vorhanden.vonMonat, bisMonat: vorhanden.bisMonat } : null,
    };
  });
  // Vorgeschlagenes Ende des Zeitraums: der Monat vor der ersten Rate über das Mietkonto in diesem Jahr (ohne Rate: Dezember).
  const ersteMietkontoRate = imJahr.length > 0 ? Math.min(...imJahr.map((r) => r.datum.getUTCMonth() + 1)) : null;
  const standardBis = ersteMietkontoRate ? Math.max(ersteMietkontoRate - 1, 1) : 12;
  // Kontrolle gegen die Zinsbescheinigungen der Stammdaten (nur wenn für alle aktiven Darlehen ein Wert des Jahres erfasst ist).
  const bankWerte = formDarlehen.map((d) => d.bankZinsen).filter((z): z is number => z !== null);
  const bankSumme = bankWerte.reduce((a, b) => a + b, 0);
  const bankVollstaendig = formDarlehen.length > 0 && bankWerte.length === formDarlehen.length;
  const gesamtZinsen = Math.round((summeZins + summeAndere) * 100) / 100;
  const bankDifferenz = Math.round((gesamtZinsen - bankSumme) * 100) / 100;
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Darlehen</h1>
          <p className="max-w-3xl text-sm text-neutral-400">
            Raten der Darlehen, die über das Mietkonto abgebucht werden. Der Zinsanteil ist eine Kostenposition
            (Schuldzinsen, Werbungskosten, nicht umlagefähig), die Tilgung ist kein Aufwand und verringert nur
            die Restschuld. Erfasst wird im Kontoauszug-Import mit der Buchungsart „Darlehensrate (Zins +
            Tilgung)“; den Zinsanteil nennt der Tilgungsplan der Bank.
          </p>
        </div>
        <Link
          href="/kontoauszug/import"
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
        >
          Aus Kontoauszug importieren
        </Link>
      </div>

      {jahre.length > 1 && (
        <p className="mb-4 flex flex-wrap gap-2 text-sm">
          {jahre.map((j) => (
            <Link
              key={j}
              prefetch={false}
              href={`/darlehen?jahr=${j}`}
              className={j === jahr ? "font-medium text-white underline" : "text-neutral-400 hover:text-white"}
            >
              {j}
            </Link>
          ))}
        </p>
      )}

      <div className="mb-6 grid max-w-2xl grid-cols-3 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Raten {jahr}</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeZins + summeTilgung)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">davon Zinsen (Kosten)</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeZins)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">davon Tilgung (keine Kosten)</p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(summeTilgung)}</p>
        </div>
      </div>

      {ohneDarlehen.length > 0 && darlehenListe.length > 0 && (
        <p className="mb-3 max-w-3xl text-sm text-amber-400">
          {ohneDarlehen.length} {ohneDarlehen.length === 1 ? "Rate ist" : "Raten sind"} noch keinem Darlehen zugeordnet — in der Spalte
          „Darlehen“ wählen. Erst dann lassen sich die Zinsen je Darlehen mit der Bankbescheinigung vergleichen.
        </p>
      )}
      {imJahr.length === 0 ? (
        <p className="text-sm text-neutral-400">Noch keine Darlehensrate für {jahr} erfasst.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Verwendungszweck</th>
                <th className="px-4 py-2">Darlehen</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Zinsen</th>
                <th className="px-4 py-2 text-right">Tilgung</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {imJahr.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="whitespace-nowrap px-4 py-2 text-white">
                    <Link prefetch={false} href={`/darlehen/rate/${r.id}`} className="underline hover:text-neutral-300">
                      {datumText(r.datum)}
                    </Link>
                  </td>
                  <td className="max-w-md px-4 py-2 text-neutral-300">{r.text}</td>
                  <td className="px-4 py-2">
                    <RateDarlehenSelect ankerId={r.id} darlehenId={r.darlehenId} darlehen={darlehenOptionen} gesperrt={!kannBearbeiten} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(r.zins + r.tilgung)}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-white">
                    {r.kostenId ? (
                      <Link prefetch={false} href={`/kosten/${r.kostenId}`} className="underline hover:text-neutral-300">
                        {formatEuro(r.zins)}
                      </Link>
                    ) : (
                      formatEuro(r.zins)
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(r.tilgung)}</td>
                  <td className="px-4 py-2 text-right">
                    {kannBearbeiten && (
                      <DeleteButton
                        size="sm"
                        confirmText={
                          r.tilgungId
                            ? "Rate löschen? Der Zinsanteil wird mit gelöscht (storniert)."
                            : "Diese Zinsbuchung löschen (stornieren)? Die Bankzeile lässt sich danach im Import neu erfassen."
                        }
                        action={loescheDarlehensrate.bind(null, r.id) as () => Promise<void>}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section className="mt-10">
        <h2 className="text-lg font-medium text-white">Zinsen von anderen Konten {jahr} (laut Bankbescheinigung)</h2>
        <p className="mt-1 max-w-3xl text-sm text-neutral-400">
          Darlehensraten, die nicht über das Mietkonto gezahlt wurden (z.B. von einem anderen Konto vor dem Wechsel),
          gehören nicht ins Journal. Hier wählst du das Darlehen und den Zeitraum der Raten — der Zinsbetrag wird aus dem
          Tilgungsplan der Stammdaten vorgeschlagen und lässt sich überschreiben. Je Darlehen und Jahr gibt es einen
          Eintrag; die Zinsen erscheinen in der „Aufstellung für die Steuererklärung“ (Jahresübersicht), ohne Kontostand
          oder Kontenabgleich zu berühren. Nur Zinsen eintragen, die <span className="text-neutral-200">nicht über das
          Mietkonto</span> gezahlt wurden, sonst zählen sie doppelt.
        </p>
        {werteImJahr.length > 0 && (
          <div className="mt-3 max-w-3xl overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {werteImJahr.map((j) => (
                  <tr key={j.id} className="border-b border-neutral-800 last:border-b-0">
                    <td className="px-4 py-2 text-white">
                      {j.bezeichnung}
                      {[zeitraumText(j.vonMonat, j.bisMonat), j.bemerkung].filter(Boolean).length > 0 && (
                        <span className="ml-2 text-xs text-neutral-500">
                          {[zeitraumText(j.vonMonat, j.bisMonat), j.bemerkung].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right text-white">{formatEuro(Number(j.betrag))}</td>
                    <td className="px-4 py-2 text-right">
                      {kannBearbeiten && (
                        <DeleteButton
                          size="sm"
                          confirmText="Eintrag löschen?"
                          action={loescheSchuldzinsenJahreswert.bind(null, j.id) as () => Promise<void>}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {kannBearbeiten && <JahreswertForm key={jahr} jahr={jahr} darlehen={formDarlehen} standardBis={standardBis} />}
        <p className="mt-4 max-w-3xl text-sm text-neutral-400">
          Kontrolle: Zinsen {jahr} gesamt = {formatEuro(summeZins)} (Mietkonto) + {formatEuro(summeAndere)} (andere
          Konten) = <span className="font-medium text-white">{formatEuro(gesamtZinsen)}</span> — das muss
          der Summe der Bankbescheinigung für alle Darlehen entsprechen.
        </p>
        {bankVollstaendig ? (
          <p className={`mt-1 max-w-3xl text-sm ${Math.abs(bankDifferenz) < 0.05 ? "text-green-400" : "text-amber-400"}`}>
            Laut Bankbescheinigung (Stammdaten): {formatEuro(bankSumme)} —{" "}
            {Math.abs(bankDifferenz) < 0.05
              ? "stimmt überein."
              : `Differenz ${formatEuro(bankDifferenz)} (${bankDifferenz > 0 ? "zu viel erfasst" : "noch nicht erfasst"}).`}
          </p>
        ) : (
          formDarlehen.length > 0 && (
            <p className="mt-1 max-w-3xl text-sm text-neutral-500">
              Zinsen {jahr} laut Bescheinigung sind in den Stammdaten für {bankWerte.length} von {formDarlehen.length} Darlehen
              erfasst — mit allen erfassten Werten vergleicht die Seite automatisch.
            </p>
          )
        )}
      </section>
    </div>
  );
}
