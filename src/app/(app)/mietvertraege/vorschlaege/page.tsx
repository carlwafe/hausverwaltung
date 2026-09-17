import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { periodenSummenAusZahlungen, erkenneMietwechsel, type ErkannterWechsel } from "@/lib/mieterhoehung-erkennung";
import { ermittleMieteFuerMonat, type MietvertragFuerSollIst } from "@/lib/soll-ist";
import { erfasseMieterhoehung, neuBerechnenVorschlaege } from "../actions";
import { VerwerfenToggle } from "./verwerfen-toggle";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const MONATE_KURZ = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

function periodeLabel(jahr: number, monat: number) {
  return `${MONATE_KURZ[monat - 1]} ${jahr}`;
}

function vorherigePeriode(jahr: number, monat: number): { jahr: number; monat: number } {
  return monat === 1 ? { jahr: jahr - 1, monat: 12 } : { jahr, monat: monat - 1 };
}

type VorschlagZeile = {
  mietvertragId: string;
  einheitLabel: string;
  mieterNamen: string;
  wechsel: ErkannterWechsel;
  vorgeschlageneKaltmiete: number;
  vorgeschlageneNk: number;
};

type HinweisZeile = {
  mietvertragId: string;
  einheitLabel: string;
  mieterNamen: string;
  aeltesteBezahltePeriode: { jahr: number; monat: number; summe: number };
  hinterlegterBasiswert: number;
};

async function ladeVorschlaege(): Promise<{ vorschlaege: VorschlagZeile[]; verworfen: VorschlagZeile[]; hinweise: HinweisZeile[] }> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: {
      einheit: true,
      mieter: true,
      zahlungen: { select: { periodeJahr: true, periodeMonat: true, betrag: true } },
      mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } },
      mieterhoehungVorschlaegeVerworfen: { select: { abJahr: true, abMonat: true } },
    },
  });

  const vorschlaege: VorschlagZeile[] = [];
  const verworfen: VorschlagZeile[] = [];
  const hinweise: HinweisZeile[] = [];

  for (const v of vertraege) {
    const einheitLabel = v.einheit.bezeichnung;
    const mieterNamen = v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") || "– ohne Mieter –";

    const vertragFuerSollIst: MietvertragFuerSollIst = {
      beginn: v.beginn,
      ende: v.ende,
      kaltmiete: Number(v.kaltmiete),
      nebenkostenVorauszahlung: Number(v.nebenkostenVorauszahlung),
      mehrwertsteuer: v.mehrwertsteuer ? Number(v.mehrwertsteuer) : 0,
      mieterhoehungen: v.mieterhoehungen.map((m) => ({
        gueltigAb: m.gueltigAb,
        kaltmiete: Number(m.kaltmiete),
        nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
      })),
    };

    const perioden = periodenSummenAusZahlungen(
      v.zahlungen.map((z) => ({ periodeJahr: z.periodeJahr, periodeMonat: z.periodeMonat, betrag: Number(z.betrag) })),
    );
    const { wechsel, aeltestesPlateau } = erkenneMietwechsel(perioden);

    const verworfenSet = new Set(v.mieterhoehungVorschlaegeVerworfen.map((w) => `${w.abJahr}-${w.abMonat}`));

    for (const w of wechsel) {
      // Bereits als echte Mieterhoehung erfasst (Monat + Betrag passen) -> kein Vorschlag mehr nötig.
      const bereitsErfasst = v.mieterhoehungen.some((mh) => {
        const gleicherMonat = mh.gueltigAb.getFullYear() === w.abJahr && mh.gueltigAb.getMonth() + 1 === w.abMonat;
        const gesamt = Number(mh.kaltmiete) + Number(mh.nebenkostenVorauszahlung);
        return gleicherMonat && Math.abs(gesamt - w.zuBetrag) <= 1;
      });
      if (bereitsErfasst) continue;

      const { jahr: vJahr, monat: vMonat } = vorherigePeriode(w.abJahr, w.abMonat);
      const alteMiete = ermittleMieteFuerMonat(vertragFuerSollIst, vJahr, vMonat);
      const alteSumme = alteMiete.kaltmiete + alteMiete.nebenkostenVorauszahlung;
      const kaltAnteil = alteSumme > 0 ? alteMiete.kaltmiete / alteSumme : 0.7;
      const vorgeschlageneKaltmiete = Math.round(w.zuBetrag * kaltAnteil * 100) / 100;
      const vorgeschlageneNk = Math.round((w.zuBetrag - vorgeschlageneKaltmiete) * 100) / 100;

      const zeile: VorschlagZeile = {
        mietvertragId: v.id,
        einheitLabel,
        mieterNamen,
        wechsel: w,
        vorgeschlageneKaltmiete,
        vorgeschlageneNk,
      };

      if (verworfenSet.has(`${w.abJahr}-${w.abMonat}`)) {
        verworfen.push(zeile);
      } else {
        vorschlaege.push(zeile);
      }
    }

    if (v.beginn && aeltestesPlateau) {
      const erwartet = ermittleMieteFuerMonat(vertragFuerSollIst, aeltestesPlateau.jahr, aeltestesPlateau.monat);
      const erwarteteSumme = erwartet.kaltmiete + erwartet.nebenkostenVorauszahlung;
      if (Math.abs(erwarteteSumme - aeltestesPlateau.summe) >= 3) {
        hinweise.push({
          mietvertragId: v.id,
          einheitLabel,
          mieterNamen,
          aeltesteBezahltePeriode: aeltestesPlateau,
          hinterlegterBasiswert: erwarteteSumme,
        });
      }
    }
  }

  return { vorschlaege, verworfen, hinweise };
}

export default async function MieterhoehungenVorschlaegePage() {
  const { vorschlaege, verworfen, hinweise } = await ladeVorschlaege();

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-white">Mieterhöhungen-Vorschläge</h1>
          <p className="text-sm text-neutral-400">
            Automatisch aus der Zahlungshistorie erkannte, stabile Betrags-Änderungen — die
            Aufschlüsselung zwischen Kaltmiete und NK-Vorauszahlung ist nur ein Vorschlag und sollte
            vor dem Übernehmen geprüft werden.
          </p>
        </div>
        <form action={neuBerechnenVorschlaege}>
          <button
            type="submit"
            className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
          >
            Neu berechnen
          </button>
        </form>
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-white">
          Erkannte, noch nicht erfasste Mieterhöhungen ({vorschlaege.length})
        </h2>
        {vorschlaege.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">
            Keine offenen Vorschläge.
          </p>
        ) : (
          <div className="space-y-3">
            {vorschlaege.map((z) => (
              <div
                key={`${z.mietvertragId}-${z.wechsel.abJahr}-${z.wechsel.abMonat}`}
                className="rounded-lg border border-neutral-800 p-4"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <Link href={`/mietvertraege/${z.mietvertragId}`} className="font-medium text-white hover:underline">
                      {z.einheitLabel} — {z.mieterNamen}
                    </Link>
                    <p className="text-sm text-neutral-400">
                      {formatEuro(z.wechsel.vonBetrag)} → {formatEuro(z.wechsel.zuBetrag)} ab{" "}
                      {periodeLabel(z.wechsel.abJahr, z.wechsel.abMonat)} (Differenz{" "}
                      {formatEuro(z.wechsel.zuBetrag - z.wechsel.vonBetrag)})
                    </p>
                  </div>
                  <VerwerfenToggle
                    mietvertragId={z.mietvertragId}
                    abJahr={z.wechsel.abJahr}
                    abMonat={z.wechsel.abMonat}
                    verworfen={false}
                  />
                </div>
                <form
                  action={erfasseMieterhoehung.bind(null, z.mietvertragId)}
                  className="flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="gueltigAb" value={`${z.wechsel.abJahr}-${String(z.wechsel.abMonat).padStart(2, "0")}-01`} />
                  <div>
                    <label className="block text-xs text-neutral-400">Kaltmiete</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      name="kaltmiete"
                      required
                      defaultValue={z.vorgeschlageneKaltmiete}
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
                      defaultValue={z.vorgeschlageneNk}
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
                    className="rounded-md bg-white px-3 py-2 text-sm font-medium text-black hover:bg-neutral-200"
                  >
                    Übernehmen
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mb-8">
        <h2 className="mb-4 text-lg font-medium text-white">
          Hinweis: älteste Zahlungsperiode weicht vom Basiswert ab ({hinweise.length})
        </h2>
        {hinweise.length === 0 ? (
          <p className="rounded-lg border border-neutral-800 p-4 text-sm text-neutral-500">Keine Auffälligkeiten.</p>
        ) : (
          <div className="overflow-auto rounded-lg border border-neutral-800">
            <table className="w-full text-sm">
              <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
                <tr>
                  <th className="px-4 py-2">Einheit / Mieter</th>
                  <th className="px-4 py-2">Älteste bezahlte Periode</th>
                  <th className="px-4 py-2">Hinterlegter Basiswert</th>
                  <th className="px-4 py-2">Differenz</th>
                </tr>
              </thead>
              <tbody>
                {hinweise.map((h) => (
                  <tr key={h.mietvertragId} className="border-t border-neutral-800">
                    <td className="px-4 py-2 text-white">
                      <Link href={`/mietvertraege/${h.mietvertragId}`} className="hover:underline">
                        {h.einheitLabel} — {h.mieterNamen}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-white">
                      {formatEuro(h.aeltesteBezahltePeriode.summe)} (
                      {periodeLabel(h.aeltesteBezahltePeriode.jahr, h.aeltesteBezahltePeriode.monat)})
                    </td>
                    <td className="px-4 py-2 text-white">{formatEuro(h.hinterlegterBasiswert)}</td>
                    <td className="px-4 py-2 text-white">
                      {formatEuro(h.aeltesteBezahltePeriode.summe - h.hinterlegterBasiswert)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-neutral-500">
          Der Basiswert eines Mietvertrags gilt laut Datenmodell ab Mietbeginn — weicht die älteste
          tatsächlich gezahlte Periode davon ab, lässt sich das nicht über eine weitere
          Mieterhöhung korrigieren (die wirkt nur vorwärts), sondern nur über eine manuelle
          Korrektur der Kaltmiete/NK-Vorauszahlung direkt am Mietvertrag.
        </p>
      </div>

      {verworfen.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-medium text-white">Verworfene Vorschläge ({verworfen.length})</h2>
          <div className="space-y-3">
            {verworfen.map((z) => (
              <div
                key={`${z.mietvertragId}-${z.wechsel.abJahr}-${z.wechsel.abMonat}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-800 p-4 opacity-60"
              >
                <div>
                  <Link href={`/mietvertraege/${z.mietvertragId}`} className="font-medium text-white hover:underline">
                    {z.einheitLabel} — {z.mieterNamen}
                  </Link>
                  <p className="text-sm text-neutral-400">
                    {formatEuro(z.wechsel.vonBetrag)} → {formatEuro(z.wechsel.zuBetrag)} ab{" "}
                    {periodeLabel(z.wechsel.abJahr, z.wechsel.abMonat)}
                  </p>
                </div>
                <VerwerfenToggle
                  mietvertragId={z.mietvertragId}
                  abJahr={z.wechsel.abJahr}
                  abMonat={z.wechsel.abMonat}
                  verworfen={true}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
