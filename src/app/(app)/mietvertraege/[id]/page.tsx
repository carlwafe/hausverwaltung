import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EckdatenSektion } from "../eckdaten-sektion";
import { uploadDokument } from "../../dokumente/actions";
import { BelegeSektion } from "@/components/belege-sektion";
import { berechneSoll, berechneIstNachPeriode, sollAufschluesselung, ermittleAktuelleMiete } from "@/lib/soll-ist";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { baueMieterkontoJahr } from "@/lib/mieterkonto";
import { MieterkontoAnsicht } from "./mieterkonto-ansicht";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

export default async function MietvertragDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [vertrag, objekt] = await Promise.all([
    prisma.mietvertrag.findUnique({
      where: { id },
      include: {
        einheit: true,
        mieter: true,
        kaution: true,
        buchungen: {
          where: { buchungsart: { code: "MIETZAHLUNG" }, ...AKTIVE_BUCHUNG_FILTER },
          orderBy: { datum: "desc" },
        },
        dokumente: { orderBy: { createdAt: "desc" } },
        mieterhoehungen: { orderBy: { gueltigAb: "desc" } },
        abrechnungspositionen: { select: { saldo: true, abrechnung: { select: { jahr: true } } } },
      },
    }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
  ]);

  if (!vertrag) notFound();

  const sonderBuchungen = await prisma.buchung.findMany({
    where: { mietvertragId: id, buchungsart: { code: { in: ["MAHNGEBUEHR", "SONDERZAHLUNG"] } }, ...AKTIVE_BUCHUNG_FILTER },
    select: { id: true, datum: true, betrag: true, verwendungszweck: true, buchungsart: { select: { code: true } } },
    orderBy: { datum: "desc" },
  });

  const mieterhoehungen = vertrag.mieterhoehungen.map((m) => ({
    id: m.id,
    gueltigAb: m.gueltigAb,
    kaltmiete: Number(m.kaltmiete),
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    notizen: m.notizen,
  }));

  const vertragFuerSollIst = {
    beginn: vertrag.beginn,
    ende: vertrag.ende,
    kaltmiete: Number(vertrag.kaltmiete),
    nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
    mehrwertsteuer: vertrag.mehrwertsteuer ? Number(vertrag.mehrwertsteuer) : 0,
    mieterhoehungen,
  };

  const aktuelleMiete = ermittleAktuelleMiete(vertragFuerSollIst);

  // Derselbe Stichtag wie auf /offene-posten (statt immer "heute") — sonst zeigen beide Seiten
  // für denselben Vertrag unterschiedliche Salden, je nachdem wie weit die Buchhaltung tatsächlich
  // erfasst ist (z.B. wenn eine Miete erst im Folgemonat gebucht wurde).
  const bis = objekt?.buchhaltungBis ?? new Date();
  const soll = berechneSoll(vertragFuerSollIst, bis, objekt?.buchhaltungAb ?? null);
  const ist = berechneIstNachPeriode(
    vertrag.buchungen.map((z) => ({
      datum: z.datum!,
      betrag: Number(z.betrag),
      periodeMonat: z.periodeMonat,
      periodeJahr: z.periodeJahr,
    })),
    objekt?.buchhaltungAb ?? null,
    bis,
  );
  const saldovortrag = Number(vertrag.saldovortrag);
  // Offene Sonderforderung (Gebühren minus Zahlungen darauf) im selben Zeitraum wie Soll/Ist.
  const ab = objekt?.buchhaltungAb ?? null;
  const sonderOffenImSaldo = sonderBuchungen
    .filter((b) => b.datum && (!ab || b.datum >= ab) && b.datum <= bis)
    .reduce((sum, b) => sum + (b.buchungsart.code === "MAHNGEBUEHR" ? Number(b.betrag) : -Number(b.betrag)), 0);
  const saldo = ist - soll + saldovortrag - sonderOffenImSaldo;
  const sollZeilenAufsteigend = sollAufschluesselung(vertragFuerSollIst, bis, objekt?.buchhaltungAb ?? null);
  // Jahre für das Mieterkonto: ab dem ersten Jahr mit Zahlungen (oder dem Stichtag/Soll-Beginn) bis
  // zum "erfasst bis"-Jahr. Vor dem Buchhaltungs-Stichtag gibt es kein vom System geführtes Soll —
  // dort wird es zur Darstellung ab Mietbeginn nachgerechnet (Übertrag beginnt bei 0).
  const stichtagAb = objekt?.buchhaltungAb ?? null;
  const zahlungenListe = vertrag.buchungen
    .filter((z) => z.datum)
    .map((z) => ({
      id: z.id,
      datum: z.datum!,
      betrag: Number(z.betrag),
      verwendungszweck: z.verwendungszweck,
      periodeMonat: z.periodeMonat,
      periodeJahr: z.periodeJahr,
    }));
  const sonderListe = sonderBuchungen
    .filter((b) => b.datum)
    .map((b) => ({
      id: b.id,
      datum: b.datum!,
      betrag: Number(b.betrag),
      verwendungszweck: b.verwendungszweck,
      istForderung: b.buchungsart.code === "MAHNGEBUEHR",
    }));
  // Offene Nebenkostenabrechnung des Vorjahres je Jahr (wie in der Jahresübersicht): Saldo der
  // Abrechnung ./. tatsächlich gezahlte/erhaltene Summe aus dem Nebenkostenausgleich.
  const nkAusgleich = await prisma.buchung.findMany({
    where: { mietvertragId: id, buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, ...AKTIVE_BUCHUNG_FILTER },
    select: { jahr: true, betrag: true },
  });
  const nkZahlungNachJahr = new Map<number, number>();
  for (const z of nkAusgleich) {
    if (z.jahr === null) continue;
    nkZahlungNachJahr.set(z.jahr, (nkZahlungNachJahr.get(z.jahr) ?? 0) - Number(z.betrag));
  }
  const nkOffenFuerJahr = (jahr: number): number | null => {
    const position = vertrag.abrechnungspositionen.find((p) => p.abrechnung.jahr === jahr - 1);
    return position ? Number(position.saldo) - (nkZahlungNachJahr.get(jahr - 1) ?? 0) : null;
  };
  const letztesJahr = bis.getFullYear();
  const erstesJahr = Math.min(
    letztesJahr,
    ...zahlungenListe.map((z) => z.periodeJahr ?? z.datum.getFullYear()),
    ...sonderListe.map((b) => b.datum.getFullYear()),
    stichtagAb ? stichtagAb.getFullYear() : letztesJahr,
  );
  const sollVollAb = sollAufschluesselung(vertragFuerSollIst, bis, null);
  const konten: Record<number, ReturnType<typeof baueMieterkontoJahr>> = {};
  const kontoJahre: number[] = [];
  for (let j = letztesJahr; j >= erstesJahr; j--) {
    kontoJahre.push(j);
    const vorStichtag = stichtagAb !== null && j < stichtagAb.getFullYear();
    konten[j] = baueMieterkontoJahr({
      jahr: j,
      saldovortrag: vorStichtag ? 0 : saldovortrag,
      sollZeilen: vorStichtag ? sollVollAb.filter((s) => s.jahr >= erstesJahr) : sollZeilenAufsteigend,
      zahlungen: zahlungenListe,
      sonderBuchungen: sonderListe,
      ab: vorStichtag ? null : stichtagAb,
      bis,
      nebenkostenabrechnungOffen: nkOffenFuerJahr(j),
    });
  }

  const letzteErhoehungText =
    mieterhoehungen.length > 0
      ? `Miete zuletzt zum ${formatDate(mieterhoehungen[0].gueltigAb)} auf ${formatEuro(mieterhoehungen[0].kaltmiete)} Kaltmiete + ${formatEuro(mieterhoehungen[0].nebenkostenVorauszahlung)} NK erhöht${mieterhoehungen.length > 1 ? ` (${mieterhoehungen.length} Erhöhungen insgesamt)` : ""}.`
      : null;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">
          {vertrag.einheit.bezeichnung} —{" "}
          {vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
        </h1>
      </div>
      <EckdatenSektion
        mietvertragId={id}
        einheitLabel={vertrag.einheit.bezeichnung}
        mieterNamen={vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
        beginnText={vertrag.beginn ? formatDate(vertrag.beginn) : "unbekannt"}
        endeText={vertrag.ende ? formatDate(vertrag.ende) : "–"}
        kaltmieteText={formatEuro(aktuelleMiete.kaltmiete)}
        nebenkostenText={formatEuro(aktuelleMiete.nebenkostenVorauszahlung)}
        mehrwertsteuerText={vertrag.mehrwertsteuer ? formatEuro(Number(vertrag.mehrwertsteuer)) : null}
        status={vertrag.status}
        saldovortragText={formatEuro(saldovortrag)}
        kaution={
          vertrag.kaution
            ? {
                betragText: formatEuro(Number(vertrag.kaution.betrag)),
                anlageform: vertrag.kaution.anlageform,
                zinssatzText: vertrag.kaution.zinssatz ? `${Number(vertrag.kaution.zinssatz)} %` : "–",
              }
            : null
        }
        letzteErhoehungText={letzteErhoehungText}
      />

      <div className="my-4 grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">
            Soll ({objekt?.buchhaltungAb ? "seit Buchhaltungs-Stichtag" : "seit Mietbeginn"}, bis{" "}
            {formatDate(bis)})
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(soll)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">
            Ist (erhaltene Zahlungen{objekt?.buchhaltungAb ? " seit Stichtag" : ""}, bis{" "}
            {formatDate(bis)})
          </p>
          <p className="mt-1 text-lg font-semibold text-white">{formatEuro(ist)}</p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Saldovortrag (vor Stichtag)</p>
          <p
            className={`mt-1 text-lg font-semibold ${saldovortrag < 0 ? "text-red-400" : saldovortrag > 0 ? "text-green-400" : "text-white"}`}
          >
            {formatEuro(saldovortrag)}
          </p>
        </div>
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Saldo</p>
          <p
            className={`mt-1 text-lg font-semibold ${saldo < 0 ? "text-red-400" : saldo > 0 ? "text-green-400" : "text-white"}`}
          >
            {formatEuro(saldo)}
          </p>
          {Math.abs(sonderOffenImSaldo) > 0.005 && (
            <p className="mt-1 text-xs text-neutral-500">inkl. Sonderforderung {formatEuro(-sonderOffenImSaldo)}</p>
          )}
        </div>
      </div>

      <MieterkontoAnsicht
        mietvertragId={vertrag.id}
        jahre={kontoJahre}
        konten={konten}
        standardJahr={letztesJahr}
        stichtagAb={
          stichtagAb ? { jahr: stichtagAb.getFullYear(), datum: formatDate(stichtagAb) } : null
        }
      />

      {/* Sonderforderungen (Rücklastschrift-/Mahngebühren) werden seit kurzem unter /zahlungen
          erfasst (Zahlungsart "Gebühr") statt hier separat — sie stehen bereits als amber
          hervorgehobene Sonderbuchung im Mieterkonto oben, hier nur noch ein kurzer Verweis. */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-neutral-800 p-4">
        <p className="text-xs text-neutral-500">
          Sonderforderungen (Gebühren) stehen als Sonderbuchung im Mieterkonto oben. Offen:{" "}
          <span className={sonderOffenImSaldo > 0.005 ? "text-amber-400" : "text-green-400"}>
            {formatEuro(Math.round(sonderOffenImSaldo * 100) / 100)}
          </span>
        </p>
        <Link
          href={`/zahlungen/neu?mietvertragId=${vertrag.id}`}
          className="rounded-md border border-neutral-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-900"
        >
          + Gebühr erfassen
        </Link>
      </div>

      <div className="mt-6">
        <BelegeSektion
          dokumente={vertrag.dokumente}
          uploadAction={uploadDokument.bind(null, {
            mietvertragId: id,
            revalidatePath: `/mietvertraege/${id}`,
          })}
          revalidatePath={`/mietvertraege/${id}`}
        />
      </div>
    </div>
  );
}
