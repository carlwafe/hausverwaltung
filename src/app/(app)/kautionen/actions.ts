"use server";

import { z } from "zod";
import { pflichtDatum, parseStrengesDatum } from "@/lib/zod-datum";
import { KAUTION_EINBEHALT_BEZUG, NK_VERRECHNUNG_BEZUG } from "@/lib/nk-verrechnung";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";

// "Löschen" heißt beim Storno-Prinzip: die Buchung bleibt stehen, bekommt aber eine
// Gegenbuchung mit negiertem Betrag (siehe storniereBuchung) statt echt gelöscht zu werden.
export async function deleteKautionsbuchungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id);
    }
  });
  revalidatePath("/kautionen");
}

const KATEGORIE_WERTE = [
  "EINZAHLUNG_MIETER",
  "ANLAGE",
  "AUFLOESUNG",
  "AUSZAHLUNG_MIETER",
  "SONSTIGES",
  "VIRTUELLE_AUSZAHLUNG",
] as const;
type KautionBuchungKategorie = (typeof KATEGORIE_WERTE)[number];

// UI-seitig bleibt "Kategorie" bewusst dieselben 6 Werte wie im Vorgänger-Modell (kein Diff in
// kautionsbuchungen-table.tsx/neue-kautionsbuchung-form.tsx nötig) — intern bildet das auf die
// passende Buchungsart im Katalog ab.
const KATEGORIE_ZU_CODE: Record<KautionBuchungKategorie, string> = {
  EINZAHLUNG_MIETER: "KAUTION_EINZAHLUNG",
  ANLAGE: "KAUTION_ANLAGE",
  AUFLOESUNG: "KAUTION_AUFLOESUNG",
  AUSZAHLUNG_MIETER: "KAUTION_AUSZAHLUNG",
  SONSTIGES: "KAUTION_SONSTIGES",
  VIRTUELLE_AUSZAHLUNG: "KAUTION_VIRTUELLE_AUSZAHLUNG",
};

// "Bearbeiten" heißt beim Storno-Prinzip: die alte Buchung stornieren und mit dem korrigierten
// Feld (hier: buchungsartId) neu anlegen, statt sie direkt zu überschreiben — importBatchId/
// aufteilungGruppeId wandern dabei mit auf die neue Zeile (anders als beim reinen Storno-
// Gegeneintrag), weil die neue Zeile weiterhin dieselbe reale Buchung repräsentiert und z.B. in
// der Vollständigkeitsprüfung ihres ursprünglichen Import-Batches mitzählen soll.
export async function aktualisiereKautionsbuchungKategorie(id: string, kategorie: KautionBuchungKategorie) {
  await requireEditor();
  if (!KATEGORIE_WERTE.includes(kategorie)) return;
  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: KATEGORIE_ZU_CODE[kategorie] } });
  await prisma.$transaction(async (tx) => {
    const original = await tx.buchung.findUniqueOrThrow({ where: { id } });
    await storniereBuchung(tx, id);
    await tx.buchung.create({
      data: {
        mietvertragId: original.mietvertragId,
        buchungsartId: buchungsart.id,
        datum: original.datum,
        betrag: original.betrag,
        empfaenger: original.empfaenger,
        verwendungszweck: original.verwendungszweck,
        bemerkung: original.bemerkung,
        rohdaten: original.rohdaten ?? undefined,
        importBatchId: original.importBatchId,
        aufteilungGruppeId: original.aufteilungGruppeId,
      },
    });
  });
  revalidatePath("/kautionen");
}

const kautionAufteilungSchema = z.object({
  kautionBetrag: z.coerce.number().refine((v) => v !== 0, "Kautionsanteil darf nicht 0 sein"),
  nkJahr: z.coerce.number().int().min(2000, "Abrechnungsjahr fehlt").max(2100),
});

/**
 * Teilt eine Kautionsbuchung, deren Überweisung zugleich ein Nebenkosten-Guthaben/-Nachzahlung
 * enthält (z.B. "Guthaben BK-Abr 2023 + Kaution"), in den Kautionsanteil (gleiche Kategorie) und
 * einen NEBENKOSTENAUSGLEICH fürs angegebene Abrechnungsjahr auf. Beide Teile behalten Bankvorzeichen,
 * Rohdaten und Import-Bezug und teilen sich die aufteilungGruppeId (= Id des stornierten Originals),
 * damit der Kontoauszug-Import die Bankzeile weiter als importiert erkennt (siehe ladeDedupFilter).
 */
export async function teileKautionsbuchungAuf(id: string, _prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();
  const parsed = kautionAufteilungSchema.safeParse({
    kautionBetrag: String(formData.get("kautionBetrag") ?? "").replace(",", "."),
    nkJahr: formData.get("nkJahr"),
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");
  const { kautionBetrag, nkJahr } = parsed.data;

  const original = await prisma.buchung.findUnique({
    where: { id },
    include: { buchungsart: { select: { kontokreis: true, code: true } }, storniertZeile: { select: { id: true } } },
  });
  if (!original) return "Buchung nicht gefunden.";
  if (original.storniertDurchBuchungId || original.storniertZeile) return "Diese Buchung ist bereits storniert.";
  if (original.buchungsart.kontokreis !== "KAUTIONSKONTO" || original.buchungsart.code === "KAUTION_EINBEHALT")
    return "Nur Kautionsbuchungen lassen sich hier aufteilen.";
  if (!original.mietvertragId) return "Die Buchung ist keinem Mietvertrag zugeordnet.";
  if (original.bezugTyp && original.bezugTyp !== "Umbuchung")
    return "Diese Buchung ist mit einer anderen Buchung verknüpft und kann nicht aufgeteilt werden.";

  const gesamt = Number(original.betrag);
  const nkBetrag = Math.round((gesamt - kautionBetrag) * 100) / 100;
  if (Math.sign(kautionBetrag) !== Math.sign(gesamt) || Math.abs(kautionBetrag) >= Math.abs(gesamt) - 0.005)
    return `Der Kautionsanteil muss dasselbe Vorzeichen wie die Buchung (${gesamt.toFixed(2)} €) haben und betragsmäßig kleiner sein.`;

  const nkArt = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "NEBENKOSTENAUSGLEICH" } });
  const gemeinsam = {
    mietvertragId: original.mietvertragId,
    datum: original.datum,
    empfaenger: original.empfaenger,
    verwendungszweck: original.verwendungszweck,
    rohdaten: original.rohdaten ?? undefined,
    importBatchId: original.importBatchId,
    aufteilungGruppeId: original.aufteilungGruppeId ?? original.id,
  };
  await prisma.$transaction(async (tx) => {
    await tx.buchung.create({ data: { ...gemeinsam, buchungsartId: original.buchungsartId, betrag: kautionBetrag } });
    await tx.buchung.create({ data: { ...gemeinsam, buchungsartId: nkArt.id, betrag: nkBetrag, jahr: nkJahr } });
    await storniereBuchung(tx, id);
  });

  revalidatePath("/kautionen");
  revalidatePath("/nebenkostenausgleich");
  revalidatePath(`/mietvertraege/${original.mietvertragId}`);
  return null;
}

const kautionsbuchungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: pflichtDatum("Datum ist erforderlich"),
  // Vorzeichen wie bei einer echten Kontobuchung: positiv = eingehend (Einzahlung Mieter,
  // Auflösung), negativ = ausgehend (Anlage, Auszahlung Mieter) — siehe dieselbe Konvention beim
  // CSV-Import in zahlungen-import.ts/kontoauszug-import/actions.ts (commitKautionsbuchungen).
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  kategorie: z.enum(KATEGORIE_WERTE, { message: "Kategorie ist erforderlich" }),
  verwendungszweck: z.string().optional(),
  // Nur bei Kategorie VIRTUELLE_AUSZAHLUNG relevant — verknüpft die neue Buchung direkt mit ihrer
  // Gegenbuchung auf der Kosten-Seite (Kostenposition.virtuelleKautionBuchungId).
  verknuepfteKostenpositionId: z.string().optional(),
});

// Verknüpft eine virtuelle Kautionsauszahlung mit der Kosten-Seite: bei einer bereits vorhandenen
// Gutschrift (negativer Betrag) nur per bezugId, bei der bezahlten Rechnung selbst (z.B. die
// Reparatur, die aus der Kaution bezahlt wurde) legt das System die Gutschrift als Gegenbuchung
// an — die Rechnung bleibt unverändert, die Ausgabe hebt sich in Kontostand, Jahresübersicht und
// Nebenkostenabrechnung auf.
async function verknuepfeMitKostenposition(
  tx: Prisma.TransactionClient,
  kostenpositionId: string,
  virtuelleAuszahlungId: string,
  gutschriftBetrag: number,
) {
  const kosten = await tx.buchung.findUniqueOrThrow({ where: { id: kostenpositionId } });
  if (Number(kosten.betrag) < 0) {
    await tx.buchung.update({ where: { id: kostenpositionId }, data: { bezugTyp: "Buchung", bezugId: virtuelleAuszahlungId } });
    return;
  }
  if (gutschriftBetrag > Number(kosten.betrag) + 0.005) {
    throw new Error("Der Kautionsbetrag ist größer als die gewählte Rechnung.");
  }
  await tx.buchung.create({
    data: {
      buchungsartId: kosten.buchungsartId,
      kostenartId: kosten.kostenartId,
      gebaeudeId: kosten.gebaeudeId,
      hausId: kosten.hausId,
      kostengruppeId: kosten.kostengruppeId,
      einheitId: kosten.einheitId,
      betrag: -gutschriftBetrag,
      jahr: kosten.jahr,
      datum: kosten.datum,
      empfaenger: kosten.empfaenger,
      verwendungszweck: `Verrechnet mit Kaution: ${kosten.verwendungszweck ?? ""}`.trim(),
      bezugTyp: "Buchung",
      bezugId: virtuelleAuszahlungId,
    },
  });
}

// Für Fälle, die sich nicht aus einer einzelnen Kontobuchung ergeben (z.B. ein einbehaltener
// Kautionsrest, der teils für eine Reparatur verwendet und teils in einer Nebenkostenabrechnung
// verrechnet wurde, ohne dass dafür je eine als "Kaution" erkennbare Auszahlung überwiesen
// wurde) — legt eine Kautionsbuchung ohne Rohdaten/Import-Bezug an, damit sich Einbehalten/Status
// auf der Kautionen-Seite trotzdem korrekt berechnen, siehe kautionsbuchungen-table.tsx
// ("manuell" statt Rohdaten-Anzeige).
export async function erstelleKautionsbuchung(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();

  const parsed = kautionsbuchungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    kategorie: formData.get("kategorie"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
    verknuepfteKostenpositionId: formData.get("verknuepfteKostenpositionId") || undefined,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { mietvertragId, datum, betrag, kategorie, verwendungszweck, verknuepfteKostenpositionId } = parsed.data;
  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: KATEGORIE_ZU_CODE[kategorie] } });

  await prisma.$transaction(async (tx) => {
    const buchung = await tx.buchung.create({
      data: { mietvertragId, buchungsartId: buchungsart.id, datum, betrag, verwendungszweck },
    });
    if (verknuepfteKostenpositionId) {
      await verknuepfeMitKostenposition(tx, verknuepfteKostenpositionId, buchung.id, Math.abs(betrag));
    }
  });

  revalidatePath("/kautionen");
  revalidatePath("/kosten");
  return null;
}

const EINBEHALT_STATUS_WERTE = [
  "UNSTRITTIG",
  "STRITTIG_OFFEN",
  "STRITTIG_BESTAETIGT",
  "STRITTIG_VERWORFEN",
] as const;
// VERRECHNET ist bewusst kein wählbarer Status (nicht in EINBEHALT_STATUS_WERTE): er entsteht nur
// über verrechneEinbehaltMitRechnung, weil dazu die virtuelle Auszahlung angelegt werden muss.
export type KautionEinbehaltStatus = (typeof EINBEHALT_STATUS_WERTE)[number] | "VERRECHNET";

const einbehaltSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  positionText: z.string().min(1, "Begründung ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  status: z.enum(EINBEHALT_STATUS_WERTE),
  // Optional: Datum, an dem der Einbehalt wirksam wurde (sonst heute), und das Abrechnungsjahr der
  // Nebenkostenabrechnung, mit der er verrechnet wurde (deckt deren Nachzahlung).
  datum: z.string().optional(),
  nkJahr: z.coerce.number().int().min(2000).max(2100).optional(),
});

// Zurückbehaltungsrecht: nur ein unstrittiger oder bestätigter Einbehalt darf eine echte Buchung
// im Journal erzeugen — ein strittig offener oder verworfener Einbehalt bleibt reine Ankündigung,
// ohne den Kautionssaldo/die Jahresübersicht zu beeinflussen, bis der Streit geklärt ist.
function sollBuchungExistieren(status: KautionEinbehaltStatus): boolean {
  return status === "UNSTRITTIG" || status === "STRITTIG_BESTAETIGT";
}

// Sorgt dafür, dass zu einem KautionEinbehalt genau dann eine KAUTION_EINBEHALT-Buchung existiert,
// wenn sein Status das erlaubt (siehe sollBuchungExistieren) — legt sie bei Bedarf neu an oder
// storniert eine bereits vorhandene, je nachdem was sich seit dem letzten Aufruf geändert hat.
// Wird nach jeder Erfassung/Statusänderung aufgerufen, damit KautionEinbehalt.buchungId immer den
// aktuellen Stand widerspiegelt.
async function synchronisiereKautionEinbehaltBuchung(
  tx: Prisma.TransactionClient,
  einbehalt: {
    id: string;
    kautionId: string;
    positionText: string;
    betrag: Prisma.Decimal;
    status: KautionEinbehaltStatus;
    buchungId: string | null;
    bezugTyp: string | null;
    bezugId: string | null;
    datum: Date | null;
  },
): Promise<void> {
  const soll = sollBuchungExistieren(einbehalt.status);
  if (soll && !einbehalt.buchungId) {
    const kaution = await tx.kaution.findUniqueOrThrow({
      where: { id: einbehalt.kautionId },
      select: { mietvertragId: true },
    });
    const buchungsart = await tx.buchungsart.findUniqueOrThrow({ where: { code: "KAUTION_EINBEHALT" } });
    const buchung = await tx.buchung.create({
      data: {
        mietvertragId: kaution.mietvertragId,
        buchungsartId: buchungsart.id,
        datum: einbehalt.datum ?? new Date(),
        betrag: -Number(einbehalt.betrag),
        verwendungszweck: einbehalt.positionText,
        // Mit einer NK-Abrechnung verrechnet: das Abrechnungsjahr steht in jahr, dann zählt diese
        // Buchung als Begleichung der Position (siehe nk-verrechnung.ts).
        jahr: einbehalt.bezugTyp === NK_VERRECHNUNG_BEZUG && einbehalt.bezugId ? Number(einbehalt.bezugId) : null,
        bezugTyp: KAUTION_EINBEHALT_BEZUG,
        bezugId: einbehalt.id,
      },
    });
    await tx.kautionEinbehalt.update({ where: { id: einbehalt.id }, data: { buchungId: buchung.id } });
  } else if (!soll && einbehalt.buchungId) {
    await storniereBuchung(tx, einbehalt.buchungId);
    await tx.kautionEinbehalt.update({ where: { id: einbehalt.id }, data: { buchungId: null } });
  }
}

// Ein einzelner, begründeter Einbehalt bei Auflösung der Kaution — siehe KautionEinbehalt im
// Schema. Setzt zwingend einen Kaution-Stammdatensatz voraus (kautionId), im Unterschied zu einer
// normalen Kautionsbuchung, die auch ohne einen solchen erfasst werden kann.
export async function erfasseKautionEinbehalt(_prev: string | null, formData: FormData): Promise<string | null> {
  await requireEditor();

  const parsed = einbehaltSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    positionText: formData.get("positionText"),
    betrag: formData.get("betrag"),
    status: formData.get("status"),
    datum: formData.get("datum") || undefined,
    nkJahr: formData.get("nkJahr") || undefined,
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { mietvertragId, positionText, betrag, status, nkJahr } = parsed.data;
  const datum = parsed.data.datum ? parseStrengesDatum(parsed.data.datum) : null;
  if (parsed.data.datum && !datum) return "Ungültiges Datum (z.B. 31.02. gibt es nicht).";

  const kaution = await prisma.kaution.findUnique({ where: { mietvertragId }, select: { id: true } });
  if (!kaution) {
    return "Für diesen Mietvertrag ist noch kein Kaution-Stammdatensatz angelegt — erst unter \"+ Kaution erfassen\" anlegen.";
  }

  await prisma.$transaction(async (tx) => {
    const einbehalt = await tx.kautionEinbehalt.create({
      data: {
        kautionId: kaution.id,
        positionText,
        betrag,
        status,
        datum,
        bezugTyp: nkJahr ? NK_VERRECHNUNG_BEZUG : null,
        bezugId: nkJahr ? String(nkJahr) : null,
      },
    });
    await synchronisiereKautionEinbehaltBuchung(tx, einbehalt);
  });

  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/nebenkostenabrechnungen", "layout");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  return null;
}

// Zurückbehaltungsrecht: ein Wechsel nach STRITTIG_BESTAETIGT/VERWORFEN ist jederzeit erlaubt (der
// Streit wird geklärt), ein Rücksprung auf STRITTIG_OFFEN ebenso (Streit wird neu aufgerollt) — die
// Anwendung verweigert hier nichts auf DB-Ebene, sondern stellt nur sicher (siehe kautionen/page.tsx),
// dass ausschließlich UNSTRITTIG/STRITTIG_BESTAETIGT in die "Einbehalten, bestätigt"-Summe einfließen,
// und sorgt dafür, dass genau für diese beiden Status eine echte Buchung im Journal existiert.
export async function aendereKautionEinbehaltStatus(id: string, status: KautionEinbehaltStatus) {
  await requireEditor();
  if (!(EINBEHALT_STATUS_WERTE as readonly string[]).includes(status)) return;
  await prisma.$transaction(async (tx) => {
    await hebeVerrechnungAuf(tx, id);
    const einbehalt = await tx.kautionEinbehalt.update({
      where: { id },
      data: { status, statusGeaendertAm: new Date() },
    });
    await synchronisiereKautionEinbehaltBuchung(tx, einbehalt);
  });
  revalidatePath("/kautionen");
  revalidatePath("/kosten");
  revalidatePath("/jahresuebersicht");
}

// Macht die Umwandlung in eine virtuelle Auszahlung rückgängig (Statuswechsel weg von VERRECHNET
// oder Löschen des Einbehalts): virtuelle Auszahlung und ihre Gutschrift auf der Kosten-Seite
// werden storniert. Eine schon vorher vorhandene, nur verknüpfte Gutschrift bleibt stehen.
async function hebeVerrechnungAuf(tx: Prisma.TransactionClient, einbehaltId: string) {
  const einbehalt = await tx.kautionEinbehalt.findUniqueOrThrow({ where: { id: einbehaltId } });
  if (!einbehalt.virtuelleAuszahlungId) return;
  const gutschriften = await tx.buchung.findMany({
    where: {
      bezugTyp: "Buchung",
      bezugId: einbehalt.virtuelleAuszahlungId,
      verwendungszweck: { startsWith: "Verrechnet mit Kaution" },
      ...AKTIVE_BUCHUNG_FILTER,
    },
    select: { id: true },
  });
  for (const g of gutschriften) await storniereBuchung(tx, g.id);
  await storniereBuchung(tx, einbehalt.virtuelleAuszahlungId);
  await tx.kautionEinbehalt.update({ where: { id: einbehaltId }, data: { virtuelleAuszahlungId: null } });
}

/**
 * Wandelt einen Einbehalt in eine virtuelle Auszahlung um, sobald die Reparatur tatsächlich
 * durchgeführt und bezahlt ist: die Kaution begleicht die gewählte Rechnung (Gutschrift auf der
 * Kosten-Seite), der Einbehalt wird VERRECHNET und bucht selbst nichts mehr — so erscheint der
 * Betrag weder doppelt (Einnahme + Kosten) noch als Kosten, die auf andere Mieter umgelegt würden.
 */
export async function verrechneEinbehaltMitRechnung(
  einbehaltId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const kostenpositionId = String(formData.get("kostenpositionId") ?? "");
  if (!kostenpositionId) return "Bitte die bezahlte Rechnung auswählen.";

  const einbehalt = await prisma.kautionEinbehalt.findUnique({
    where: { id: einbehaltId },
    include: { kaution: { select: { mietvertragId: true } } },
  });
  if (!einbehalt) return "Einbehalt nicht gefunden.";
  if (einbehalt.status === "VERRECHNET") return "Dieser Einbehalt ist bereits mit einer Rechnung verrechnet.";
  if (einbehalt.status === "STRITTIG_VERWORFEN") return "Ein verworfener Einbehalt kann nicht verrechnet werden.";
  if (einbehalt.bezugTyp === NK_VERRECHNUNG_BEZUG) return "Dieser Einbehalt ist bereits mit einer Nebenkostenabrechnung verrechnet.";

  const kosten = await prisma.buchung.findUnique({
    where: { id: kostenpositionId },
    include: { buchungsart: { select: { code: true } }, storniertZeile: { select: { id: true } } },
  });
  if (!kosten || kosten.buchungsart.code !== "KOSTENPOSITION" || kosten.storniertDurchBuchungId || kosten.storniertZeile)
    return "Die gewählte Kostenposition gibt es nicht (mehr).";

  const betrag = Number(einbehalt.betrag);
  const virtuellArt = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "KAUTION_VIRTUELLE_AUSZAHLUNG" } });
  try {
    await prisma.$transaction(async (tx) => {
      const virtuell = await tx.buchung.create({
        data: {
          mietvertragId: einbehalt.kaution.mietvertragId,
          buchungsartId: virtuellArt.id,
          datum: kosten.datum ?? einbehalt.datum ?? new Date(),
          betrag: -betrag,
          verwendungszweck: einbehalt.positionText,
        },
      });
      await verknuepfeMitKostenposition(tx, kostenpositionId, virtuell.id, betrag);
      const aktualisiert = await tx.kautionEinbehalt.update({
        where: { id: einbehaltId },
        data: { status: "VERRECHNET", statusGeaendertAm: new Date(), virtuelleAuszahlungId: virtuell.id },
      });
      await synchronisiereKautionEinbehaltBuchung(tx, aktualisiert);
    });
  } catch (e) {
    return e instanceof Error ? e.message : "Verrechnen fehlgeschlagen.";
  }

  revalidatePath("/kautionen");
  revalidatePath("/kosten");
  revalidatePath("/jahresuebersicht");
  revalidatePath(`/mietvertraege/${einbehalt.kaution.mietvertragId}`);
  return null;
}

export async function loescheKautionEinbehalt(id: string) {
  await requireEditor();
  await prisma.$transaction(async (tx) => {
    await hebeVerrechnungAuf(tx, id);
    const einbehalt = await tx.kautionEinbehalt.findUniqueOrThrow({ where: { id } });
    if (einbehalt.buchungId) {
      await storniereBuchung(tx, einbehalt.buchungId);
    }
    await tx.kautionEinbehalt.delete({ where: { id } });
  });
  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
}
