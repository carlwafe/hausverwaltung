// Einmalige Datenmigration: liest die 5 zu ersetzenden Tabellen aus der bestehenden
// mietverwaltung_eutin-DB (Hauptzweig, gerade erst mit Produktion synchronisiert) und schreibt sie
// als Buchung-Zeilen mit passender Buchungsart in die neue mietverwaltung_eutin_journal-DB.
// IDs werden 1:1 übernommen (cuid-Kollisionsrisiko über verschiedene Quelltabellen hinweg
// praktisch null) — dadurch bleiben aufteilungGruppeId-Korrelationen und Dokument-Verknüpfungen
// ohne separate ID-Mapping-Tabelle gültig.
import { Client as PgClient } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./src/generated/prisma/client";

const OLD_DATABASE_URL =
  "postgresql://mietverwaltung:fbf02f42f7f5a3e9883a28e060ed7fc8@localhost:5432/mietverwaltung_eutin";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type BuchungsartSeed = {
  code: string;
  bezeichnung: string;
  kontokreis: "MIETKONTO" | "KAUTIONSKONTO" | "OBJEKTKONTO";
  zahlungswirksam: boolean;
  eurRelevant: boolean;
};

// Flags 1:1 aus der tatsächlichen Verwendung der 5 Quelltabellen in kontostand/page.tsx (alle
// zahlungswirksam) und jahresuebersicht/page.tsx (nur Zahlung/Kostenposition/Nebenkostenausgleich
// sind eurRelevant — Kaution und Mietweiterleitung fließen dort nie ein) abgeleitet, nicht neu
// erfunden — siehe Analyse im Chat.
const BUCHUNGSARTEN: BuchungsartSeed[] = [
  { code: "MIETZAHLUNG", bezeichnung: "Mietzahlung", kontokreis: "MIETKONTO", zahlungswirksam: true, eurRelevant: true },
  { code: "KOSTENPOSITION", bezeichnung: "Kosten (Ausgabe oder Gutschrift)", kontokreis: "OBJEKTKONTO", zahlungswirksam: true, eurRelevant: true },
  { code: "MIETWEITERLEITUNG", bezeichnung: "Mietweiterleitung/Einlage Eigentümerin", kontokreis: "OBJEKTKONTO", zahlungswirksam: true, eurRelevant: false },
  { code: "NEBENKOSTENAUSGLEICH", bezeichnung: "NK-Rückzahlung/-Nachzahlung", kontokreis: "MIETKONTO", zahlungswirksam: true, eurRelevant: true },
  { code: "KAUTION_EINZAHLUNG", bezeichnung: "Kaution: Einzahlung Mieter", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  { code: "KAUTION_ANLAGE", bezeichnung: "Kaution: Anlage", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  { code: "KAUTION_AUFLOESUNG", bezeichnung: "Kaution: Auflösung", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  { code: "KAUTION_AUSZAHLUNG", bezeichnung: "Kaution: Auszahlung Mieter", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  { code: "KAUTION_SONSTIGES", bezeichnung: "Kaution: Sonstiges", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  // zahlungswirksam bewusst true (nicht false, wie man vom Namen her erwarten könnte): im
  // Vorgänger-Modell fließt VIRTUELLE_AUSZAHLUNG ganz normal in /kontostand ein und gleicht sich
  // dort nur durch das entgegengesetzte Vorzeichen der verknüpften Kostenposition von selbst aus
  // (siehe Schema-Kommentar dort) — für exakte Zahlen-Übereinstimmung muss das Journal-Modell
  // dasselbe Verhalten reproduzieren, nicht die "eigentlich richtige" Flag-Kombination wählen.
  { code: "KAUTION_VIRTUELLE_AUSZAHLUNG", bezeichnung: "Kaution: virtuelle Auszahlung (aus Kostenposition finanziert)", kontokreis: "KAUTIONSKONTO", zahlungswirksam: true, eurRelevant: false },
  // Nachträglich ergänzt (nach dem initialen Migrationslauf): kein eigener Kontofluss, aber
  // eur-relevant, weil der Einbehalt wirtschaftlich wie eine Kostenerstattung wirkt — siehe
  // kautionen/actions.ts (erfasseKautionEinbehalt/aendereKautionEinbehaltStatus).
  { code: "KAUTION_EINBEHALT", bezeichnung: "Kaution: Einbehalt bei Auflösung", kontokreis: "KAUTIONSKONTO", zahlungswirksam: false, eurRelevant: true },
];

async function main() {
  const old = new PgClient({ connectionString: OLD_DATABASE_URL });
  await old.connect();

  console.log("1) Buchungsart-Katalog seeden...");
  const buchungsartId = new Map<string, string>();
  for (const b of BUCHUNGSARTEN) {
    const row = await prisma.buchungsart.upsert({
      where: { code: b.code },
      update: {},
      create: b,
    });
    buchungsartId.set(b.code, row.id);
  }
  console.log(`   ${buchungsartId.size} Buchungsarten.`);

  console.log("2) ImportBatch + User + Objekt + Stammdaten kopieren (Rohdaten für Prisma-Migrate)...");
  // Diese Tabellen sind im neuen Schema unverändert (gleicher Tabellenname) — per db push schon
  // als leere Tabellen vorhanden, Daten werden 1:1 per INSERT ... SELECT über dblink-freie Kopie
  // (zwei getrennte Verbindungen) übertragen.
  const stammdatenTabellen = [
    "users",
    "objekte",
    "haeuser",
    "kostengruppen",
    "gebaeude",
    "_GebaeudeToKostengruppe", // implizite m:n-Relationstabelle
    "einheiten",
    "mieter",
    "mietvertraege",
    "_MieterToMietvertrag", // implizite m:n-Relationstabelle
    "mieterhoehungen",
    "mieterhoehung_vorschlaege_verworfen",
    "kautionen",
    "kostenarten",
    "verbrauchswerte",
    "vorverteilte_kostenanteile",
    "jahresbericht_verifikationen",
    "nebenkostenabrechnungen",
    "nebenkostenabrechnung_positionen",
    "import_batches",
    "nicht_zugeordnete_buchungen",
  ];
  for (const tabelle of stammdatenTabellen) {
    const { rows, fields } = await old.query(`SELECT * FROM "${tabelle}"`);
    if (rows.length === 0) continue;
    const columns = fields.map((f) => `"${f.name}"`).join(", ");
    for (const row of rows) {
      const values = fields.map((f) => {
        const v = row[f.name];
        // jsonb-Spalten kommen vom pg-Treiber schon geparst zurück — für einen rohen SQL-Parameter
        // muss es wieder ein JSON-String sein, sonst meldet Postgres "invalid input syntax".
        return v !== null && typeof v === "object" && !(v instanceof Date) ? JSON.stringify(v) : v;
      });
      const placeholders = values.map((_, i) => `$${i + 1}`).join(", ");
      await prisma.$executeRawUnsafe(
        `INSERT INTO "${tabelle}" (${columns}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
        ...values,
      );
    }
    console.log(`   ${tabelle}: ${rows.length} Zeilen.`);
  }

  console.log("3) Zahlung -> Buchung (MIETZAHLUNG)...");
  {
    const { rows } = await old.query(`SELECT * FROM zahlungen`);
    for (const z of rows) {
      await prisma.buchung.create({
        data: {
          id: z.id,
          mietvertragId: z.mietvertragId,
          buchungsartId: buchungsartId.get("MIETZAHLUNG")!,
          datum: z.datum,
          betrag: z.betrag,
          periodeMonat: z.periodeMonat,
          periodeJahr: z.periodeJahr,
          verwendungszweck: z.verwendungszweck,
          rohdaten: z.rohdaten,
          importBatchId: z.importBatchId,
          aufteilungGruppeId: z.aufteilungGruppeId,
          erstelltAm: z.createdAt,
        },
      });
    }
    console.log(`   ${rows.length} Zahlungen migriert.`);
  }

  console.log("4) Kostenposition -> Buchung (KOSTENPOSITION)...");
  {
    const { rows } = await old.query(`SELECT * FROM kostenpositionen`);
    for (const k of rows) {
      await prisma.buchung.create({
        data: {
          id: k.id,
          buchungsartId: buchungsartId.get("KOSTENPOSITION")!,
          kostenartId: k.kostenartId,
          gebaeudeId: k.gebaeudeId,
          hausId: k.hausId,
          kostengruppeId: k.kostengruppeId,
          einheitId: k.einheitId,
          jahr: k.jahr,
          datum: k.datum,
          betrag: k.betrag,
          verwendungszweck: k.beschreibung,
          empfaenger: k.empfaenger,
          rohdaten: k.rohdaten,
          importBatchId: k.importBatchId,
          aufteilungGruppeId: k.aufteilungGruppeId,
          erstelltAm: k.createdAt,
          // virtuelleKautionBuchungId wird erst in Schritt 6 (nach der Kaution-Migration)
          // nachgetragen, siehe unten.
        },
      });
    }
    console.log(`   ${rows.length} Kostenpositionen migriert.`);
  }

  console.log("5) EigentuemerBuchung -> Buchung (MIETWEITERLEITUNG)...");
  {
    const { rows } = await old.query(`SELECT * FROM eigentuemerbuchungen`);
    for (const e of rows) {
      await prisma.buchung.create({
        data: {
          id: e.id,
          buchungsartId: buchungsartId.get("MIETWEITERLEITUNG")!,
          datum: e.datum,
          betrag: e.betrag,
          empfaenger: e.empfaenger,
          verwendungszweck: e.verwendungszweck,
          rohdaten: e.rohdaten,
          importBatchId: e.importBatchId,
          erstelltAm: e.createdAt,
        },
      });
    }
    console.log(`   ${rows.length} Mietweiterleitungen migriert.`);
  }

  console.log("6) KautionBuchung -> Buchung (KAUTION_*)...");
  {
    const { rows } = await old.query(`SELECT * FROM kautionsbuchungen`);
    const kategorieZuCode: Record<string, string> = {
      EINZAHLUNG_MIETER: "KAUTION_EINZAHLUNG",
      ANLAGE: "KAUTION_ANLAGE",
      AUFLOESUNG: "KAUTION_AUFLOESUNG",
      AUSZAHLUNG_MIETER: "KAUTION_AUSZAHLUNG",
      SONSTIGES: "KAUTION_SONSTIGES",
      VIRTUELLE_AUSZAHLUNG: "KAUTION_VIRTUELLE_AUSZAHLUNG",
    };
    for (const k of rows) {
      await prisma.buchung.create({
        data: {
          id: k.id,
          mietvertragId: k.mietvertragId,
          buchungsartId: buchungsartId.get(kategorieZuCode[k.kategorie])!,
          datum: k.datum,
          betrag: k.betrag,
          empfaenger: k.empfaenger,
          verwendungszweck: k.verwendungszweck,
          rohdaten: k.rohdaten,
          importBatchId: k.importBatchId,
          erstelltAm: k.createdAt,
        },
      });
    }
    console.log(`   ${rows.length} Kautionsbuchungen migriert.`);

    // Jetzt die virtuelle Gegenbuchungs-Verknüpfung nachtragen (Kostenposition.virtuelleKautionBuchungId
    // -> Buchung.bezugTyp/bezugId), da die referenzierte Kaution-Buchung erst jetzt existiert.
    const { rows: kosten } = await old.query(
      `SELECT id, "virtuelleKautionBuchungId" FROM kostenpositionen WHERE "virtuelleKautionBuchungId" IS NOT NULL`,
    );
    for (const k of kosten) {
      await prisma.buchung.update({
        where: { id: k.id },
        data: { bezugTyp: "Buchung", bezugId: k.virtuelleKautionBuchungId },
      });
    }
    console.log(`   ${kosten.length} virtuelle Gutschrift-Verknüpfungen nachgetragen.`);
  }

  console.log("7) NebenkostenausgleichZahlung -> Buchung (NEBENKOSTENAUSGLEICH)...");
  {
    const { rows } = await old.query(`SELECT * FROM nebenkostenausgleich_zahlungen`);
    for (const n of rows) {
      await prisma.buchung.create({
        data: {
          id: n.id,
          mietvertragId: n.mietvertragId,
          buchungsartId: buchungsartId.get("NEBENKOSTENAUSGLEICH")!,
          jahr: n.jahr,
          datum: n.datum,
          betrag: n.betrag,
          empfaenger: n.empfaenger,
          verwendungszweck: n.verwendungszweck,
          rohdaten: n.rohdaten,
          importBatchId: n.importBatchId,
          erstelltAm: n.createdAt,
        },
      });
    }
    console.log(`   ${rows.length} Nebenkostenausgleich-Zahlungen migriert.`);
  }

  console.log("8) Dokument kopieren (kostenpositionId -> buchungId)...");
  {
    const { rows } = await old.query(`SELECT * FROM dokumente`);
    for (const d of rows) {
      await prisma.dokument.create({
        data: {
          id: d.id,
          dateiname: d.dateiname,
          speicherpfad: d.speicherpfad,
          mimeType: d.mimeType,
          groesseBytes: d.groesseBytes,
          mietvertragId: d.mietvertragId,
          buchungId: d.kostenpositionId,
          einheitId: d.einheitId,
          hochgeladenVon: d.hochgeladenVon,
          createdAt: d.createdAt,
        },
      });
    }
    console.log(`   ${rows.length} Dokumente migriert.`);
  }

  await old.end();
  console.log("\nFertig.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
