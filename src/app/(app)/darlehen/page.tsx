import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { DARLEHEN_BEZUG, DARLEHEN_BUCHUNGSART } from "@/lib/darlehen";
import { getCurrentUser } from "@/lib/session";
import { formatEuro } from "@/lib/dokumente-anzeige";
import { DeleteButton } from "@/components/delete-button";
import { loescheDarlehensrate, loescheSchuldzinsenJahreswert } from "./actions";
import { JahreswertForm } from "./jahreswert-form";

type Rate = {
  id: string;
  tilgungId: string | null; // null = reine Zinsbuchung ohne Tilgungsteil
  kostenId: string | null;
  datum: Date;
  text: string;
  zins: number;
  tilgung: number;
};

const datumText = (d: Date) => new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(d);

// Darlehensraten, die über das Mietkonto laufen: Tilgung (kein Aufwand) und Zinsen (Schuldzinsen,
// Werbungskosten) je Abbuchung. Erfasst werden sie im Kontoauszug-Import (Buchungsart „Darlehensrate“).
export default async function DarlehenPage({ searchParams }: { searchParams: Promise<{ jahr?: string }> }) {
  const { jahr: jahrParam } = await searchParams;
  const user = await getCurrentUser();
  const kannBearbeiten = !!user && user.role !== "GAST";

  const [tilgungen, zinsen, jahreswerte] = await Promise.all([
    prisma.buchung.findMany({
      where: { buchungsart: { code: DARLEHEN_BUCHUNGSART }, datum: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
    }),
    prisma.buchung.findMany({
      where: { kostenart: { anlageVZeile: "SCHULDZINSEN" }, buchungsart: { code: "KOSTENPOSITION" }, datum: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true, bezugTyp: true, bezugId: true },
    }),
    prisma.schuldzinsenJahreswert.findMany({ orderBy: [{ jahr: "desc" }, { erstelltAm: "asc" }] }),
  ]);

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
  const summeAndere = werteImJahr.reduce((s, j) => s + Number(j.betrag), 0);

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

      {imJahr.length === 0 ? (
        <p className="text-sm text-neutral-400">Noch keine Darlehensrate für {jahr} erfasst.</p>
      ) : (
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-neutral-400">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Verwendungszweck</th>
                <th className="px-4 py-2 text-right">Rate</th>
                <th className="px-4 py-2 text-right">Zinsen</th>
                <th className="px-4 py-2 text-right">Tilgung</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {imJahr.map((r) => (
                <tr key={r.id} className="border-t border-neutral-800">
                  <td className="whitespace-nowrap px-4 py-2 text-white">{datumText(r.datum)}</td>
                  <td className="max-w-md px-4 py-2 text-neutral-300">{r.text}</td>
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
                    {kannBearbeiten && r.tilgungId && (
                      <DeleteButton
                        size="sm"
                        confirmText="Rate löschen? Der Zinsanteil wird mit gelöscht (storniert)."
                        action={loescheDarlehensrate.bind(null, r.tilgungId) as () => Promise<void>}
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
          gehören nicht ins Journal. Hier trägst du nur ihren <span className="text-neutral-200">Zinsanteil</span> als
          Jahreswert ein, je Darlehen einen Eintrag — die Zinsen erscheinen dann in der „Aufstellung für die
          Steuererklärung“ (Jahresübersicht), ohne Kontostand oder Kontenabgleich zu berühren. Trage <span className="text-neutral-200">nur
          die nicht über das Mietkonto gezahlten Zinsen</span> ein: Bescheinigung der Bank minus die Zinsen oben,
          sonst zählen sie doppelt.
        </p>
        {werteImJahr.length > 0 && (
          <div className="mt-3 max-w-3xl overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <tbody>
                {werteImJahr.map((j) => (
                  <tr key={j.id} className="border-b border-neutral-800 last:border-b-0">
                    <td className="px-4 py-2 text-white">
                      {j.bezeichnung}
                      {j.bemerkung && <span className="ml-2 text-xs text-neutral-500">{j.bemerkung}</span>}
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
        {kannBearbeiten && <JahreswertForm jahr={jahr} />}
        <p className="mt-4 max-w-3xl text-sm text-neutral-400">
          Kontrolle: Zinsen {jahr} gesamt = {formatEuro(summeZins)} (Mietkonto) + {formatEuro(summeAndere)} (andere
          Konten) = <span className="font-medium text-white">{formatEuro(summeZins + summeAndere)}</span> — das muss
          der Summe der Bankbescheinigung für alle Darlehen entsprechen.
        </p>
      </section>
    </div>
  );
}
