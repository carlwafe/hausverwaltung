"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor, requireUser, benutzerLabel } from "@/lib/session";
import { ladeKostenDoppelzahlungen } from "@/lib/kosten-doppelzahlung";
import { parseGebaeudeAuswahlWert } from "@/lib/gebaeude-gruppen";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { istGemischteAufteilung, hebeZahlungAufteilungAuf } from "@/lib/aufteilung-aufheben";
import { AktionsFehler, zodFehler, mitMeldung } from "@/lib/aktion";
import { verlangtBezugsbereit } from "@/lib/anlage-v";
import { MAX_BELEG_AUSNAHME_GRUND, uebernehmeBelegAusnahme } from "@/lib/beleg-status";
import { uebernehmeArbeitskosten } from "@/lib/arbeitskosten";

async function ladeKostenpositionBuchungsartId(): Promise<string> {
  const art = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "KOSTENPOSITION" } });
  return art.id;
}

const kostenpositionSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  // Optional: manche Kosten (z.B. Bankgebühren, Verwaltungskosten) betreffen das ganze Objekt und
  // lassen sich keinem einzelnen Gebäude zuordnen. Trägt ein "gebaeude:"/"haus:"-Präfix, siehe
  // parseGebaeudeAuswahlWert.
  gebaeudeAuswahl: z.string().optional(),
  jahr: z.coerce.number().int().min(2000).max(2100),
  // Negativ ist ein legitimer Wert (eine Gutschrift/Erstattung eines bekannten Kosten-Empfängers,
  // z.B. eine Techem-Rückerstattung, siehe kosten-import.ts) und mindert die Kostenart — nur 0 ist
  // ungültig. Vorher war hier .positive() gesetzt, wodurch sich eine bereits bestehende Gutschrift
  // gar nicht mehr bearbeiten ließ (z.B. nur die Gebäude-Zuordnung korrigieren), selbst wenn der
  // Betrag selbst unverändert blieb.
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  beschreibung: z.string().optional(),
  empfaenger: z.string().optional(),
  // Verknüpft diese Position als virtuelle Gutschrift mit einer Kautionsbuchung der Kategorie
  // VIRTUELLE_AUSZAHLUNG — polymorpher Bezug über bezugTyp/bezugId (siehe Buchung im Schema).
  virtuelleKautionBuchungId: z.string().optional(),
});

function parseForm(formData: FormData) {
  const parsed = kostenpositionSchema.safeParse({
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeId") || undefined,
    jahr: formData.get("jahr"),
    betrag: formData.get("betrag"),
    beschreibung: formData.get("beschreibung") || undefined,
    empfaenger: formData.get("empfaenger") || undefined,
    virtuelleKautionBuchungId: formData.get("virtuelleKautionBuchungId") || undefined,
  });

  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }
  const { gebaeudeAuswahl, beschreibung, ...rest } = parsed.data;
  const { gebaeudeId, hausId, kostengruppeId, einheitId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");
  return { ...rest, verwendungszweck: beschreibung, gebaeudeId, hausId, kostengruppeId, einheitId };
}

// Das Datumsfeld wird bei einer importierten Position deaktiviert (siehe kostenposition-form.tsx)
// — ein deaktiviertes <input> wird beim Absenden gar nicht erst mitgeschickt, `formData.get`
// liefert dann null. Das unterscheidet zuverlässig "Feld war deaktiviert, nicht anfassen" von
// "Feld war leer, Nutzer hat kein Datum eingetragen".
function parseDatumFeld(formData: FormData): { vorhanden: boolean; wert: Date | null } {
  const raw = formData.get("datum");
  if (raw === null) return { vorhanden: false, wert: null };
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return { vorhanden: true, wert: trimmed ? new Date(trimmed) : null };
}

// Eine virtuelle Gutschrift ohne eigenes datum würde nicht in /kontostand einfließen (das dort nur
// Kostenpositionen mit datum != null zählt) und ihre verknüpfte Kautionsbuchung nicht ausgleichen.
// Übernimmt deshalb, falls der Nutzer selbst kein Datum eingetragen hat, automatisch das Datum der
// verknüpften Kautionsbuchung als Vorschlag.
async function ermittleDatumFuerVirtuelleGutschrift(
  virtuelleKautionBuchungId: string | undefined,
): Promise<Date | null> {
  if (!virtuelleKautionBuchungId) return null;
  const buchung = await prisma.buchung.findUnique({
    where: { id: virtuelleKautionBuchungId, buchungsart: { kontokreis: "KAUTIONSKONTO" } },
    select: { datum: true },
  });
  return buchung?.datum ?? null;
}

// „Bezugsbereit ab“ gehört nur zu Kostenarten mit Einordnung „Anschaffung / Herstellung“ (AfA) und ist dort
// Pflicht (ab dem Berichtsjahr 2026): der Beginn der Abschreibung hängt daran. Bei jeder anderen Kostenart
// wird ein mitgeschicktes Datum verworfen.
async function ermittleBezugsbereit(
  kostenartId: string,
  datum: Date | null,
  kostenjahr: number | null,
  eingabe: FormDataEntryValue | null,
): Promise<Date | null> {
  const kostenart = await prisma.kostenart.findUnique({ where: { id: kostenartId }, select: { anlageVZeile: true } });
  if (kostenart?.anlageVZeile !== "ANSCHAFFUNG") return null;
  const text = typeof eingabe === "string" ? eingabe.trim() : "";
  const wert = text ? new Date(text) : null;
  if (wert && Number.isNaN(wert.getTime())) throw new AktionsFehler("„Bezugsbereit ab“ ist kein gültiges Datum.");
  if (!wert && verlangtBezugsbereit("ANSCHAFFUNG", datum ? datum.getFullYear() : kostenjahr)) {
    throw new AktionsFehler(
      "Bitte angeben, ab wann die Wohnung bezugsbereit war („Bezugsbereit ab“) — Pflicht bei Anschaffung / Herstellung (AfA).",
    );
  }
  return wert;
}

export const createKostenposition = mitMeldung(async function createKostenposition(formData: FormData) {
  const user = await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, einheitId, virtuelleKautionBuchungId, ...rest } =
    parseForm(formData);
  const { wert: explizitesDatum } = parseDatumFeld(formData);
  const datum = explizitesDatum ?? (await ermittleDatumFuerVirtuelleGutschrift(virtuelleKautionBuchungId));
  const buchungsartId = await ladeKostenpositionBuchungsartId();
  const bezugsbereitAb = await ermittleBezugsbereit(kostenartId, datum, rest.jahr, formData.get("bezugsbereitAb"));

  await prisma.buchung.create({
    data: {
      ...rest,
      buchungsartId,
      kostenartId,
      datum,
      bezugsbereitAb,
      gebaeudeId: gebaeudeId || null,
      hausId: hausId || null,
      kostengruppeId: kostengruppeId || null,
      einheitId: einheitId || null,
      bezugTyp: virtuelleKautionBuchungId ? "Buchung" : null,
      bezugId: virtuelleKautionBuchungId || null,
      erstelltVon: benutzerLabel(user),
    },
  });

  revalidatePath("/kosten");
  revalidatePath("/kautionen");
  redirect("/kosten");
});

// "Bearbeiten" heißt beim Storno-Prinzip: die alte Buchung stornieren und mit den korrigierten
// Werten neu anlegen — importBatchId/rohdaten/aufteilungGruppeId wandern dabei mit.
export const updateKostenposition = mitMeldung(async function updateKostenposition(id: string, formData: FormData) {
  const user = await requireEditor();
  const { kostenartId, gebaeudeId, hausId, kostengruppeId, einheitId, virtuelleKautionBuchungId, ...rest } =
    parseForm(formData);
  // Bei einer importierten Position (Datumsfeld deaktiviert) war "datum" gar nicht im FormData
  // enthalten — dann bleibt das echte Buchungsdatum unangetastet. Sonst übernimmt ein vom Nutzer
  // eingetragenes Datum immer Vorrang; ist das Feld leer, greift wie beim Anlegen die Vorbelegung
  // aus einer verknüpften Kautionsbuchung, sonst wird das Datum explizit gelöscht.
  const { vorhanden, wert: explizitesDatum } = parseDatumFeld(formData);
  const bisherige = await prisma.buchung.findUniqueOrThrow({ where: { id } });
  const datum = vorhanden
    ? (explizitesDatum ?? (await ermittleDatumFuerVirtuelleGutschrift(virtuelleKautionBuchungId)))
    : bisherige.datum;

  const bezugsbereitAb = await ermittleBezugsbereit(kostenartId, datum, rest.jahr, formData.get("bezugsbereitAb"));

  const erstelltVon = benutzerLabel(user);
  await prisma.$transaction(async (tx) => {
    await storniereBuchung(tx, id, erstelltVon);
    const neu = await tx.buchung.create({
      data: {
        ...rest,
        buchungsartId: bisherige.buchungsartId,
        kostenartId,
        datum,
        bezugsbereitAb,
        gebaeudeId: gebaeudeId || null,
        hausId: hausId || null,
        kostengruppeId: kostengruppeId || null,
        einheitId: einheitId || null,
        bezugTyp: virtuelleKautionBuchungId ? "Buchung" : null,
        bezugId: virtuelleKautionBuchungId || null,
        rohdaten: bisherige.rohdaten ?? undefined,
        importBatchId: bisherige.importBatchId,
        aufteilungGruppeId: bisherige.aufteilungGruppeId,
        erstelltVon,
      },
    });
    // Belege gehören zur Position, nicht zur stornierten Fassung — auf die neue umhängen (sonst fehlen sie
    // an der aktiven Position und bleiben an der stornierten hängen).
    await tx.dokument.updateMany({ where: { buchungId: id }, data: { buchungId: neu.id } });
    await uebernehmeBelegAusnahme(tx, id, neu.id);
    await uebernehmeArbeitskosten(tx, id, neu.id);
  });

  revalidatePath("/kosten");
  revalidatePath(`/kosten/${id}`);
  revalidatePath("/kautionen");
  redirect("/kosten");
});

export async function deleteKostenposition(id: string) {
  const user = await requireEditor();
  await prisma.$transaction(async (tx) => {
    await storniereBuchung(tx, id, benutzerLabel(user));
  });
  revalidatePath("/kosten");
  redirect("/kosten");
}

export async function deleteKostenpositionen(ids: string[]) {
  const user = await requireEditor();
  if (ids.length === 0) return;
  const erstelltVon = benutzerLabel(user);
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id, erstelltVon);
    }
  });
  revalidatePath("/kosten");
}

const aufteilungTeilSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  // Gemischte Vorzeichen erlaubt, z.B. Stadtwerke-Saldo = Schlussrechnung-Guthaben (negativ) +
  // neue Abschläge (positiv); nur die Summe muss dem Gesamtbetrag entsprechen.
  betrag: z.coerce.number().refine((b) => b !== 0, "Betrag darf nicht 0 sein"),
  beschreibung: z.string().optional(),
  // Kostenjahr je Teil (nur Nebenkostenabrechnung), z.B. Schlussrechnung fürs Vorjahr.
  jahr: z.coerce.number().int().min(2000, "Kostenjahr ungültig").max(2100, "Kostenjahr ungültig").optional(),
});

/**
 * Teilt eine als eine Buchung importierte Kostenposition (z.B. eine Hausmeister-Rechnung mit
 * umlagefähigem Hausmeisterdienst + nicht umlagefähigem Winterdienst) in mehrere Positionen mit
 * je eigener Kostenart/Betrag auf. Die ursprüngliche Position wird storniert statt echt gelöscht
 * (Storno-Prinzip) — dadurch bleiben alle bestehenden Summen (Nebenkostenabrechnung,
 * Jahresübersicht, Kosten-Übersicht) automatisch korrekt, ohne dass sie von der Aufteilung
 * wissen müssen. `aufteilungGruppeId` verknüpft die neuen Positionen als zusammengehörig, damit
 * die Kosten-Übersicht sie wieder als eine Zeile darstellen kann.
 */
export const teileKostenpositionAuf = mitMeldung(async function teileKostenpositionAuf(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireEditor();

  const raw = formData.get("teile");
  if (typeof raw !== "string") return "Keine Aufteilung übermittelt.";

  let teileRoh: unknown;
  try {
    teileRoh = JSON.parse(raw);
  } catch {
    return "Aufteilung konnte nicht gelesen werden.";
  }

  const parsed = z.array(aufteilungTeilSchema).min(2, "Mindestens zwei Positionen nötig").safeParse(teileRoh);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const teile = parsed.data;

  const original = await prisma.buchung.findUnique({ where: { id } });
  if (!original) return "Kostenposition nicht gefunden.";

  const summeTeile = teile.reduce((sum, t) => sum + t.betrag, 0);
  if (Math.abs(summeTeile - Number(original.betrag)) > 0.01) {
    return `Die Summe der Teile (${summeTeile.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  const gruppeId = original.aufteilungGruppeId ?? original.id;
  const erstelltVon = benutzerLabel(user);

  await prisma.$transaction(async (tx) => {
    const neuePositionen = [];
    for (const teil of teile) {
      const neu = await tx.buchung.create({
        data: {
          buchungsartId: original.buchungsartId,
          kostenartId: teil.kostenartId,
          betrag: teil.betrag,
          verwendungszweck: teil.beschreibung || original.verwendungszweck,
          empfaenger: original.empfaenger,
          gebaeudeId: original.gebaeudeId,
          hausId: original.hausId,
          kostengruppeId: original.kostengruppeId,
          einheitId: original.einheitId,
          jahr: teil.jahr ?? original.jahr,
          datum: original.datum,
          bezugsbereitAb: original.bezugsbereitAb,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
          erstelltVon,
        },
      });
      neuePositionen.push(neu);
    }
    // Belege hängen an der ursprünglichen Position — auf die erste neue Teil-Position umhängen,
    // statt sie sonst verwaist stehen zu lassen.
    await tx.dokument.updateMany({
      where: { buchungId: id },
      data: { buchungId: neuePositionen[0].id },
    });
    await uebernehmeBelegAusnahme(tx, id, neuePositionen.map((p) => p.id));
    await uebernehmeArbeitskosten(tx, id, neuePositionen.map((p) => p.id));
    await storniereBuchung(tx, id, erstelltVon);
  });

  revalidatePath("/kosten");
  redirect("/kosten");
});

// Macht eine Aufteilung wieder rückgängig: alle Positionen derselben aufteilungGruppeId werden
// storniert und zu einer einzigen neuen Position zusammengeführt (Betrag = Summe), unter der
// Kostenart der Position, von der aus die Aktion aufgerufen wurde. Belege aller Teile wandern auf
// die neue Position.
export async function hebeAufteilungAuf(positionId: string) {
  const user = await requireEditor();
  const position = await prisma.buchung.findFirst({ where: { id: positionId, ...AKTIVE_BUCHUNG_FILTER } });
  if (!position) throw new AktionsFehler("Kostenposition nicht gefunden.");
  if (!position.aufteilungGruppeId) throw new AktionsFehler("Diese Position ist nicht Teil einer Aufteilung.");
  const erstelltVon = benutzerLabel(user);

  // Stammt die Aufteilung aus einer Zahlung (Miete + Kosten), wird die ursprüngliche Zahlung
  // wiederhergestellt statt die Teile fälschlich zu einer einzigen Kostenposition zu addieren.
  if (await istGemischteAufteilung(position.aufteilungGruppeId)) {
    const mietvertraege = await hebeZahlungAufteilungAuf(position.aufteilungGruppeId, position.id, erstelltVon);
    revalidatePath("/kosten");
    revalidatePath("/zahlungen");
    revalidatePath("/offene-posten");
    for (const id of mietvertraege) revalidatePath(`/mietvertraege/${id}`);
    redirect("/kosten");
  }

  // Nur die noch aktiven Teile — ein einzelner Teil kann seit dem Aufteilen bereits bearbeitet
  // worden sein (Storno + Neuanlage, siehe updateKostenposition), wodurch die alte, jetzt
  // stornierte Version weiterhin dieselbe aufteilungGruppeId trägt. Ohne diesen Filter würde ihr
  // Betrag doppelt in die Summe einfließen UND storniereBuchung beim erneuten Stornieren dieser
  // bereits stornierten Zeile einen Fehler werfen, der die ganze Transaktion abbricht.
  const gruppe = await prisma.buchung.findMany({
    where: { aufteilungGruppeId: position.aufteilungGruppeId, ...AKTIVE_BUCHUNG_FILTER },
  });
  const summe = gruppe.reduce((sum, p) => sum + Number(p.betrag), 0);

  // Belege können auch an einer inzwischen bearbeiteten (stornierten) früheren Version eines
  // Teils hängen (updateKostenposition hängt Belege bislang nicht um) — deshalb hier bewusst über
  // alle jemals zu dieser Gruppe gehörenden Buchungen gesucht, nicht nur die aktuell aktiven.
  const alleGruppenMitgliederIds = (
    await prisma.buchung.findMany({
      where: { aufteilungGruppeId: position.aufteilungGruppeId },
      select: { id: true },
    })
  ).map((b) => b.id);

  await prisma.$transaction(async (tx) => {
    const neu = await tx.buchung.create({
      data: {
        buchungsartId: position.buchungsartId,
        kostenartId: position.kostenartId,
        betrag: summe,
        verwendungszweck: position.verwendungszweck,
        empfaenger: position.empfaenger,
        gebaeudeId: position.gebaeudeId,
        hausId: position.hausId,
        kostengruppeId: position.kostengruppeId,
        einheitId: position.einheitId,
        jahr: position.jahr,
        datum: position.datum,
        bezugsbereitAb: position.bezugsbereitAb,
        rohdaten: position.rohdaten ?? undefined,
        importBatchId: position.importBatchId,
        erstelltVon,
      },
    });
    await tx.dokument.updateMany({
      where: { buchungId: { in: alleGruppenMitgliederIds } },
      data: { buchungId: neu.id },
    });
    await uebernehmeArbeitskosten(tx, gruppe.map((t) => t.id), neu.id);
    for (const teil of gruppe) {
      await uebernehmeBelegAusnahme(tx, teil.id, neu.id);
      await storniereBuchung(tx, teil.id, erstelltVon);
    }
  });

  revalidatePath("/kosten");
  redirect("/kosten");
}

const nichtZugeordneteBuchungZuordnenSchema = z.object({
  kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
  gebaeudeAuswahl: z.string().optional(),
  jahr: z.coerce.number().int().min(2000).max(2100),
});

// Löst eine geparkte NichtZugeordneteBuchung (siehe kontoauszug/import/actions.ts,
// parkeAlsNichtKategorisiert) auf: legt daraus eine echte Kostenposition an — Datum/Betrag/
// Empfänger/Rohdaten/importBatchId werden 1:1 von der geparkten Buchung übernommen, nur
// Kostenart/Gebäude/Jahr kommen aus dem Formular — und löscht danach die Parkplatz-Zeile.
export const ordneNichtZugeordneteBuchungZu = mitMeldung(async function ordneNichtZugeordneteBuchungZu(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireEditor();

  const parsed = nichtZugeordneteBuchungZuordnenSchema.safeParse({
    kostenartId: formData.get("kostenartId"),
    gebaeudeAuswahl: formData.get("gebaeudeAuswahl") || undefined,
    jahr: formData.get("jahr"),
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { kostenartId, gebaeudeAuswahl, jahr } = parsed.data;
  const { gebaeudeId, hausId, kostengruppeId, einheitId } = parseGebaeudeAuswahlWert(gebaeudeAuswahl ?? "");

  const buchung = await prisma.nichtZugeordneteBuchung.findUnique({ where: { id } });
  if (!buchung) return "Diese Buchung wurde bereits zugeordnet oder gelöscht.";
  const buchungsartId = await ladeKostenpositionBuchungsartId();

  await prisma.$transaction([
    prisma.buchung.create({
      data: {
        buchungsartId,
        kostenartId,
        gebaeudeId,
        hausId,
        kostengruppeId,
        einheitId,
        jahr,
        datum: buchung.datum,
        // Geparkte Buchungen tragen das Bankvorzeichen, Kostenpositionen das Kostenvorzeichen.
        betrag: -Number(buchung.betrag),
        empfaenger: buchung.empfaenger,
        verwendungszweck: buchung.verwendungszweck,
        rohdaten: buchung.rohdaten ?? undefined,
        importBatchId: buchung.importBatchId,
        erstelltVon: benutzerLabel(user),
      },
    }),
    prisma.nichtZugeordneteBuchung.delete({ where: { id } }),
  ]);

  revalidatePath("/kosten");
  return null;
});

export async function loescheNichtZugeordneteBuchung(id: string) {
  await requireEditor();
  await prisma.nichtZugeordneteBuchung.delete({ where: { id } });
  revalidatePath("/kosten");
}

// Nur lesend (auch für Gäste): sucht unter den gebuchten Kosten dieselbe Rechnung zweimal bezahlt,
// siehe src/lib/import/doppelzahlung.ts. Läuft nur auf Knopfdruck.
export async function pruefeKostenDoppelzahlungen() {
  await requireUser();
  return ladeKostenDoppelzahlungen();
}

// „Kein Beleg nötig“ für eine umlagefähige Kostenposition (Belegprüfung der Nebenkostenabrechnung). Der Grund ist
// Pflicht, damit die Markierung später nachvollziehbar bleibt; leer = nicht erlaubt (zum Entfernen
// entferneBelegAusnahme). Gibt null bei Erfolg zurück, sonst die Meldung.
export const setzeBelegAusnahme = mitMeldung(async function setzeBelegAusnahme(
  buchungId: string,
  grund: string,
): Promise<string | null> {
  const user = await requireEditor();
  const bereinigt = grund.trim();
  if (!bereinigt) throw new AktionsFehler("Bitte einen Grund angeben (z.B. „Pauschale ohne Rechnung“).");
  if (bereinigt.length > MAX_BELEG_AUSNAHME_GRUND) {
    throw new AktionsFehler(`Der Grund darf höchstens ${MAX_BELEG_AUSNAHME_GRUND} Zeichen lang sein.`);
  }
  const position = await prisma.buchung.findFirst({
    where: { id: buchungId, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
    select: { id: true, jahr: true },
  });
  if (!position) throw new AktionsFehler("Kostenposition nicht gefunden.");
  const gesetztVon = benutzerLabel(user);
  await prisma.buchungBelegAusnahme.upsert({
    where: { buchungId },
    create: { buchungId, grund: bereinigt, gesetztVon },
    update: { grund: bereinigt, gesetztVon, gesetztAm: new Date() },
  });
  revalidatePath("/kosten");
  revalidatePath("/nebenkostenabrechnungen", "layout");
  return null;
});

export const entferneBelegAusnahme = mitMeldung(async function entferneBelegAusnahme(
  buchungId: string,
): Promise<string | null> {
  await requireEditor();
  await prisma.buchungBelegAusnahme.deleteMany({ where: { buchungId } });
  revalidatePath("/kosten");
  revalidatePath("/nebenkostenabrechnungen", "layout");
  return null;
});

// Arbeitskostenanteil (Lohn inkl. Umsatzsteuer, ohne Material) einer Kostenposition für den Ausweis nach § 35a EStG im
// Schreiben „Betriebskostenabrechnung“. Leer = Angabe entfernen. Der Anteil hat dasselbe Vorzeichen wie der Betrag der
// Position und ist höchstens so groß wie dieser. Gibt null bei Erfolg zurück, sonst die Meldung.
export const speichereArbeitskosten = mitMeldung(async function speichereArbeitskosten(
  buchungId: string,
  wert: string,
): Promise<string | null> {
  const user = await requireEditor();
  const position = await prisma.buchung.findFirst({
    where: { id: buchungId, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
    select: { betrag: true },
  });
  if (!position) throw new AktionsFehler("Kostenposition nicht gefunden.");
  const text = wert.trim();
  if (!text) {
    await prisma.buchungArbeitskosten.deleteMany({ where: { buchungId } });
  } else {
    // „2.423,67“ und „2423.67“ sind beide erlaubt: mit Komma gelten Punkte als Tausendertrenner.
    const zahl = Number(text.includes(",") ? text.replace(/\./g, "").replace(",", ".") : text);
    if (!Number.isFinite(zahl)) throw new AktionsFehler("Bitte einen Betrag in Euro eingeben (z.B. 2.423,67).");
    const betrag = Math.round(zahl * 100) / 100;
    const rechnung = Number(position.betrag);
    if (betrag !== 0 && Math.sign(betrag) !== Math.sign(rechnung)) {
      throw new AktionsFehler("Der Arbeitskostenanteil muss dasselbe Vorzeichen wie der Rechnungsbetrag haben.");
    }
    if (Math.abs(betrag) > Math.abs(rechnung) + 0.005) {
      throw new AktionsFehler("Der Arbeitskostenanteil darf nicht größer als der Rechnungsbetrag sein.");
    }
    const geaendertVon = benutzerLabel(user);
    await prisma.buchungArbeitskosten.upsert({
      where: { buchungId },
      create: { buchungId, betrag, geaendertVon },
      update: { betrag, geaendertVon },
    });
  }
  revalidatePath("/kosten");
  revalidatePath("/nebenkostenabrechnungen", "layout");
  return null;
});
