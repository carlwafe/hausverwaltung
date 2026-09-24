import { prisma } from "@/lib/prisma";
import { KautionenTable, type KautionRow } from "./kautionen-table";
import {
  KautionsbuchungenTable,
  type KautionsbuchungRow,
  type KautionBuchungKategorie,
} from "./kautionsbuchungen-table";
import { NeueKautionsbuchungForm } from "./neue-kautionsbuchung-form";
import { EinbehaltSektion, type KautionEinbehaltRow } from "./einbehalt-sektion";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";

function formatEuro(value: number) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(value);
}

const ANLAGEFORM_LABEL: Record<string, string> = {
  KAUTIONSKONTO: "Kautionskonto",
  SPARBUCH: "Sparbuch",
  BUERGSCHAFT: "Bürgschaft",
  BAR: "Bar",
};

// Cent-Rundungstoleranz beim Vergleich zweier Beträge (z.B. Kaution.betrag gegen die Summe der
// Einzahlung-Mieter-Buchungen, oder "Einbehalten" gegen 0 beim Erledigt-Status).
const TOLERANZ = 0.01;

const STATUS_SORT: Record<KautionRow["status"], number> = { AKTIV: 0, AUFGELOEST: 1, ERLEDIGT: 2 };

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

async function ladeKautionen(): Promise<KautionRow[]> {
  const [kautionen, buchungen] = await Promise.all([
    prisma.kaution.findMany({
      include: { mietvertrag: { include: { einheit: true, mieter: true } } },
    }),
    prisma.buchung.findMany({
      where: { buchungsart: { kontokreis: "KAUTIONSKONTO" }, mietvertragId: { not: null }, ...AKTIVE_BUCHUNG_FILTER },
      select: { mietvertragId: true, betrag: true, buchungsart: { select: { code: true } } },
    }),
  ]);

  // Pro Mietvertrag nach Kategorie aufsummieren, statt einer eigenen Query pro Kaution — die
  // Gesamtmenge an Kautionsbuchungen ist klein genug, um sie einmal komplett zu laden. Mehrere
  // Auszahlungen (z.B. ein späterer Nachschlag auf einen zunächst nur teilweise ausgezahlten
  // Betrag) summieren sich hier automatisch.
  const summenProMietvertrag = new Map<
    string,
    { einzahlung: number; anlage: number; aufgeloest: number; ausgezahlt: number }
  >();
  for (const b of buchungen) {
    const key = b.mietvertragId!;
    const eintrag = summenProMietvertrag.get(key) ?? { einzahlung: 0, anlage: 0, aufgeloest: 0, ausgezahlt: 0 };
    const betrag = Number(b.betrag);
    const code = b.buchungsart.code;
    if (code === "KAUTION_EINZAHLUNG") eintrag.einzahlung += betrag;
    // Interne Überweisung Geschäfts- -> Kautionskonto — setzt eigentlich eine bereits erfolgte
    // Einzahlung des Mieters voraus. Wird unten als Fallback-Betrag für einen fehlenden
    // Kaution-Stammdatensatz genutzt und liefert außerdem das Signal für die "keine Einzahlung
    // gefunden"-Warnung (siehe warnungFuer).
    else if (code === "KAUTION_ANLAGE") eintrag.anlage += Math.abs(betrag);
    // Auflösung/Auszahlung kommen aus dem Kontoauszug mit ihrem tatsächlichen Vorzeichen
    // (Auflösung eingehend = positiv, Auszahlung ausgehend = negativ) — hier auf positive
    // Beträge normalisiert, damit "Einbehalten" als einfache Differenz berechnet werden kann.
    else if (code === "KAUTION_AUFLOESUNG") eintrag.aufgeloest += betrag;
    // VIRTUELLE_AUSZAHLUNG zählt genauso wie eine echte Auszahlung Mieter — der Betrag ist der
    // Kaution trotzdem endgültig entzogen, nur ohne eigene Kontobewegung (siehe Gegenbuchung auf
    // der Kosten-Seite, jetzt Buchung.bezugId).
    else if (code === "KAUTION_AUSZAHLUNG" || code === "KAUTION_VIRTUELLE_AUSZAHLUNG")
      eintrag.ausgezahlt += Math.abs(betrag);
    summenProMietvertrag.set(key, eintrag);
  }

  // Warnt, wenn für einen Mietvertrag zwar eine Kautionsbewegung (Anlage/Auflösung/Auszahlung)
  // vorliegt, aber nie eine "Einzahlung Mieter"-Buchung erfasst wurde — typischerweise, weil die
  // tatsächliche Einzahlung fälschlich als normale Zahlung statt als Kautionsbuchung importiert
  // wurde. Ohne diese Warnung fällt so ein Fall sonst nur auf, wenn man gezielt danach sucht.
  function warnungFuer(summen: { einzahlung: number; anlage: number; aufgeloest: number; ausgezahlt: number } | undefined): string | null {
    if (!summen || summen.einzahlung > 0) return null;
    if (summen.anlage === 0 && summen.aufgeloest === 0 && summen.ausgezahlt === 0) return null;
    return "Keine Einzahlung des Mieters in den Kautionsbuchungen gefunden — vermutlich wurde die tatsächliche Einzahlung fälschlich als normale Zahlung importiert.";
  }

  const kautionZeilen = kautionen.map((k) => {
    const summen = summenProMietvertrag.get(k.mietvertragId);
    const betrag = Number(k.betrag);
    const einzahlungSumme = summen && summen.einzahlung > 0 ? summen.einzahlung : null;
    const aufgeloest = summen?.aufgeloest ?? 0;
    const ausgezahlt = summen?.ausgezahlt ?? 0;
    // Nur aussagekräftig, sobald überhaupt eine Auflösung stattgefunden hat — vorher ist noch
    // nichts vom Kautionskonto abgeflossen, das der Auszahlung gegenübergestellt werden könnte.
    const einbehalten = aufgeloest > 0 ? Math.round((aufgeloest - ausgezahlt) * 100) / 100 : null;
    const status: KautionRow["status"] =
      aufgeloest === 0 ? "AKTIV" : einbehalten !== null && einbehalten <= TOLERANZ ? "ERLEDIGT" : "AUFGELOEST";

    return {
      id: k.id,
      mietvertragId: k.mietvertragId,
      einheitBezeichnung: k.mietvertrag.einheit.bezeichnung,
      mieterNamen: k.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
      betrag,
      betragAbweichung: einzahlungSumme !== null && Math.abs(einzahlungSumme - betrag) > TOLERANZ,
      einzahlungSumme,
      anlageform: k.anlageform as string | null,
      zinssatz: k.zinssatz ? Number(k.zinssatz) : null,
      aufgeloest,
      ausgezahlt,
      einbehalten,
      status,
      warnung: warnungFuer(summen),
    };
  });

  // Mietverträge mit Kautionsbuchungen, aber ganz ohne eigenen Kaution-Stammdatensatz (z.B. weil
  // "+ Kaution erfassen" nie ausgeführt wurde) — würden sonst in dieser Tabelle komplett fehlen,
  // obwohl echte Kautionsbuchungen (z.B. eine Anlage) für sie existieren.
  const bekannteMietvertragIds = new Set(kautionen.map((k) => k.mietvertragId));
  const verwaisteMietvertragIds = [...summenProMietvertrag.keys()].filter((id) => !bekannteMietvertragIds.has(id));
  const verwaisteVertraege = verwaisteMietvertragIds.length
    ? await prisma.mietvertrag.findMany({
        where: { id: { in: verwaisteMietvertragIds } },
        include: { einheit: true, mieter: true },
      })
    : [];

  const virtuelleZeilen = verwaisteVertraege.map((v) => {
    const summen = summenProMietvertrag.get(v.id)!;
    const aufgeloest = summen.aufgeloest;
    const ausgezahlt = summen.ausgezahlt;
    const einbehalten = aufgeloest > 0 ? Math.round((aufgeloest - ausgezahlt) * 100) / 100 : null;
    const status: KautionRow["status"] =
      aufgeloest === 0 ? "AKTIV" : einbehalten !== null && einbehalten <= TOLERANZ ? "ERLEDIGT" : "AUFGELOEST";

    return {
      id: `verwaist-${v.id}`,
      mietvertragId: v.id,
      einheitBezeichnung: v.einheit.bezeichnung,
      mieterNamen: v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
      // Kein Kaution-Stammdatensatz vorhanden — die Anlage-Buchung (interne Überweisung
      // Geschäfts- -> Kautionskonto) ist der verlässlichste Hinweis auf den eigentlich gemeinten
      // Betrag, sonst 0.
      betrag: summen.anlage,
      betragAbweichung: false,
      einzahlungSumme: summen.einzahlung > 0 ? summen.einzahlung : null,
      anlageform: null,
      zinssatz: null,
      aufgeloest,
      ausgezahlt,
      einbehalten,
      status,
      warnung:
        warnungFuer(summen) ??
        "Kein Kaution-Stammdatensatz angelegt — aber Kautionsbuchungen für diesen Mietvertrag vorhanden.",
    };
  });

  return [...kautionZeilen, ...virtuelleZeilen].sort(
    (a, b) =>
      STATUS_SORT[a.status] - STATUS_SORT[b.status] ||
      vergleicheEinheitBezeichnung(a.einheitBezeichnung, b.einheitBezeichnung),
  );
}

async function ladeKautionsbuchungen(): Promise<KautionsbuchungRow[]> {
  const buchungen = await prisma.buchung.findMany({
    // KAUTION_EINBEHALT bewusst ausgeschlossen — diese Buchungen werden ausschließlich über die
    // Einbehalt-Sektion (KautionEinbehalt.buchungId) verwaltet; würde man sie hier zusätzlich zum
    // Bearbeiten/Löschen anbieten, liefe das an synchronisiereKautionEinbehaltBuchung vorbei und
    // hinterließe eine verwaiste buchungId auf der KautionEinbehalt-Zeile.
    where: { buchungsart: { kontokreis: "KAUTIONSKONTO", code: { not: "KAUTION_EINBEHALT" } }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: { datum: "desc" },
    include: {
      mietvertrag: { include: { einheit: true, mieter: true } },
      importBatch: true,
      buchungsart: { select: { code: true } },
    },
  });

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
    mieterNamen: k.mietvertrag?.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ") ?? null,
    datum: k.datum!.toISOString(),
    betrag: Number(k.betrag),
    empfaenger: k.empfaenger,
    verwendungszweck: k.verwendungszweck,
    rohdaten: (k.rohdaten as Record<string, string> | null) ?? null,
    importBatchId: k.importBatchId,
    importDateiname: k.importBatch?.dateiname ?? null,
    kategorie: CODE_ZU_KATEGORIE[k.buchungsart.code]!,
    verknuepfteKostenpositionen: (gutschriftenNachBuchung.get(k.id) ?? []).map((kp) => ({
      id: kp.id,
      label: `${kp.kostenart?.name ?? "?"} (${formatEuro(Number(kp.betrag))})`,
    })),
  }));
}

// Kandidaten für die Verknüpfung einer neuen virtuellen Auszahlung mit ihrer Gegenbuchung — nur
// Gutschriften (negativer Betrag) kommen als Gegenbuchung infrage.
async function ladeVirtuelleGutschriften(): Promise<{ id: string; label: string; datumISO: string | null }[]> {
  const positionen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "KOSTENPOSITION" }, betrag: { lt: 0 }, ...AKTIVE_BUCHUNG_FILTER },
    orderBy: { erstelltAm: "desc" },
    include: { kostenart: true },
  });
  return positionen.map((k) => ({
    id: k.id,
    label: `${k.datum ? new Intl.DateTimeFormat("de-DE").format(k.datum) : k.jahr} — ${k.kostenart?.name ?? "?"} — ${formatEuro(Number(k.betrag))}${k.bezugTyp === "Buchung" ? " (bereits verknüpft)" : ""}`,
    datumISO: k.datum ? k.datum.toISOString().slice(0, 10) : null,
  }));
}

async function ladeKautionEinbehalte(): Promise<KautionEinbehaltRow[]> {
  const einbehalte = await prisma.kautionEinbehalt.findMany({
    orderBy: { erstelltAm: "desc" },
    include: { kaution: { include: { mietvertrag: { include: { einheit: true, mieter: true } } } } },
  });
  return einbehalte.map((e) => ({
    id: e.id,
    mietvertragId: e.kaution.mietvertragId,
    einheitBezeichnung: e.kaution.mietvertrag.einheit.bezeichnung,
    mieterNamen: e.kaution.mietvertrag.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & "),
    positionText: e.positionText,
    betrag: Number(e.betrag),
    status: e.status,
    erstelltAm: (e.datum ?? e.erstelltAm).toISOString(),
    nkJahr: e.bezugTyp === "Nebenkostenabrechnung" && e.bezugId ? Number(e.bezugId) : null,
    gebucht: e.buchungId !== null,
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
      label: `${v.einheit.bezeichnung} — ${v.mieter.map((m) => `${m.vorname} ${m.nachname}`).join(" & ")}`,
    }));
}

export default async function KautionenPage() {
  const [kautionen, kautionsbuchungen, mietvertraege, virtuelleGutschriften, kautionEinbehalte] = await Promise.all([
    ladeKautionen(),
    ladeKautionsbuchungen(),
    ladeMietvertraege(),
    ladeVirtuelleGutschriften(),
    ladeKautionEinbehalte(),
  ]);
  const offen = kautionen.filter((k) => k.status !== "ERLEDIGT");
  const aufgeloest = kautionen.filter((k) => k.status === "AUFGELOEST");
  // Für die Verbindlichkeiten-Summe zählt bei einer bereits aufgelösten Kaution nur noch der
  // tatsächlich einbehaltene Rest, nicht mehr der ursprüngliche Gesamtbetrag.
  const summeOffen = offen.reduce((s, k) => s + (k.einbehalten ?? k.betrag), 0);

  // Zeilen ohne eigenen Kaution-Stammdatensatz (anlageform === null, siehe warnungFuer) haben
  // keine echte Anlageform und fließen hier bewusst nicht mit ein — sie stehen ohnehin schon per
  // Warnsymbol sichtbar in der Tabelle.
  const summeJeAnlageform = offen.reduce<Record<string, number>>((acc, k) => {
    if (!k.anlageform) return acc;
    acc[k.anlageform] = (acc[k.anlageform] ?? 0) + (k.einbehalten ?? k.betrag);
    return acc;
  }, {});

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Kautionen</h1>
        <p className="text-sm text-neutral-400">
          {offen.length} offene Kaution{offen.length === 1 ? "" : "en"}
          {aufgeloest.length > 0 && ` (davon ${aufgeloest.length} aufgelöst, noch nicht vollständig ausgezahlt)`}
          {kautionen.length !== offen.length && `, ${kautionen.length - offen.length} erledigt`}.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-800 p-4">
          <p className="text-xs text-neutral-400">Kautionsverbindlichkeiten gesamt (offen)</p>
          <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summeOffen)}</p>
        </div>
        {Object.entries(summeJeAnlageform).map(([anlageform, summe]) => (
          <div key={anlageform} className="rounded-lg border border-neutral-800 p-4">
            <p className="text-xs text-neutral-400">davon {ANLAGEFORM_LABEL[anlageform]}</p>
            <p className="mt-1 text-xl font-semibold text-white">{formatEuro(summe)}</p>
          </div>
        ))}
      </div>

      <KautionenTable rows={kautionen} />

      <div className="mt-10">
        <h2 className="mb-4 text-lg font-medium text-white">
          Kautionsbuchungen ({kautionsbuchungen.length})
        </h2>
        <NeueKautionsbuchungForm mietvertraege={mietvertraege} virtuelleGutschriften={virtuelleGutschriften} />
        <KautionsbuchungenTable rows={kautionsbuchungen} />
      </div>

      <EinbehaltSektion rows={kautionEinbehalte} />
    </div>
  );
}
