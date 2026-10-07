import { notFound } from "next/navigation";
import { NK_AUSGLEICH_ODER_VERRECHNUNG, NK_VERRECHNUNG_BEZUG, nkBegleichung } from "@/lib/nk-verrechnung";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { EckdatenSektion } from "../eckdaten-sektion";
import { uploadDokument } from "../../dokumente/actions";
import { BelegeSektion } from "@/components/belege-sektion";
import { berechneSoll, berechneIstNachPeriode, sollAufschluesselung, ermittleAktuelleMiete, ermittleMieteFuerMonat, mietnachlaesseFuerSoll } from "@/lib/soll-ist";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { baueMieterkontoJahr } from "@/lib/mieterkonto";
import { baueKautionskonto } from "@/lib/kautionskonto";
import { SONDERBUCHUNGEN_FILTER, sonderWirkung } from "@/lib/sonderforderungen";
import type { KostenanteilDetailEintrag } from "@/lib/nebenkostenabrechnung";
import { MietvertragReiter } from "./mietvertrag-reiter";
import type { NkJahrDaten } from "./nebenkosten-ansicht";
import { mieterName } from "@/lib/mieter-name";
import { saldoMitToleranz, unbezahlteNkVorauszahlung } from "@/lib/nk-saldo";
import { TicketsSektion } from "../../tickets/tickets-sektion";
import { ladeLastschriftMandat } from "@/lib/lastschrift-mandat";
import { effektiverStichtag, hatEigenenStichtag } from "@/lib/buchhaltung-stichtag";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

// Art der Erledigung / Weg je Buchungsart, die eine NK-Abrechnung begleicht (siehe nk-verrechnung.ts).
const NK_ERLEDIGUNG: Record<string, { art: string; weg: string }> = {
  NEBENKOSTENAUSGLEICH: { art: "Auszahlung / Zahlung", weg: "Banküberweisung (Nebenkostenausgleich)" },
  MAHNGEBUEHR: { art: "Verrechnung mit Miete", weg: "Forderung im Mieterkonto" },
  KAUTION_EINBEHALT: { art: "Verrechnung mit Kaution", weg: "Einbehalt aus der Kaution" },
};

// Warme Betriebskosten (Heizung, Warmwasser, verbundene Anlagen — BetrKV § 2 Nr. 4–6).
const istWarmeKostenart = (k: { name: string; betrKvNummer: number | null }) =>
  (k.betrKvNummer !== null && [4, 5, 6].includes(k.betrKvNummer)) || /heiz|warmwasser/i.test(k.name);

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
        einheit: { include: { gebaeude: { select: { strasse: true, hausnummer: true, objekt: { select: { plz: true, ort: true } } } } } },
        mieter: true,
        kaution: { include: { einbehalte: true } },
        buchungen: {
          where: { buchungsart: { code: "MIETZAHLUNG" }, ...AKTIVE_BUCHUNG_FILTER },
          orderBy: { datum: "desc" },
        },
        dokumente: { orderBy: { createdAt: "desc" } },
        mieterhoehungen: { orderBy: { gueltigAb: "desc" } },
        mietnachlaesse: { orderBy: [{ jahr: "asc" }, { monat: "asc" }] },
        abrechnungspositionen: {
          select: {
            zeitraumVon: true,
            zeitraumBis: true,
            kostenanteilGesamt: true,
            vorauszahlungGesamt: true,
            saldo: true,
            details: true,
            abrechnung: { select: { id: true, jahr: true, status: true } },
          },
        },
      },
    }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
  ]);

  if (!vertrag) notFound();

  const sonderBuchungen = await prisma.buchung.findMany({
    where: { mietvertragId: id, ...SONDERBUCHUNGEN_FILTER, ...AKTIVE_BUCHUNG_FILTER },
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
    mietnachlaesse: mietnachlaesseFuerSoll(vertrag.mietnachlaesse),
  };

  const aktuelleMiete = ermittleAktuelleMiete(vertragFuerSollIst);

  // Derselbe Stichtag wie auf /offene-posten (statt immer "heute") — sonst zeigen beide Seiten
  // für denselben Vertrag unterschiedliche Salden, je nachdem wie weit die Buchhaltung tatsächlich
  // erfasst ist (z.B. wenn eine Miete erst im Folgemonat gebucht wurde).
  const bis = objekt?.buchhaltungBis ?? new Date();
  // Stichtag dieses Vertrags: sein eigener (früherer), sonst der des Objekts.
  const stichtagAb = effektiverStichtag(vertrag, objekt);
  const eigenerStichtag = hatEigenenStichtag(vertrag, objekt);
  const soll = berechneSoll(vertragFuerSollIst, bis, stichtagAb);
  const ist = berechneIstNachPeriode(
    vertrag.buchungen.map((z) => ({
      datum: z.datum!,
      betrag: Number(z.betrag),
      periodeMonat: z.periodeMonat,
      periodeJahr: z.periodeJahr,
    })),
    stichtagAb,
    bis,
  );
  const saldovortrag = Number(vertrag.saldovortrag);
  // Offene Sonderforderung (Gebühren minus Zahlungen darauf) im selben Zeitraum wie Soll/Ist.
  const sonderOffenImSaldo = sonderBuchungen
    .filter((b) => b.datum && (!stichtagAb || b.datum >= stichtagAb) && b.datum <= bis)
    .reduce((sum, b) => sum - sonderWirkung(b.buchungsart.code, Number(b.betrag)), 0);
  const saldo = ist - soll + saldovortrag - sonderOffenImSaldo;
  const sollZeilenAufsteigend = sollAufschluesselung(vertragFuerSollIst, bis, stichtagAb);
  // Jahre für das Mieterkonto: ab dem ersten Jahr mit Zahlungen (oder dem Stichtag/Soll-Beginn) bis
  // zum "erfasst bis"-Jahr. Vor dem Buchhaltungs-Stichtag (stichtagAb, des Vertrags) gibt es kein vom System
  // geführtes Soll — dort wird es zur Darstellung ab Mietbeginn nachgerechnet (Übertrag beginnt bei 0).
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
      // Forderung mit ihrem Betrag, Zahlungen/Verrechnungen mit ihrer (positiven) Wirkung.
      betrag: b.buchungsart.code === "MAHNGEBUEHR" ? Number(b.betrag) : sonderWirkung(b.buchungsart.code, Number(b.betrag)),
      verwendungszweck: b.verwendungszweck,
      istForderung: b.buchungsart.code === "MAHNGEBUEHR",
      ...(b.buchungsart.code === "KAUTION_EINBEHALT" ? { bezeichnung: "Verrechnung mit Kaution", href: "/kautionen" } : {}),
    }));
  // Offene Nebenkostenabrechnung des Vorjahres je Jahr (wie in der Jahresübersicht): Saldo der
  // Abrechnung ./. tatsächlich gezahlte/erhaltene Summe aus dem Nebenkostenausgleich.
  const nkAusgleich = await prisma.buchung.findMany({
    where: { mietvertragId: id, ...NK_AUSGLEICH_ODER_VERRECHNUNG, ...AKTIVE_BUCHUNG_FILTER },
    select: { jahr: true, datum: true, betrag: true, buchungsart: { select: { code: true } } },
    orderBy: { datum: "asc" },
  });
  const nkZahlungNachJahr = new Map<number, number>();
  for (const z of nkAusgleich) {
    if (z.jahr === null) continue;
    nkZahlungNachJahr.set(z.jahr, (nkZahlungNachJahr.get(z.jahr) ?? 0) + nkBegleichung(z.buchungsart.code, Number(z.betrag)));
  }
  // Monatliche NK-Vorauszahlung nach einer Abrechnung: die erste Mieterhöhung nach Jahresende, sonst
  // der im Januar des Folgejahres geltende Betrag — null, wenn der Vertrag bis dahin endet.
  const neueVorauszahlungNach = (jahr: number): NkJahrDaten["neueVorauszahlung"] => {
    const jahresende = new Date(jahr, 11, 31, 23, 59, 59);
    if (vertrag.ende && vertrag.ende <= jahresende) return null;
    const naechste = [...mieterhoehungen].reverse().find((m) => m.gueltigAb > jahresende);
    if (naechste && (!vertrag.ende || naechste.gueltigAb <= vertrag.ende))
      return { ab: naechste.gueltigAb, betrag: naechste.nebenkostenVorauszahlung };
    return { ab: null, betrag: ermittleMieteFuerMonat(vertragFuerSollIst, jahr + 1, 1).nebenkostenVorauszahlung };
  };
  // Reiter "Nebenkostenabrechnung": je Abrechnungsjahr die Position dieses Vertrags mit
  // Aufschlüsselung und den Buchungen, die sie begleichen (gleiche Zuordnung über Mietvertrag+Jahr).
  const kostenarten = await prisma.kostenart.findMany({ select: { id: true, name: true, betrKvNummer: true } });
  const warmeKostenartIds = kostenarten.filter(istWarmeKostenart).map((k) => k.id);
  const nkDaten: Record<number, NkJahrDaten> = {};
  for (const p of vertrag.abrechnungspositionen) {
    const j = p.abrechnung.jahr;
    nkDaten[j] = {
      jahr: j,
      abrechnungId: p.abrechnung.id,
      abrechnungStatus: p.abrechnung.status,
      zeitraumVon: p.zeitraumVon,
      zeitraumBis: p.zeitraumBis,
      kostenanteilGesamt: Number(p.kostenanteilGesamt),
      vorauszahlungGesamt: Number(p.vorauszahlungGesamt),
      saldo: Number(p.saldo),
      details: Array.isArray(p.details) ? (p.details as unknown as KostenanteilDetailEintrag[]) : [],
      warmeKostenartIds,
      erledigungen: nkAusgleich
        .filter((z) => z.jahr === j)
        .map((z) => ({
          datum: z.datum,
          art: NK_ERLEDIGUNG[z.buchungsart.code]?.art ?? z.buchungsart.code,
          weg: NK_ERLEDIGUNG[z.buchungsart.code]?.weg ?? "",
          betrag: nkBegleichung(z.buchungsart.code, Number(z.betrag)),
        })),
      neueVorauszahlung: neueVorauszahlungNach(j),
    };
  }
  const nkJahre = Object.keys(nkDaten)
    .map(Number)
    .sort((a, b) => b - a);

  // Das Anpassungsschreiben (nur beim neuesten Jahr mit Vorschlag) nennt bei Lastschrift Mandatsreferenz und
  // Gläubiger-ID aus der Bankzeile der letzten Lastschrift — nur dann laden, wenn das Schreiben gebraucht wird.
  const mandat =
    nkJahre.length > 0 && nkDaten[nkJahre[0]].neueVorauszahlung && vertrag.zahlungsweg !== "UEBERWEISUNG"
      ? await ladeLastschriftMandat(vertrag.id)
      : null;

  // Reiter "Kautionsabrechnung": alle Kautionsbuchungen des Vertrags (Einbehalte kommen aus den
  // KautionEinbehalt-Zeilen, damit auch strittige ohne Journalbuchung erscheinen).
  const kautionBuchungen = await prisma.buchung.findMany({
    where: {
      mietvertragId: id,
      buchungsart: { kontokreis: "KAUTIONSKONTO", code: { not: "KAUTION_EINBEHALT" } },
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { id: true, datum: true, betrag: true, verwendungszweck: true, buchungsart: { select: { code: true, bezeichnung: true } } },
    orderBy: { datum: "asc" },
  });
  const kautionskonto = baueKautionskonto({
    sollBetrag: vertrag.kaution ? Number(vertrag.kaution.betrag) : null,
    einzahlungUnbekannt: vertrag.kaution?.einzahlungUnbekannt ?? false,
    mietbeginn: vertrag.beginn,
    bewegungen: kautionBuchungen.map((b) => ({
      id: b.id,
      datum: b.datum,
      code: b.buchungsart.code,
      bezeichnung: b.buchungsart.bezeichnung,
      betrag: Number(b.betrag),
      verwendungszweck: b.verwendungszweck,
    })),
    einbehalte: (vertrag.kaution?.einbehalte ?? []).map((e) => ({
      id: e.id,
      datum: e.datum ?? e.erstelltAm,
      positionText: e.positionText,
      betrag: Number(e.betrag),
      status: e.status,
      nkJahr: e.bezugTyp === NK_VERRECHNUNG_BEZUG && e.bezugId ? Number(e.bezugId) : null,
      mieterkonto: e.bezugTyp === "Mieterkonto",
    })),
  });
  // Offene NK-Abrechnung des Vorjahres. Bei berechneten Positionen (details gesetzt) wird die unbezahlte
  // NK-Vorauszahlung gegengerechnet: sie steht schon als Rückstand im Saldo und würde sonst zusätzlich
  // in der Nachzahlung zählen (siehe unbezahlteNkVorauszahlung).
  const nkOffenFuerJahr = (jahr: number): { offen: number; gegenrechnung: number } | null => {
    const position = vertrag.abrechnungspositionen.find((p) => p.abrechnung.jahr === jahr - 1);
    if (!position) return null;
    const gegenrechnung = Array.isArray(position.details)
      ? unbezahlteNkVorauszahlung(
          vertragFuerSollIst,
          {
            zeitraumVon: position.zeitraumVon,
            zeitraumBis: position.zeitraumBis,
            vorauszahlungGesamt: Number(position.vorauszahlungGesamt),
          },
          stichtagAb,
        )
      : 0;
    return {
      offen: saldoMitToleranz(Number(position.saldo) + gegenrechnung - (nkZahlungNachJahr.get(jahr - 1) ?? 0)),
      gegenrechnung,
    };
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
    const nkOffen = nkOffenFuerJahr(j);
    konten[j] = baueMieterkontoJahr({
      jahr: j,
      saldovortrag: vorStichtag ? 0 : saldovortrag,
      sollZeilen: vorStichtag ? sollVollAb.filter((s) => s.jahr >= erstesJahr) : sollZeilenAufsteigend,
      zahlungen: zahlungenListe,
      sonderBuchungen: sonderListe,
      ab: vorStichtag ? null : stichtagAb,
      bis,
      nebenkostenabrechnungOffen: nkOffen?.offen ?? null,
      nebenkostenGegenrechnung: nkOffen?.gegenrechnung ?? 0,
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
          {vertrag.mieter.map((m) => mieterName(m)).join(" & ")}
        </h1>
      </div>
      <EckdatenSektion
        mietvertragId={id}
        einheitLabel={vertrag.einheit.bezeichnung}
        mieterNamen={vertrag.mieter.map((m) => mieterName(m)).join(" & ")}
        beginnText={vertrag.beginn ? formatDate(vertrag.beginn) : "unbekannt"}
        endeText={vertrag.ende ? formatDate(vertrag.ende) : "–"}
        kaltmieteText={formatEuro(aktuelleMiete.kaltmiete)}
        nebenkostenText={formatEuro(aktuelleMiete.nebenkostenVorauszahlung)}
        mehrwertsteuerText={vertrag.mehrwertsteuer ? formatEuro(Number(vertrag.mehrwertsteuer)) : null}
        status={vertrag.status}
        saldovortragText={formatEuro(saldovortrag)}
        eigenerStichtagText={eigenerStichtag && stichtagAb ? formatDate(stichtagAb) : null}
        zahlungsweg={vertrag.zahlungsweg}
        kaution={
          vertrag.kaution
            ? {
                betragText: formatEuro(Number(vertrag.kaution.betrag)),
                anlageform: vertrag.kaution.anlageform,
                einzahlungUnbekannt: vertrag.kaution.einzahlungUnbekannt,
              }
            : null
        }
        letzteErhoehungText={letzteErhoehungText}
        nachlassTexte={vertrag.mietnachlaesse.map(
          (n) => `${String(n.monat).padStart(2, "0")}/${n.jahr}: ${formatEuro(-Number(n.betrag))} Kaltmiete (${n.grund})`,
        )}
      />

      <div className="my-4 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
          <p className="text-xs text-neutral-400">
            Soll ({stichtagAb ? `seit Buchhaltungs-Stichtag${eigenerStichtag ? ` ${formatDate(stichtagAb)}` : ""}` : "seit Mietbeginn"}, bis{" "}
            {formatDate(bis)})
          </p>
          <p className="mt-1 text-base font-semibold sm:text-lg text-white">{formatEuro(soll)}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
          <p className="text-xs text-neutral-400">
            Ist (erhaltene Zahlungen{stichtagAb ? " seit Stichtag" : ""}, bis{" "}
            {formatDate(bis)})
          </p>
          <p className="mt-1 text-base font-semibold sm:text-lg text-white">{formatEuro(ist)}</p>
        </div>
        <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
          <p className="text-xs text-neutral-400">
            Saldovortrag ({stichtagAb ? `zum Stichtag${eigenerStichtag ? ` ${formatDate(stichtagAb)}` : ""}` : "vor Stichtag"})
          </p>
          <p
            className={`mt-1 text-base font-semibold sm:text-lg ${saldovortrag < 0 ? "text-red-400" : saldovortrag > 0 ? "text-green-400" : "text-white"}`}
          >
            {formatEuro(saldovortrag)}
          </p>
        </div>
        <div className="min-w-0 rounded-lg border border-neutral-800 p-3 sm:p-4">
          <p className="text-xs text-neutral-400">Saldo</p>
          <p
            className={`mt-1 text-base font-semibold sm:text-lg ${saldo < 0 ? "text-red-400" : saldo > 0 ? "text-green-400" : "text-white"}`}
          >
            {formatEuro(saldo)}
          </p>
          {Math.abs(sonderOffenImSaldo) > 0.005 && (
            <p className="mt-1 text-xs text-neutral-500">inkl. Sonderforderung {formatEuro(-sonderOffenImSaldo)}</p>
          )}
        </div>
      </div>

      <MietvertragReiter
        mietvertragId={vertrag.id}
        kontoJahre={kontoJahre}
        konten={konten}
        standardKontoJahr={letztesJahr}
        stichtagAb={
          stichtagAb ? { jahr: stichtagAb.getFullYear(), datum: formatDate(stichtagAb) } : null
        }
        nkJahre={nkJahre}
        nkDaten={nkDaten}
        vorauszahlungBrief={{
          mietvertragId: vertrag.id,
          mieter: vertrag.mieter.map((m) => ({ anrede: m.anrede, vorname: m.vorname, nachname: m.nachname })),
          strasse: `${vertrag.einheit.gebaeude.strasse} ${vertrag.einheit.gebaeude.hausnummer}`,
          plzOrt: `${vertrag.einheit.gebaeude.objekt.plz} ${vertrag.einheit.gebaeude.objekt.ort}`,
          einheit: vertrag.einheit.bezeichnung,
          vertrag: vertragFuerSollIst,
          mehrwertsteuer: vertragFuerSollIst.mehrwertsteuer,
          jobcenter: vertrag.mieter.some((m) => m.buergergeldEmpfaenger),
          zahlungsweg: vertrag.zahlungsweg,
          mandat,
          kopien: vertrag.dokumente
            .filter((d) => d.art === "SCHREIBEN")
            .map((d) => ({
              id: d.id,
              dateiname: d.dateiname,
              belegDatum: d.belegDatum?.toISOString() ?? null,
              createdAt: d.createdAt.toISOString(),
            })),
        }}
        kaution={{
          konto: kautionskonto,
          anlageform: vertrag.kaution ? ANLAGEFORM_LABEL[vertrag.kaution.anlageform] ?? vertrag.kaution.anlageform : null,
          mietende: vertrag.ende,
        }}
        kopf={{
          mieter: vertrag.mieter.map((m) => mieterName(m)).join(" & "),
          einheit: vertrag.einheit.bezeichnung,
          wohnflaeche: Number(vertrag.einheit.wohnflaecheQm),
          mietbeginn: vertrag.beginn,
        }}
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
          className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900"
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

      <div className="mt-6">
        <TicketsSektion where={{ mietvertragId: id }} neuQuery={{ mietvertragId: id }} />
      </div>
    </div>
  );
}
