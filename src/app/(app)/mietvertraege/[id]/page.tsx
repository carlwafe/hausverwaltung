import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MietvertragForm } from "../mietvertrag-form";
import { toDateInputValue } from "@/lib/date-utils";
import { updateMietvertrag, deleteMietvertrag, erfasseMieterhoehung, loescheMieterhoehung, erfasseSonderforderung, storniereSonderforderungBuchung } from "../actions";
import { uploadDokument } from "../../dokumente/actions";
import { DeleteButton } from "@/components/delete-button";
import { BelegeSektion } from "@/components/belege-sektion";
import { sortEinheitenNachGebaeude } from "@/lib/sort-einheiten";
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
  const [vertrag, einheitenRaw, mieter, objekt] = await Promise.all([
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
    prisma.einheit.findMany({ include: { gebaeude: true } }),
    prisma.mieter.findMany({ orderBy: { nachname: "asc" } }),
    prisma.objekt.findFirst({ select: { buchhaltungAb: true, buchhaltungBis: true } }),
  ]);

  if (!vertrag) notFound();

  const sonderBuchungen = await prisma.buchung.findMany({
    where: { mietvertragId: id, buchungsart: { code: { in: ["MAHNGEBUEHR", "SONDERZAHLUNG"] } }, ...AKTIVE_BUCHUNG_FILTER },
    select: { id: true, datum: true, betrag: true, verwendungszweck: true, buchungsart: { select: { code: true } } },
    orderBy: { datum: "desc" },
  });
  const sonderOffen = sonderBuchungen.reduce(
    (sum, b) => sum + (b.buchungsart.code === "MAHNGEBUEHR" ? Number(b.betrag) : -Number(b.betrag)),
    0,
  );
  const einheiten = sortEinheitenNachGebaeude(einheitenRaw);

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
  const mieterNamenKonto = vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ");

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">
            {vertrag.einheit.bezeichnung} —{" "}
            {vertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}
          </h1>
          {mieterhoehungen.length > 0 && (
            <p className="mt-1 text-sm text-neutral-400">
              Aktuell gültig: {formatEuro(aktuelleMiete.kaltmiete)} Kaltmiete +{" "}
              {formatEuro(aktuelleMiete.nebenkostenVorauszahlung)} NK
            </p>
          )}
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
        mieterNamen={mieterNamenKonto}
        einheit={vertrag.einheit.bezeichnung}
        jahre={kontoJahre}
        konten={konten}
        standardJahr={letztesJahr}
        stichtagAb={
          stichtagAb ? { jahr: stichtagAb.getFullYear(), datum: formatDate(stichtagAb) } : null
        }
      />

      <div className="mt-6 grid grid-cols-2 gap-6">
        <div>
          <h2 className="mb-4 text-lg font-medium text-white">
            Mieterhöhungen ({mieterhoehungen.length})
          </h2>
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

      <div className="mt-6">
        <h2 className="mb-1 text-lg font-medium text-white">Sonderforderungen (Gebühren)</h2>
        <p className="mb-3 text-xs text-neutral-500">
          Z.B. Rücklastschrift- oder Mahngebühren — im Mietsaldo enthalten. Offen:{" "}
          <span className={sonderOffen > 0.005 ? "text-amber-400" : "text-green-400"}>
            {formatEuro(Math.round(sonderOffen * 100) / 100)}
          </span>
        </p>
        <div className="overflow-auto rounded-lg border border-neutral-800">
          <table className="w-full text-sm">
            <thead className="border-b border-neutral-800 bg-neutral-950 text-left text-xs uppercase text-neutral-400">
              <tr>
                <th className="px-4 py-2">Datum</th>
                <th className="px-4 py-2">Art</th>
                <th className="px-4 py-2">Betrag</th>
                <th className="px-4 py-2">Bezeichnung</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {sonderBuchungen.map((b) => (
                <tr key={b.id} className="border-t border-neutral-800">
                  <td className="px-4 py-2 text-white">{b.datum ? formatDate(b.datum) : "–"}</td>
                  <td className="px-4 py-2 text-white">
                    {b.buchungsart.code === "MAHNGEBUEHR" ? "Forderung" : "Zahlung"}
                  </td>
                  <td className="px-4 py-2 text-white">{formatEuro(Number(b.betrag))}</td>
                  <td className="max-w-[260px] truncate px-4 py-2 text-white" title={b.verwendungszweck ?? ""}>
                    {b.verwendungszweck || "–"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <DeleteButton
                      action={storniereSonderforderungBuchung.bind(null, vertrag.id, b.id)}
                      confirmText="Buchung wirklich stornieren?"
                      label="Stornieren"
                    />
                  </td>
                </tr>
              ))}
              {sonderBuchungen.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                    Keine Sonderforderungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <form
          action={erfasseSonderforderung.bind(null, vertrag.id)}
          className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-800 p-4"
        >
          <div>
            <label className="block text-xs text-neutral-400">Datum</label>
            <input type="date" name="datum" required className="mt-1 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="block text-xs text-neutral-400">Betrag</label>
            <input type="number" step="0.01" min="0.01" name="betrag" required className="mt-1 w-28 rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" />
          </div>
          <div className="flex-1">
            <label className="block text-xs text-neutral-400">Bezeichnung</label>
            <input type="text" name="verwendungszweck" required placeholder="z.B. Rücklastschriftgebühr 09/2026" className="mt-1 w-full rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-white" />
          </div>
          <button type="submit" className="rounded-md border border-neutral-700 px-3 py-2 text-sm font-medium text-white hover:bg-neutral-900">
            + Gebühr berechnen
          </button>
        </form>
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
