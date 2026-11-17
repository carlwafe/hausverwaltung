import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { KautionenAnsicht, type KautionenReiter } from "./kautionen-ansicht";
import { ANLAGEFORM_LABEL } from "@/lib/kaution-schritt";
import type { KautionsbuchungRow, KautionBuchungKategorie } from "./kautionsbuchungen-table";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { ladeKautionsuebersicht } from "@/lib/kautionen-uebersicht";
import { idsMitRohdaten } from "@/lib/rohdaten-vorhanden";
import { mieterName } from "@/lib/mieter-name";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

// Kehrt KATEGORIE_ZU_CODE aus actions.ts um — kann von dort nicht importiert werden ("use server"-
// Dateien dürfen nur async-Funktionen exportieren), deshalb hier dupliziert.
const CODE_ZU_KATEGORIE: Record<string, KautionBuchungKategorie> = {
  KAUTION_EINZAHLUNG: "EINZAHLUNG_MIETER",
  KAUTION_ANLAGE: "ANLAGE",
  KAUTION_AUFLOESUNG: "AUFLOESUNG",
  KAUTION_AUSZAHLUNG: "AUSZAHLUNG_MIETER",
  KAUTION_SONSTIGES: "SONSTIGES",
  KAUTION_VIRTUELLE_AUSZAHLUNG: "VIRTUELLE_AUSZAHLUNG",
};

const REITER: KautionenReiter[] = ["zu-tun", "hinterlegt", "erledigt", "buchungen"];

async function ladeKautionsbuchungen(): Promise<KautionsbuchungRow[]> {
  const where: Prisma.BuchungWhereInput = {
    buchungsart: { kontokreis: "KAUTIONSKONTO", code: { not: "KAUTION_EINBEHALT" } },
    ...AKTIVE_BUCHUNG_FILTER,
  };
  const [buchungen, mitRohdaten] = await Promise.all([
    prisma.buchung.findMany({
    // KAUTION_EINBEHALT bewusst ausgeschlossen — diese Buchungen werden ausschließlich über die
    // Einbehalt-Zeilen (ladeKautionEinbehalte, KautionEinbehalt.buchungId) verwaltet; würde man sie hier zusätzlich zum
    // Bearbeiten/Löschen anbieten, liefe das an synchronisiereKautionEinbehaltBuchung vorbei und
    // hinterließe eine verwaiste buchungId auf der KautionEinbehalt-Zeile.
    where,
    orderBy: { datum: "desc" },
    // Die Bankzeile lädt erst das Aufklappen (RohdatenNachladenZeile), siehe docs/deployment-vercel.md.
    omit: { rohdaten: true },
    include: {
      mietvertrag: { include: { einheit: true, mieter: true } },
      importBatch: { select: { dateiname: true } },
      buchungsart: { select: { code: true } },
    },
    }),
    idsMitRohdaten(where),
  ]);

  // Verknüpfte virtuelle Gutschriften (früher Kostenposition.virtuelleKautionBuchungId, jetzt
  // bezugTyp/bezugId — kein echter FK mehr, deshalb hier per Hand nachgeschlagen statt per
  // include) — nur für Kaution-Buchungen relevant, die als Gegenbuchung referenziert werden.
  const gutschriften = await prisma.buchung.findMany({
    where: { bezugTyp: "Buchung", bezugId: { in: buchungen.map((b) => b.id) }, ...AKTIVE_BUCHUNG_FILTER },
    include: { kostenart: true },
  });
  const gutschriftenNachBuchung = new Map<string, typeof gutschriften>();
  for (const g of gutschriften) {
    const liste = gutschriftenNachBuchung.get(g.bezugId!) ?? [];
    liste.push(g);
    gutschriftenNachBuchung.set(g.bezugId!, liste);
  }

  return buchungen.map((k) => ({
    id: k.id,
    mietvertragId: k.mietvertragId,
    einheitBezeichnung: k.mietvertrag?.einheit.bezeichnung ?? null,
    mieterNamen: k.mietvertrag?.mieter.map((m) => mieterName(m)).join(" & ") ?? null,
    datum: k.datum!.toISOString(),
    betrag: Number(k.betrag),
    empfaenger: k.empfaenger,
    verwendungszweck: k.verwendungszweck,
    hatRohdaten: mitRohdaten.has(k.id),
    importBatchId: k.importBatchId,
    importDateiname: k.importBatch?.dateiname ?? null,
    kategorie: CODE_ZU_KATEGORIE[k.buchungsart.code]!,
    aufteilungGruppeId: k.aufteilungGruppeId,
    verknuepfteKostenpositionen: (gutschriftenNachBuchung.get(k.id) ?? []).map((kp) => ({
      id: kp.id,
      label: `${kp.kostenart?.name ?? "?"} (${formatEuro(Number(kp.betrag))})`,
    })),
    einbehalt: null,
  }));
}

// Kandidaten für die Verknüpfung einer neuen virtuellen Auszahlung: entweder bereits vorhandene
// Gutschriften (negativer Betrag, die Gegenbuchung existiert schon) oder die bezahlte Rechnung
// selbst (positiver Betrag, z.B. die Reparatur, die mit der Kaution verrechnet wurde) — dann legt
// das Speichern die Gegenbuchung automatisch an.
async function ladeVirtuelleGutschriften(): Promise<{ id: string; label: string; datumISO: string | null }[]> {
  const positionen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: [{ datum: "desc" }, { erstelltAm: "desc" }],
    include: { kostenart: true },
  });
  return positionen.map((k) => {
    const betrag = Number(k.betrag);
    return {
      id: k.id,
      label: `${k.datum ? new Intl.DateTimeFormat("de-DE").format(k.datum) : k.jahr} — ${k.kostenart?.name ?? "?"} — ${formatEuro(betrag)} ${betrag < 0 ? "(Gutschrift)" : "(Rechnung)"}${k.empfaenger ? ` — ${k.empfaenger}` : ""}${k.bezugTyp === "Buchung" ? " (bereits verknüpft)" : ""}`,
      datumISO: k.datum ? k.datum.toISOString().slice(0, 10) : null,
    };
  });
}

// Einbehalte erscheinen als Zeilen in der Kautionsbuchungen-Tabelle (Betrag mit Buchungsvorzeichen,
// also negativ) — auch strittige ohne Journalbuchung, damit sie dort verwaltet werden können.
async function ladeKautionEinbehalte(): Promise<KautionsbuchungRow[]> {
  const einbehalte = await prisma.kautionEinbehalt.findMany({
    orderBy: { erstelltAm: "desc" },
    include: { kaution: { include: { mietvertrag: { include: { einheit: true, mieter: true } } } } },
  });
  return einbehalte.map((e) => ({
    id: e.id,
    mietvertragId: e.kaution.mietvertragId,
    einheitBezeichnung: e.kaution.mietvertrag.einheit.bezeichnung,
    mieterNamen: e.kaution.mietvertrag.mieter.map((m) => mieterName(m)).join(" & "),
    datum: (e.datum ?? e.erstelltAm).toISOString(),
    betrag: -Number(e.betrag),
    empfaenger: null,
    verwendungszweck: e.positionText,
    hatRohdaten: false,
    importBatchId: null,
    importDateiname: null,
    kategorie: "EINBEHALT" as const,
    aufteilungGruppeId: null,
    verknuepfteKostenpositionen: [],
    einbehalt: {
      status: e.status,
      nkJahr: e.bezugTyp === "Nebenkostenabrechnung" && e.bezugId ? Number(e.bezugId) : null,
      mieterkonto: e.bezugTyp === "Mieterkonto",
      gebucht: e.buchungId !== null,
      pauschal: e.pauschal,
    },
  }));
}

async function ladeMietvertraege(): Promise<{ id: string; label: string }[]> {
  const vertraege = await prisma.mietvertrag.findMany({
    where: { status: { in: ["AKTIV", "BEENDET"] } },
    include: { einheit: true, mieter: true },
  });
  return vertraege
    .sort((a, b) => vergleicheEinheitBezeichnung(a.einheit.bezeichnung, b.einheit.bezeichnung))
    .map((v) => ({
      id: v.id,
      label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => mieterName(m)).join(" & ")}`,
    }));
}

export default async function KautionenPage({ searchParams }: { searchParams: Promise<{ ansicht?: string }> }) {
  const { ansicht } = await searchParams;
  const startReiter = REITER.find((r) => r === ansicht) ?? "zu-tun";
  const [kautionen, kautionsbuchungen, mietvertraege, virtuelleGutschriften, kautionEinbehalte] = await Promise.all([
    ladeKautionsuebersicht(),
    ladeKautionsbuchungen(),
    ladeMietvertraege(),
    ladeVirtuelleGutschriften(),
    ladeKautionEinbehalte(),
  ]);
  const alleBuchungen = [...kautionsbuchungen, ...kautionEinbehalte].sort((a, b) => b.datum.localeCompare(a.datum));

  // Verbindlichkeit = Kautionsguthaben der Mieter (Einzahlung + Zinsen − Einbehalte − Auszahlungen). Eine
  // Überzahlung ist eine Forderung an den Mieter, keine negative Verbindlichkeit.
  const mitGuthaben = kautionen.filter((k) => k.stand > 0.005);
  const summe = mitGuthaben.reduce((s, k) => s + k.stand, 0);
  // Zeilen ohne Kaution-Stammdatensatz haben keine Anlageform und fehlen hier — sie stehen mit ⚠ unter „Zu tun“.
  const summeJeAnlageform = mitGuthaben.reduce<Record<string, number>>((acc, k) => {
    if (!k.anlageform) return acc;
    acc[k.anlageform] = (acc[k.anlageform] ?? 0) + k.stand;
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Kautionen</h1>
        <details className="mt-1 max-w-3xl text-xs text-neutral-500">
          <summary className="cursor-pointer text-neutral-400 hover:text-white">So wird gebucht</summary>
          <p className="mt-1">
            Eine Zeile anklicken zeigt die Bewegungen der Kaution; über › öffnet sich die einzelne Buchung (Kategorie
            ändern, aufteilen, stornieren). Einbehalte werden direkt in der aufgeklappten Zeile umgestellt.
          </p>
          <p className="mt-1">
            Trägt der Mieter eine Rechnung über die Kaution: &bdquo;Verrechnung mit Rechnung&ldquo; mit Verknüpfung zur
            Kostenposition buchen (die Gegenbuchung &bdquo;Verrechnet mit Kaution&ldquo; entsteht automatisch, Kosten netto 0).
            Ohne Rechnung (z.B. Schlüssel) einen pauschalen Einbehalt buchen &mdash; er zählt als Einnahme.
          </p>
        </details>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kautionsguthaben der Mieter</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summe)}</p>
        </div>
        {Object.entries(summeJeAnlageform).map(([anlageform, betrag]) => (
          <div key={anlageform} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">davon {ANLAGEFORM_LABEL[anlageform] ?? anlageform}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatEuro(betrag)}</p>
          </div>
        ))}
      </div>

      <KautionenAnsicht
        startReiter={startReiter}
        kautionen={kautionen}
        buchungen={alleBuchungen}
        mietvertraege={mietvertraege}
        virtuelleGutschriften={virtuelleGutschriften}
      />
    </div>
  );
}
