"use server";

import { z } from "zod";
import { pflichtDatum } from "@/lib/zod-datum";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { hebeZahlungAufteilungAuf as hebeZahlungAufteilungAufLib } from "@/lib/aufteilung-aufheben";
import { NK_VERRECHNUNG_BEZUG } from "@/lib/nk-verrechnung";

async function ladeBuchungsartId(code: string): Promise<string> {
  const art = await prisma.buchungsart.findUniqueOrThrow({ where: { code } });
  return art.id;
}

const zahlungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: pflichtDatum("Datum ist erforderlich"),
  // Nicht auf positiv beschränkt: eine Zahlung kann auch eine Erstattung/Korrektur sein (z.B. eine
  // Rücküberweisung einer Überzahlung), die als negativer Betrag geführt wird — mit .positive()
  // ließ sich eine solche, z.B. per Kontoauszug-Import bereits negativ erfasste Zahlung im
  // Bearbeiten-Formular nie wieder speichern (auch nicht bei einer reinen Verwendungszweck-
  // Änderung ohne Betragsänderung), weil der unveränderte Bestandswert die Validierung erneut
  // durchläuft und daran scheitert.
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  periodeMonat: z.coerce.number().int().min(1).max(12),
  periodeJahr: z.coerce.number().int().min(2000).max(2100),
  verwendungszweck: z.string().optional(),
});

// Eine Gebühr (z.B. Rücklastschrift-/Mahngebühr) ist keine Miete: kein Geldfluss, keine
// Mietperiode, dafür eine Pflicht-Bezeichnung (siehe frühere sonderforderungSchema in
// mietvertraege/actions.ts, hierher übernommen — die Erfassung passiert jetzt einheitlich unter
// /zahlungen statt nur auf der Mietvertragsseite).
const gebuehrSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: pflichtDatum("Datum ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  verwendungszweck: z.string().min(1, "Bezeichnung ist erforderlich"),
});

// Verrechnung einer Nebenkostenabrechnung aufs Mieterkonto: wie eine Gebühr eine MAHNGEBUEHR-
// Buchung (Forderung, kein Geldfluss, nicht EÜR-relevant), aber mit Abrechnungsjahr und Bezug auf
// die Nebenkostenabrechnung — darüber gilt die Position des Mietvertrags für dieses Jahr als
// beglichen (siehe NK_AUSGLEICH_ODER_VERRECHNUNG). Positiv = Nachzahlung (Mieter schuldet),
// negativ = Guthaben (Gutschrift aufs Mieterkonto).
const nkVerrechnungSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  datum: pflichtDatum("Datum ist erforderlich"),
  betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
  nkJahr: z.coerce.number().int().min(2000).max(2100),
  verwendungszweck: z.string().optional(),
});

export async function createZahlung(formData: FormData) {
  await requireEditor();

  if (formData.get("zahlungsart") === "NK_VERRECHNUNG") {
    const parsed = nkVerrechnungSchema.safeParse({
      mietvertragId: formData.get("mietvertragId"),
      datum: formData.get("datum"),
      betrag: formData.get("betrag"),
      nkJahr: formData.get("nkJahr"),
      verwendungszweck: formData.get("verwendungszweck") || undefined,
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { mietvertragId, nkJahr, verwendungszweck, ...rest } = parsed.data;
    const buchungsartId = await ladeBuchungsartId("MAHNGEBUEHR");
    await prisma.buchung.create({
      data: {
        ...rest,
        mietvertragId,
        buchungsartId,
        jahr: nkJahr,
        bezugTyp: NK_VERRECHNUNG_BEZUG,
        verwendungszweck:
          verwendungszweck ??
          `${rest.betrag > 0 ? "Nachzahlung" : "Guthaben"} Nebenkostenabrechnung ${nkJahr}`,
      },
    });
    revalidatePath("/zahlungen");
    revalidatePath("/offene-posten");
    revalidatePath("/jahresuebersicht");
    revalidatePath("/nebenkostenabrechnungen", "layout");
    revalidatePath(`/mietvertraege/${mietvertragId}`);
    redirect(`/mietvertraege/${mietvertragId}`);
  }

  if (formData.get("zahlungsart") === "MAHNGEBUEHR") {
    const parsed = gebuehrSchema.safeParse({
      mietvertragId: formData.get("mietvertragId"),
      datum: formData.get("datum"),
      betrag: formData.get("betrag"),
      verwendungszweck: formData.get("verwendungszweck"),
    });
    if (!parsed.success) {
      throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
    }
    const { mietvertragId, ...rest } = parsed.data;
    const buchungsartId = await ladeBuchungsartId("MAHNGEBUEHR");
    await prisma.buchung.create({ data: { ...rest, buchungsartId, mietvertragId } });
    revalidatePath("/zahlungen");
    revalidatePath("/offene-posten");
    revalidatePath(`/mietvertraege/${mietvertragId}`);
    redirect(`/mietvertraege/${mietvertragId}`);
  }

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;
  const buchungsartId = await ladeBuchungsartId("MIETZAHLUNG");

  await prisma.buchung.create({
    data: { ...rest, buchungsartId, mietvertragId },
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect(`/mietvertraege/${mietvertragId}`);
}

// "Bearbeiten" heißt beim Storno-Prinzip: die alte Buchung stornieren und mit den korrigierten
// Werten neu anlegen (siehe storniereBuchung/AKTIVE_BUCHUNG_FILTER) — importBatchId/rohdaten/
// aufteilungGruppeId wandern dabei auf die neue Zeile mit, weil sie weiterhin dieselbe reale
// Zahlung repräsentiert.
export async function updateZahlung(id: string, formData: FormData) {
  await requireEditor();

  const parsed = zahlungSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    datum: formData.get("datum"),
    betrag: formData.get("betrag"),
    periodeMonat: formData.get("periodeMonat"),
    periodeJahr: formData.get("periodeJahr"),
    verwendungszweck: formData.get("verwendungszweck") || undefined,
  });

  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((i) => i.message).join(", "));
  }

  const { mietvertragId, ...rest } = parsed.data;
  const bisherige = await prisma.buchung.findUniqueOrThrow({ where: { id } });

  await prisma.$transaction(async (tx) => {
    await storniereBuchung(tx, id);
    await tx.buchung.create({
      data: {
        ...rest,
        buchungsartId: bisherige.buchungsartId,
        mietvertragId,
        rohdaten: bisherige.rohdaten ?? undefined,
        importBatchId: bisherige.importBatchId,
        aufteilungGruppeId: bisherige.aufteilungGruppeId,
      },
    });
  });

  revalidatePath("/zahlungen");
  revalidatePath(`/zahlungen/${id}`);
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  if (bisherige.mietvertragId !== mietvertragId) {
    revalidatePath(`/mietvertraege/${bisherige.mietvertragId}`);
  }
  redirect("/zahlungen");
}

export async function deleteZahlung(id: string) {
  await requireEditor();
  const zahlung = await prisma.buchung.findUniqueOrThrow({ where: { id } });
  await prisma.$transaction(async (tx) => {
    await storniereBuchung(tx, id);
  });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath(`/mietvertraege/${zahlung.mietvertragId}`);
  redirect("/zahlungen");
}

export async function deleteZahlungen(ids: string[]) {
  await requireEditor();
  if (ids.length === 0) return;
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id);
    }
  });
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  revalidatePath("/mietvertraege");
  revalidatePath("/");
}

const aufteilungTeilSchema = z.discriminatedUnion("typ", [
  z.object({
    typ: z.literal("miete"),
    mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
    // Nicht auf positiv beschränkt: siehe gleicher Kommentar bei zahlungSchema oben — auch eine
    // negative Zahlung (z.B. eine Erstattung) kann aufgeteilt werden, ihre Teile sind dann
    // ebenfalls negativ.
    betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
    periodeMonat: z.coerce.number().int().min(1).max(12),
    periodeJahr: z.coerce.number().int().min(2000).max(2100),
    verwendungszweck: z.string().optional(),
  }),
  z.object({
    typ: z.literal("kosten"),
    kostenartId: z.string().min(1, "Kostenart ist erforderlich"),
    // Positiv wie beim Kosten-eigenen Aufteilen-Schema (teileKostenpositionAuf): der Nutzer gibt
    // den Betrag ein, der vom Zahlungseingang in diese Kostenart umgeleitet wird — das Vorzeichen
    // als Gutschrift (negativ) wird erst beim Anlegen der Kostenposition gesetzt, siehe unten.
    // Vorzeichen wie der Bankbetrag dieses Teils: positiv = Erstattung (wird zur Gutschrift),
    // negativ = Gebühr, die uns die Bank abbucht (wird zur Ausgabe, z.B. Rücklastschriftgebühr).
    betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
    beschreibung: z.string().optional(),
    // Nur bei negativem Betrag sinnvoll: die Gebühr zusätzlich als Forderung (MAHNGEBUEHR) auf dem
    // Mietkonto des Mieters vormerken, damit sie später per Sonderzahlung ausgeglichen werden kann.
    demMieterBerechnen: z.coerce.boolean().optional(),
  }),
  z.object({
    typ: z.literal("sonderzahlung"),
    mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
    betrag: z.coerce.number().refine((v) => v !== 0, "Betrag darf nicht 0 sein"),
    beschreibung: z.string().optional(),
  }),
]);

/**
 * Teilt eine als eine Buchung importierte/erfasste Zahlung (z.B. eine Überweisung, die Miete für
 * Wohnung und Garage in einer Summe zahlt, oder eine Zahlung die teilweise eine Kostenerstattung
 * wie eine Mahngebühr ist) in mehrere Mietzahlungen und/oder Kostenpositionen auf. Die
 * ursprüngliche Zahlung wird storniert statt echt gelöscht (Storno-Prinzip) — dadurch bleiben
 * Soll/Ist und offene Posten automatisch korrekt, ohne dass die Original-Buchung spurlos
 * verschwindet. Ein Kosten-Teil wird als negative Kostenposition (Gutschrift) gebucht, exakt wie
 * eine Kleinreparatur-Erstattung beim Kontoauszug-Import (siehe mapKostenRows in
 * src/lib/import/kosten-import.ts). Analog zu teileKostenpositionAuf in kosten/actions.ts.
 */
export async function teileZahlungAuf(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const raw = formData.get("teile");
  if (typeof raw !== "string") return "Keine Aufteilung übermittelt.";

  let teileRoh: unknown;
  try {
    teileRoh = JSON.parse(raw);
  } catch {
    return "Aufteilung konnte nicht gelesen werden.";
  }

  const parsed = z.array(aufteilungTeilSchema).min(1, "Mindestens ein Teil nötig").safeParse(teileRoh);
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const teile = parsed.data;

  const original = await prisma.buchung.findUnique({ where: { id } });
  if (!original) return "Zahlung nicht gefunden.";

  const summeTeile = teile.reduce((sum, t) => sum + t.betrag, 0);
  if (Math.abs(summeTeile - Number(original.betrag)) > 0.01) {
    return `Die Summe der Teile (${summeTeile.toFixed(2)} €) muss dem Gesamtbetrag (${Number(original.betrag).toFixed(2)} €) entsprechen.`;
  }

  const gruppeId = original.aufteilungGruppeId ?? original.id;
  const mieteTeile = teile.filter((t) => t.typ === "miete");
  const kostenTeile = teile.filter((t) => t.typ === "kosten");
  const sonderTeile = teile.filter((t) => t.typ === "sonderzahlung");
  const betroffeneMietvertraege = new Set([
    original.mietvertragId,
    ...mieteTeile.map((t) => t.mietvertragId),
    ...sonderTeile.map((t) => t.mietvertragId),
  ]);

  const [mietzahlungArt, kostenpositionArt, mahngebuehrArt, sonderzahlungArt] = await Promise.all([
    prisma.buchungsart.findUniqueOrThrow({ where: { code: "MIETZAHLUNG" } }),
    prisma.buchungsart.findUniqueOrThrow({ where: { code: "KOSTENPOSITION" } }),
    prisma.buchungsart.findUniqueOrThrow({ where: { code: "MAHNGEBUEHR" } }),
    prisma.buchungsart.findUniqueOrThrow({ where: { code: "SONDERZAHLUNG" } }),
  ]);

  await prisma.$transaction(async (tx) => {
    for (const teil of mieteTeile) {
      await tx.buchung.create({
        data: {
          mietvertragId: teil.mietvertragId,
          buchungsartId: mietzahlungArt.id,
          datum: original.datum,
          betrag: teil.betrag,
          periodeMonat: teil.periodeMonat,
          periodeJahr: teil.periodeJahr,
          verwendungszweck: teil.verwendungszweck || original.verwendungszweck,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
    }
    for (const teil of sonderTeile) {
      await tx.buchung.create({
        data: {
          mietvertragId: teil.mietvertragId,
          buchungsartId: sonderzahlungArt.id,
          datum: original.datum,
          betrag: teil.betrag,
          verwendungszweck: teil.beschreibung || original.verwendungszweck,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
    }
    for (const teil of kostenTeile) {
      const kostenBuchung = await tx.buchung.create({
        data: {
          buchungsartId: kostenpositionArt.id,
          kostenartId: teil.kostenartId,
          betrag: -teil.betrag,
          verwendungszweck: teil.beschreibung || original.verwendungszweck,
          jahr: original.datum ? original.datum.getFullYear() : new Date().getFullYear(),
          datum: original.datum,
          rohdaten: original.rohdaten ?? undefined,
          importBatchId: original.importBatchId,
          aufteilungGruppeId: gruppeId,
        },
      });
      if (teil.demMieterBerechnen && teil.betrag < 0 && original.mietvertragId) {
        // Bewusst ohne aufteilungGruppeId: die Forderung ist kein Teil des Bankbetrags, sonst
        // würde "Aufteilung rückgängig machen" (Summe über die Gruppe) sie mitzählen.
        await tx.buchung.create({
          data: {
            mietvertragId: original.mietvertragId,
            buchungsartId: mahngebuehrArt.id,
            datum: original.datum,
            betrag: -teil.betrag,
            verwendungszweck: teil.beschreibung || original.verwendungszweck,
            bezugTyp: "Buchung",
            bezugId: kostenBuchung.id,
          },
        });
      }
    }
    await storniereBuchung(tx, id);
  });

  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  if (kostenTeile.length > 0) revalidatePath("/kosten");
  for (const mietvertragId of betroffeneMietvertraege) revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect("/zahlungen");
}

// Macht eine Aufteilung wieder rückgängig: alle Zahlungen derselben aufteilungGruppeId werden
// storniert und zu einer einzigen neuen Zahlung zusammengeführt (Betrag = Summe), unter dem
// Mietvertrag/der Periode der Zahlung, von der aus die Aktion aufgerufen wurde.
export async function hebeZahlungAufteilungAuf(zahlungId: string) {
  await requireEditor();
  const zahlung = await prisma.buchung.findFirst({ where: { id: zahlungId, ...AKTIVE_BUCHUNG_FILTER } });
  if (!zahlung) throw new Error("Zahlung nicht gefunden.");
  if (!zahlung.aufteilungGruppeId) throw new Error("Diese Zahlung ist nicht Teil einer Aufteilung.");

  // Kostenpositionen aus einer gemischten Aufteilung (Miete + Kosten) gehören ebenfalls zur Gruppe
  // und gehen mit umgekehrtem Vorzeichen in die Summe ein — Details siehe aufteilung-aufheben.ts.
  const betroffeneMietvertraege = await hebeZahlungAufteilungAufLib(zahlung.aufteilungGruppeId, zahlung.id);
  revalidatePath("/kosten");
  revalidatePath("/zahlungen");
  revalidatePath("/offene-posten");
  for (const mietvertragId of betroffeneMietvertraege) revalidatePath(`/mietvertraege/${mietvertragId}`);
  redirect("/zahlungen");
}
