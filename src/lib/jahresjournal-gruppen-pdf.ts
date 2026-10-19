// PDF „Jahresbericht nach Gruppen“: dieselben Buchungen wie das Monatsjournal, aber sachlich geordnet
// (Mieten/Nebenkosten, Kosten umlagefähig, Kosten nicht umlagefähig, durchlaufende Posten) — je Gruppe
// nach Kostenart, darunter nach Haus/Gebäude. Die laufende Nummer entspricht der Nummer im Monatsjournal
// (Querverweis); die Summe aller Gruppen ergibt genau die Kontobewegung des Jahres.
import { PDFDocument, StandardFonts } from "pdf-lib";
import { NICHT_ZUGEORDNET, type Jahresjournal, type JournalZeile } from "@/lib/jahresjournal";
import { vergleicheEinheitBezeichnung } from "@/lib/einheit-sort";
import { Bericht, euro, datumKurz, RAND, GRAU, HELLGRAU, ROT, GRUEN, istZwischenstand, type Spalte, type Zeile } from "@/lib/jahresjournal-pdf";

type GruppeId = "EINNAHMEN" | "KOSTEN_UMLAGE" | "KOSTEN_NICHT" | "DURCHLAUFEND" | "OFFEN";

const GRUPPEN: { id: GruppeId; titel: string; hinweis: string }[] = [
  { id: "EINNAHMEN", titel: "Mieten und Nebenkosten (Einnahmen)", hinweis: "Mietzahlungen, Zahlungen auf Gebühren und Nebenkosten-Ausgleich (Nachzahlungen positiv, Erstattungen negativ), je Haus." },
  { id: "KOSTEN_UMLAGE", titel: "Kosten, umlagefähig", hinweis: "Kostenpositionen mit umlagefähiger Kostenart; Ausgaben negativ, Gutschriften positiv, je Kostenart und Haus/Gebäude." },
  { id: "KOSTEN_NICHT", titel: "Kosten, nicht umlagefähig", hinweis: "Kostenpositionen mit nicht umlagefähiger Kostenart (Instandhaltung, Verwaltung, Versicherungen u. a.); Ausgaben negativ, Gutschriften positiv." },
  { id: "DURCHLAUFEND", titel: "Durchlaufende Posten", hinweis: "Mietweiterleitung an die Eigentümerin, Darlehenstilgung und Kautionen – bewegen den Kontostand, sind aber keine Einnahme oder Ausgabe im steuerlichen Sinn." },
  { id: "OFFEN", titel: "Nicht zugeordnete Buchungen", hinweis: "Beim Import als „nicht kategorisiert“ geparkt – bewegen den Kontostand, sind aber noch keiner Buchungsart zugeordnet." },
];

const EINNAHMEN_ARTEN = new Set(["MIETZAHLUNG", "SONDERZAHLUNG", "NEBENKOSTENAUSGLEICH"]);

function gruppeVon(z: JournalZeile): GruppeId {
  if (z.artCode === NICHT_ZUGEORDNET) return "OFFEN";
  if (z.artCode === "KOSTENPOSITION") return z.umlagefaehig ? "KOSTEN_UMLAGE" : "KOSTEN_NICHT";
  if (EINNAHMEN_ARTEN.has(z.artCode)) return "EINNAHMEN";
  return "DURCHLAUFEND";
}

// Zweite Ebene: bei Kosten die Kostenart, sonst die Buchungsart.
function untergruppeVon(z: JournalZeile): string {
  if (z.artCode === "KOSTENPOSITION") return z.kostenart ?? "(ohne Kostenart)";
  return z.art;
}

// Bei Mietvertrags-Buchungen steht die Einheit vorn in der Zuordnung („HS 4 WHG 2 - EG rechts · Name · …“).
const einheitVon = (z: JournalZeile) => z.zuordnung.split(" · ")[0] ?? "";

const cent = (n: number) => Math.round(n * 100);
const summe = (zeilen: JournalZeile[]) => zeilen.reduce((s, z) => s + cent(z.betrag), 0) / 100;

type Unter = { name: string; zeilen: JournalZeile[]; orte: { ort: string; rang: number; zeilen: JournalZeile[] }[] };
type Haupt = { id: GruppeId; titel: string; hinweis: string; zeilen: JournalZeile[]; unter: Unter[] };

function gruppiere(d: Jahresjournal): Haupt[] {
  return GRUPPEN.map((g) => {
    const zeilen = d.zeilen.filter((z) => gruppeVon(z) === g.id);
    const nachName = new Map<string, JournalZeile[]>();
    for (const z of zeilen) {
      const n = untergruppeVon(z);
      nachName.set(n, [...(nachName.get(n) ?? []), z]);
    }
    const unter: Unter[] = [...nachName.entries()]
      .sort(([a], [b]) => a.localeCompare(b, "de"))
      .map(([name, zs]) => {
        const nachOrt = new Map<string, { ort: string; rang: number; zeilen: JournalZeile[] }>();
        for (const z of zs) {
          const e = nachOrt.get(z.ort) ?? { ort: z.ort, rang: z.ortRang, zeilen: [] };
          e.zeilen.push(z);
          nachOrt.set(z.ort, e);
        }
        const orte = [...nachOrt.values()].sort((a, b) => a.rang - b.rang || a.ort.localeCompare(b.ort, "de"));
        // Innerhalb eines Ortes chronologisch (Nummer = Reihenfolge im Monatsjournal); Einnahmen je
        // Wohnung, damit sich die Summe je Mieter mit den Berichten des Vorverwalters vergleichen lässt.
        orte.forEach((o) =>
          o.zeilen.sort((a, b) =>
            g.id === "EINNAHMEN" ? vergleicheEinheitBezeichnung(einheitVon(a), einheitVon(b)) || a.nr - b.nr : a.nr - b.nr,
          ),
        );
        return { name, zeilen: zs, orte };
      });
    return { ...g, zeilen, unter };
  }).filter((h) => h.zeilen.length > 0);
}

export async function erzeugeGruppenPdf(d: Jahresjournal): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const normal = await doc.embedFont(StandardFonts.Helvetica);
  const fett = await doc.embedFont(StandardFonts.HelveticaBold);
  const jahr = d.jahr;
  const zwischenstand = istZwischenstand(jahr);
  const b = new Bericht(
    doc,
    normal,
    fett,
    d.objekt ? `${d.objekt.name} · ${d.objekt.adresse}` : "",
    `Jahresbericht nach Gruppen ${jahr}${zwischenstand ? " (Zwischenstand)" : ""}`,
  );
  const haupt = gruppiere(d);
  const bis = `31.12.${jahr}`;
  const saldoJahr = d.einnahmen + d.ausgaben;

  // ───────────── Übersicht ─────────────
  b.text(`Jahresbericht nach Gruppen ${jahr}`, RAND, b.y - 16, { groesse: 18, fett: true });
  b.y -= 24;
  b.absatz(
    `Alle Kontobewegungen des Mietkontos vom 01.01.${jahr} bis ${bis}, sachlich geordnet: Einnahmen, umlagefähige und nicht umlagefähige Kosten, durchlaufende Posten – ` +
      "jeweils nach Kostenart und Haus. Jede Buchung steht mit der laufenden Nummer des Monatsjournals (Bericht „nach Monaten“) in genau einer Gruppe.",
    { groesse: 9, farbe: GRAU },
  );
  b.abstand(8);

  b.titel("1  Kontostand-Fortschreibung");
  b.tabelle(
    [{ titel: "Position", w: 400 }, { titel: "Betrag in EUR", w: 110, rechts: true }],
    [
      { cells: [`Kontostand am 01.01.${jahr} (Anfangsbestand)`, euro(d.anfangsbestand)], fett: true },
      ...haupt.map((h) => ({ cells: [`${h.id === "EINNAHMEN" || summe(h.zeilen) >= 0 ? "+" : "-"} ${h.titel}`, euro(summe(h.zeilen))] })),
      {
        cells: [zwischenstand ? "Kontostand nach der letzten Buchung (Jahr noch nicht abgeschlossen)" : `Kontostand am ${bis} (Endbestand)`, euro(d.endbestand)],
        fett: true,
        fill: HELLGRAU,
        linieOben: true,
      },
    ],
    { groesse: 8.5 },
  );
  b.abstand(4);
  const summeGruppen = Math.round(haupt.reduce((s, h) => s + cent(summe(h.zeilen)), 0)) / 100;
  const probeOk = Math.abs(d.rechenprobeDifferenz) < 0.005 && Math.abs(summeGruppen - saldoJahr) < 0.005 && Math.abs(d.anfangsbestand + summeGruppen - d.endbestand) < 0.005;
  b.absatz(
    probeOk
      ? `Rechenprobe bestanden: Anfangsbestand ${euro(d.anfangsbestand)} + Summe aller Gruppen ${euro(summeGruppen)} = Endbestand ${euro(d.endbestand)} EUR; er stimmt mit dem unabhängig berechneten Kontostand überein.`
      : `ACHTUNG Rechenprobe: Anfangsbestand + Gruppensummen = ${euro(d.anfangsbestand + summeGruppen)} EUR, Endbestand ${euro(d.endbestand)} EUR, unabhängig berechnet ${euro(d.endbestandUnabhaengig)} EUR.`,
    { farbe: probeOk ? GRUEN : ROT },
  );
  if (d.kontrollen.length === 0 && !d.verifikation) {
    b.absatz("Für dieses Jahr ist kein Kontostand aus einem Kontoauszug hinterlegt – der Endbestand ist rein rechnerisch ermittelt.", { farbe: ROT });
  } else if (d.verifikation) {
    const ok = Math.abs(d.verifikation.differenz) < 0.005;
    b.absatz(
      `Abstimmung: Kontostand ${bis} laut Kontoauszug ${euro(d.verifikation.bank)} EUR, laut Journal ${euro(d.verifikation.berechnet)} EUR – ${ok ? "stimmt" : `Abweichung ${euro(d.verifikation.differenz)} EUR`}.`,
      { farbe: ok ? GRUEN : ROT },
    );
  }
  b.abstand(8);

  b.titel("2  Summen je Gruppe und Kostenart");
  const sumZeilen: Zeile[] = [];
  for (const h of haupt) {
    const ein = h.zeilen.filter((z) => z.betrag >= 0).reduce((s, z) => s + cent(z.betrag), 0) / 100;
    const aus = h.zeilen.filter((z) => z.betrag < 0).reduce((s, z) => s + cent(z.betrag), 0) / 100;
    sumZeilen.push({ cells: [h.titel, String(h.zeilen.length), euro(ein), euro(aus), euro(summe(h.zeilen))], fett: true, fill: HELLGRAU, halteMitNaechsten: 2 });
    for (const u of h.unter) {
      const e = u.zeilen.filter((z) => z.betrag >= 0).reduce((s, z) => s + cent(z.betrag), 0) / 100;
      const a = u.zeilen.filter((z) => z.betrag < 0).reduce((s, z) => s + cent(z.betrag), 0) / 100;
      sumZeilen.push({ cells: [`    ${u.name}`, String(u.zeilen.length), euro(e), euro(a), euro(summe(u.zeilen))] });
    }
  }
  sumZeilen.push({ cells: ["Summe aller Gruppen (Kontobewegung des Jahres)", String(d.zeilen.length), euro(d.einnahmen), euro(d.ausgaben), euro(saldoJahr)], fett: true, linieOben: true });
  b.tabelle(
    [
      { titel: "Gruppe / Kostenart", w: 330 },
      { titel: "Anzahl", w: 60, rechts: true },
      { titel: "Einnahmen", w: 130, rechts: true },
      { titel: "Ausgaben", w: 130, rechts: true },
      { titel: "Saldo", w: 132, rechts: true },
    ],
    sumZeilen,
    { groesse: 8 },
  );
  b.abstand(6);
  b.absatz(
    "Kosten sind je Kostenart netto dargestellt (Ausgaben abzüglich Gutschriften). Maßgeblich ist das Datum der Kontobewegung (Zu- und Abfluss), nicht das Kostenjahr; die Zuordnung zu einem Abrechnungsjahr für die Nebenkostenabrechnung steht in der Spalte „Zuordnung“. " +
      "Buchungen ohne Geldfluss (Gebührenforderungen, Kautionseinbehalte) fehlen, weil sie den Kontostand nicht verändern.",
    { farbe: GRAU },
  );

  // ───────────── Detail je Gruppe ─────────────
  const spalten: Spalte[] = [
    { titel: "Nr.", w: 30 },
    { titel: "Datum", w: 50 },
    { titel: "Gegenpartei / Verwendungszweck", w: 340, maxZeilen: 3, ersteZeileFett: true },
    { titel: "Zuordnung", w: 262, maxZeilen: 2 },
    { titel: "Betrag", w: 100, rechts: true },
  ];
  let kapitel = 3;
  for (const h of haupt) {
    b.neueSeite();
    b.titel(`${kapitel}  ${h.titel}`, 12);
    kapitel++;
    b.absatz(h.hinweis, { farbe: GRAU });
    b.abstand(4);
    const zs: Zeile[] = [];
    for (const u of h.unter) {
      zs.push({ cells: [], spanText: `${u.name}`, fill: HELLGRAU, halteMitNaechsten: 3 });
      const mehrereOrte = u.orte.length > 1;
      for (const o of u.orte) {
        if (mehrereOrte) zs.push({ cells: [], spanText: o.ort, spanEinzug: 10, farbe: GRAU, halteMitNaechsten: 2 });
        const jeEinheit = h.id === "EINNAHMEN";
        o.zeilen.forEach((z, i) => {
          const hatName = z.gegenpartei !== "";
          zs.push({
            cells: [String(z.nr), datumKurz(z.datum), hatName ? `${z.gegenpartei}\n${z.zweck}` : z.zweck, z.zuordnung, euro(z.betrag)],
            ersteZeileFettSpalte: hatName ? 2 : undefined,
          });
          const naechste = o.zeilen[i + 1];
          if (jeEinheit && (!naechste || einheitVon(naechste) !== einheitVon(z))) {
            const block = o.zeilen.filter((x) => einheitVon(x) === einheitVon(z));
            zs.push({ cells: ["", "", `Summe ${einheitVon(z) || "ohne Wohnung"} (${block.length})`, "", euro(summe(block))], fett: true, linieOben: true });
          }
        });
        if (mehrereOrte) zs.push({ cells: ["", "", `Summe ${o.ort} (${o.zeilen.length})`, "", euro(summe(o.zeilen))], fett: true, linieOben: true });
      }
      zs.push({ cells: ["", "", `Summe ${u.name} (${u.zeilen.length} Buchungen)`, "", euro(summe(u.zeilen))], fett: true, linieOben: true });
      zs.push({ cells: [], spanText: "", halteMitNaechsten: 0 });
    }
    zs.push({ cells: ["", "", `Summe ${h.titel} (${h.zeilen.length} Buchungen)`, "", euro(summe(h.zeilen))], fett: true, fill: HELLGRAU, linieOben: true });
    b.tabelle(spalten, zs, { groesse: 6.8 });
  }

  b.fusszeilen(new Date());
  doc.setTitle(`Jahresbericht nach Gruppen ${jahr}`);
  doc.setSubject(d.objekt ? `${d.objekt.name} · ${d.objekt.adresse}` : "");
  doc.setProducer("Mietverwaltung Eutin");
  doc.setCreator("Mietverwaltung Eutin");
  return doc.save();
}
