import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { berechneKontostandVerlauf, type KontostandEintrag } from "@/lib/kontostand";
import { KontostandTable, type KontostandRow } from "./kontostand-table";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("de-DE").format(d);
}

async function ladeEintraege(): Promise<KontostandEintrag[]> {
  const [zahlungen, kosten, mietweiterleitungen, kautionsbuchungen, sonstigeBuchungen] = await Promise.all([
    prisma.zahlung.findMany({
      select: { id: true, datum: true, betrag: true, verwendungszweck: true },
    }),
    prisma.kostenposition.findMany({
      where: { datum: { not: null } },
      select: { id: true, datum: true, betrag: true, beschreibung: true, empfaenger: true },
    }),
    prisma.eigentuemerBuchung.findMany({
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
    }),
    prisma.kautionBuchung.findMany({
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
    }),
    prisma.sonstigeBuchung.findMany({
      select: { id: true, datum: true, betrag: true, empfaenger: true, verwendungszweck: true },
    }),
  ]);

  return [
    ...zahlungen.map((z) => ({
      id: `zahlung-${z.id}`,
      datum: z.datum,
      betrag: Number(z.betrag),
      kategorie: "zahlung" as const,
      beschreibung: z.verwendungszweck || "Zahlung",
    })),
    ...kosten.map((k) => ({
      id: `kosten-${k.id}`,
      datum: k.datum!,
      // Kostenpositionen werden positiv gespeichert (Höhe der Kosten) — für den Kontostand
      // mindern sie den Saldo, das Vorzeichen muss also gedreht werden.
      betrag: -Number(k.betrag),
      kategorie: "kosten" as const,
      beschreibung: k.empfaenger || k.beschreibung || "Kosten",
    })),
    ...mietweiterleitungen.map((m) => ({
      id: `mietweiterleitung-${m.id}`,
      datum: m.datum,
      betrag: Number(m.betrag),
      kategorie: "mietweiterleitung" as const,
      beschreibung: m.empfaenger || m.verwendungszweck || "Mietweiterleitung/Einlage",
    })),
    ...kautionsbuchungen.map((k) => ({
      id: `kaution-${k.id}`,
      datum: k.datum,
      betrag: Number(k.betrag),
      kategorie: "kaution" as const,
      beschreibung: k.empfaenger || k.verwendungszweck || "Kaution",
    })),
    ...sonstigeBuchungen.map((s) => ({
      id: `sonstige-${s.id}`,
      datum: s.datum,
      betrag: Number(s.betrag),
      kategorie: "sonstige" as const,
      beschreibung: s.empfaenger || s.verwendungszweck || "Sonstige Buchung",
    })),
  ];
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

  const eintraege = await ladeEintraege();
  const verlauf = berechneKontostandVerlauf(eintraege, anker);

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
        Kautionsbuchungen, sonstige Buchungen) relativ zum Anker am {formatDate(anker.datum)} (
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

      <KontostandTable rows={rows} />
    </div>
  );
}
