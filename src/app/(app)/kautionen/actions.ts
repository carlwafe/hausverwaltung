"use server";

import { z } from "zod";
import { pflichtDatum, parseStrengesDatum } from "@/lib/zod-datum";
import { KAUTION_EINBEHALT_BEZUG, NK_VERRECHNUNG_BEZUG } from "@/lib/nk-verrechnung";
import { stelleNkPositionSicher } from "@/lib/nk-position-sicherstellen";
import { MIETERKONTO_VERRECHNUNG_BEZUG, ladeSonderforderungSalden } from "@/lib/sonderforderungen";
import { hebeKautionAufteilungAufKern } from "@/lib/aufteilung-aufheben";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { storniereBuchung, AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";

// Freitext-Kommentar zur Kaution (Kaution.notizen), direkt in der Übersicht bearbeitbar — z.B. für
// eine Überzahlung, die zurückgefordert werden muss.
export async function speichereKautionNotiz(kautionId: string, text: string) {
  await requireEditor();
  const kaution = await prisma.kaution.update({
    where: { id: kautionId },
    data: { notizen: text.trim() || null },
    select: { mietvertragId: true },
  });
  revalidatePath("/kautionen");
  revalidatePath(`/mietvertraege/${kaution.mietvertragId}`);
}

// "Löschen" heißt beim Storno-Prinzip: die Buchung bleibt stehen, bekommt aber eine
// Gegenbuchung mit negiertem Betrag (siehe storniereBuchung) statt echt gelöscht zu werden.
export async function deleteKautionsbuchungen(ids: string[]) {
  const user = await requireEditor();
  if (ids.length === 0) return;
  const erstelltVon = benutzerLabel(user);
  await prisma.$transaction(async (tx) => {
    for (const id of ids) {
      await storniereBuchung(tx, id, erstelltVon);
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
// Liefert die Id der neuen Buchung (die Detailseite springt dorthin).
export async function aktualisiereKautionsbuchungKategorie(id: string, kategorie: KautionBuchungKategorie): Promise<string | null> {
  const user = await requireEditor();
  if (!KATEGORIE_WERTE.includes(kategorie)) return null;
  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: KATEGORIE_ZU_CODE[kategorie] } });
  const erstelltVon = benutzerLabel(user);
  const neu = await prisma.$transaction(async (tx) => {
    const original = await tx.buchung.findUniqueOrThrow({ where: { id } });
    await storniereBuchung(tx, id, erstelltVon);
    return tx.buchung.create({
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
        erstelltVon,
      },
      select: { id: true, mietvertragId: true },
    });
  });
  revalidatePath("/kautionen");
  if (neu.mietvertragId) revalidatePath(`/mietvertraege/${neu.mietvertragId}`);
  return neu.id;
}

const KAUTION_AUFTEILUNG_ARTEN = ["BK_AUSGLEICH", "MAHNGEBUEHR_KOSTEN", "MAHNGEBUEHR_FORDERUNG"] as const;
export type KautionAufteilungArt = (typeof KAUTION_AUFTEILUNG_ARTEN)[number];

const kautionAufteilungSchema = z.object({
  kautionBetrag: z.coerce.number().refine((v) => v !== 0, "Kautionsanteil darf nicht 0 sein"),
  art: z.enum(KAUTION_AUFTEILUNG_ARTEN).default("BK_AUSGLEICH"),
  nkJahr: z.coerce.number().int().min(2000, "Abrechnungsjahr fehlt").max(2100).optional(),
});

/**
 * Teilt eine Kautionsbuchung in den Kautionsanteil (gleiche Kategorie) und einen zweiten Teil auf:
 * - BK_AUSGLEICH: Sammelüberweisung mit ausgezahltem Betriebskosten-Guthaben (z.B. "Guthaben BK-Abr 2023 +
 *   Kaution") → NEBENKOSTENAUSGLEICH fürs angegebene Abrechnungsjahr (Bankvorzeichen).
 * - MAHNGEBUEHR_KOSTEN: mit der Kaution überwiesene Mahngebühr ohne Forderung (Weg b, docs/kontoauszug-import.md)
 *   → negative KOSTENPOSITION "Mahngebühren" (Einnahme; ohne Gebäude/Mieter).
 * - MAHNGEBUEHR_FORDERUNG: Zahlung auf eine offene Gebühren-Forderung (Weg a) → SONDERZAHLUNG (Bankvorzeichen).
 * Alle Teile behalten Rohdaten und Import-Bezug und teilen sich die aufteilungGruppeId (= Id des stornierten
 * Originals), damit der Kontoauszug-Import die Bankzeile weiter als importiert erkennt (siehe ladeDedupFilter).
 * Eine mit der Kaution verrechnete Nachzahlung (positiver Betriebskostenanteil) wird nicht aufgeteilt,
 * sondern als Einbehalt "Verrechnung mit Betriebskostenabrechnung" gebucht.
 */
export const teileKautionsbuchungAuf = mitMeldung(async function teileKautionsbuchungAuf(id: string, _prev: string | null, formData: FormData): Promise<string | null> {
  const user = await requireEditor();
  const parsed = kautionAufteilungSchema.safeParse({
    kautionBetrag: String(formData.get("kautionBetrag") ?? "").replace(",", "."),
    art: formData.get("art") || undefined,
    nkJahr: formData.get("nkJahr") || undefined,
  });
  if (!parsed.success) return parsed.error.issues.map((i) => i.message).join(", ");
  const { kautionBetrag, art, nkJahr } = parsed.data;

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
  // Zweiter Teil mit Bankvorzeichen (Gesamt − Kautionsanteil).
  const restBetrag = Math.round((gesamt - kautionBetrag) * 100) / 100;
  if (Math.abs(restBetrag) < 0.005)
    return `Der Kautionsanteil entspricht der ganzen Buchung (${gesamt.toFixed(2)} €) — dann gibt es nichts aufzuteilen.`;

  const gemeinsam = {
    mietvertragId: original.mietvertragId,
    datum: original.datum,
    empfaenger: original.empfaenger,
    verwendungszweck: original.verwendungszweck,
    rohdaten: original.rohdaten ?? undefined,
    importBatchId: original.importBatchId,
    aufteilungGruppeId: original.aufteilungGruppeId ?? original.id,
  };
  const erstelltVon = benutzerLabel(user);
  const kautionTeil = { ...gemeinsam, buchungsartId: original.buchungsartId, betrag: kautionBetrag, bemerkung: original.bemerkung, erstelltVon };

  if (art === "BK_AUSGLEICH") {
    if (!nkJahr) return "Abrechnungsjahr fehlt";
    // Ein positiver Betriebskostenanteil wäre eine mit der Kaution verrechnete Nachzahlung (z.B. Kaution
    // -100 €, Nachzahlung +67,34 €, überwiesen -32,66 €): die Bankzeile bleibt dann 1:1 die Auszahlung,
    // die Verrechnung ist ein Einbehalt (Kautionen → Einbehalt erfassen → Verrechnung mit BK-Abrechnung).
    if (restBetrag > 0.005 && gesamt < 0)
      return "Eine mit der Kaution verrechnete Nachzahlung wird nicht aufgeteilt: Auszahlung unverändert lassen und die Verrechnung als Einbehalt \"Verrechnung mit Betriebskostenabrechnung\" erfassen.";
    const nkArt = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "NEBENKOSTENAUSGLEICH" } });
    await prisma.$transaction(async (tx) => {
      await tx.buchung.create({ data: kautionTeil });
      await tx.buchung.create({ data: { ...gemeinsam, buchungsartId: nkArt.id, betrag: restBetrag, jahr: nkJahr, erstelltVon } });
      await storniereBuchung(tx, id, erstelltVon);
      await stelleNkPositionSicher(tx, original.mietvertragId!, nkJahr);
    });
  } else {
    // Mahngebühr: nur ein Eingang lässt sich so teilen, beide Teile positiv (z.B. 2.105 € = 2.100 € Kaution + 5 €).
    if (gesamt <= 0 || kautionBetrag <= 0 || restBetrag <= 0)
      return "Eine Mahngebühr lässt sich nur von einem Eingang abteilen: Kautionsanteil und Mahngebühr müssen positiv sein.";
    if (art === "MAHNGEBUEHR_KOSTEN") {
      const [kostenArt, mahnKostenart] = await Promise.all([
        prisma.buchungsart.findUniqueOrThrow({ where: { code: "KOSTENPOSITION" } }),
        prisma.kostenart.findFirst({ where: { name: "Mahngebühren" }, select: { id: true } }),
      ]);
      if (!mahnKostenart) return "Die Kostenart \"Mahngebühren\" fehlt.";
      await prisma.$transaction(async (tx) => {
        await tx.buchung.create({ data: kautionTeil });
        // Kostenposition: umgekehrtes Vorzeichen zum Bankbetrag (Eingang +5 € = Kostenposition −5 €), ohne
        // Mietvertrag/Gebäude und ohne Empfänger (sonst schlägt die Empfänger-Historie des Imports künftig
        // für Zahlungen dieses Mieters die Kostenart "Mahngebühren" vor).
        await tx.buchung.create({
          data: {
            buchungsartId: kostenArt.id,
            kostenartId: mahnKostenart.id,
            betrag: -restBetrag,
            datum: original.datum,
            jahr: original.datum ? original.datum.getFullYear() : new Date().getFullYear(),
            verwendungszweck: original.verwendungszweck,
            rohdaten: original.rohdaten ?? undefined,
            importBatchId: original.importBatchId,
            aufteilungGruppeId: gemeinsam.aufteilungGruppeId,
            erstelltVon,
          },
        });
        await storniereBuchung(tx, id, erstelltVon);
      });
    } else {
      const saldo = (await ladeSonderforderungSalden([original.mietvertragId])).get(original.mietvertragId);
      if (!saldo || saldo.offen < restBetrag - 0.005)
        return `Für diesen Vertrag ist keine Gebühren-Forderung über ${restBetrag.toFixed(2).replace(".", ",")} € offen — dann „Mahngebühr (Kostenposition)“ wählen oder zuerst die Forderung erfassen.`;
      const sonderArt = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "SONDERZAHLUNG" } });
      await prisma.$transaction(async (tx) => {
        await tx.buchung.create({ data: kautionTeil });
        await tx.buchung.create({ data: { ...gemeinsam, buchungsartId: sonderArt.id, betrag: restBetrag, erstelltVon } });
        await storniereBuchung(tx, id, erstelltVon);
      });
    }
  }

  revalidiereKautionAufteilung(original.mietvertragId);
  redirect("/kautionen");
});

function revalidiereKautionAufteilung(mietvertragId: string | null) {
  revalidatePath("/kautionen");
  revalidatePath("/nebenkostenausgleich");
  revalidatePath("/nebenkostenabrechnungen");
  revalidatePath("/offene-posten");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/kontostand");
  revalidatePath("/zahlungen");
  revalidatePath("/kosten");
  if (mietvertragId) revalidatePath(`/mietvertraege/${mietvertragId}`);
}

/**
 * Macht die Aufteilung einer Kautionsbuchung rückgängig (Details: hebeKautionAufteilungAufKern).
 */
export async function hebeKautionAufteilungAuf(id: string) {
  const user = await requireEditor();
  const teil = await prisma.buchung.findFirst({ where: { id, ...AKTIVE_BUCHUNG_FILTER } });
  if (!teil?.aufteilungGruppeId) throw new AktionsFehler("Diese Buchung ist nicht Teil einer Aufteilung.");
  const mietvertragId = await hebeKautionAufteilungAufKern(teil.aufteilungGruppeId, benutzerLabel(user));
  revalidiereKautionAufteilung(mietvertragId);
  redirect("/kautionen");
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

// Für Fälle, die sich nicht aus einer einzelnen Kontobuchung ergeben (z.B. ein einbehaltener
// Kautionsrest, der teils für eine Reparatur verwendet und teils in einer Betriebskostenabrechnung
// verrechnet wurde, ohne dass dafür je eine als "Kaution" erkennbare Auszahlung überwiesen
// wurde) — legt eine Kautionsbuchung ohne Rohdaten/Import-Bezug an, damit sich Einbehalten/Status
// auf der Kautionen-Seite trotzdem korrekt berechnen, siehe kautionsbuchungen-table.tsx
// ("manuell" statt Rohdaten-Anzeige).
export const erstelleKautionsbuchung = mitMeldung(async function erstelleKautionsbuchung(_prev: string | null, formData: FormData): Promise<string | null> {
  const user = await requireEditor();

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
  const { mietvertragId, datum, kategorie, verwendungszweck, verknuepfteKostenpositionId } = parsed.data;
  // Verrechnung mit Rechnung ist immer negativ (Kaution sinkt), egal wie eingegeben: Sie hebt sich im Kontostand
  // mit der Gegen-Kostenposition (−Betrag, wirkt dort +) auf. Positiv gebucht wichen Kontostand und Bank um den
  // doppelten Betrag ab (am 29.05.2026 passiert, siehe docs/zahlungen-kautionen.md).
  const betrag = kategorie === "VIRTUELLE_AUSZAHLUNG" ? -Math.abs(parsed.data.betrag) : parsed.data.betrag;
  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: KATEGORIE_ZU_CODE[kategorie] } });
  const erstelltVon = benutzerLabel(user);

  await prisma.$transaction(async (tx) => {
    const buchung = await tx.buchung.create({
      data: { mietvertragId, buchungsartId: buchungsart.id, datum, betrag, verwendungszweck, erstelltVon },
    });
    if (verknuepfteKostenpositionId) {
      const kosten = await tx.buchung.findUniqueOrThrow({ where: { id: verknuepfteKostenpositionId } });
      if (Number(kosten.betrag) < 0) {
        // Gegenbuchung (Gutschrift) existiert schon — nur verknüpfen.
        await tx.buchung.update({
          where: { id: verknuepfteKostenpositionId },
          data: { bezugTyp: "Buchung", bezugId: buchung.id },
        });
      } else {
        // Die bezahlte Rechnung selbst wurde gewählt (z.B. Reparatur, mit der Kaution verrechnet):
        // die Gutschrift als Gegenbuchung legt das System an, die Rechnung bleibt unverändert. So
        // hebt sich die Ausgabe in Kontostand, Jahresübersicht und Betriebskostenabrechnung auf.
        const gutschriftBetrag = Math.abs(betrag);
        if (gutschriftBetrag > Number(kosten.betrag) + 0.005) {
          throw new AktionsFehler("Der Kautionsbetrag ist größer als die gewählte Rechnung.");
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
            bezugId: buchung.id,
            erstelltVon,
          },
        });
      }
    }
  });

  revalidatePath("/kautionen");
  revalidatePath("/kosten");
  return null;
});

const EINBEHALT_STATUS_WERTE = [
  "UNSTRITTIG",
  "STRITTIG_OFFEN",
  "STRITTIG_BESTAETIGT",
  "STRITTIG_VERWORFEN",
] as const;
export type KautionEinbehaltStatus = (typeof EINBEHALT_STATUS_WERTE)[number];

const einbehaltSchema = z.object({
  mietvertragId: z.string().min(1, "Mietvertrag ist erforderlich"),
  positionText: z.string().min(1, "Begründung ist erforderlich"),
  betrag: z.coerce.number().positive("Betrag muss größer als 0 sein"),
  status: z.enum(EINBEHALT_STATUS_WERTE),
  // Optional: Datum, an dem der Einbehalt wirksam wurde (sonst heute), und das Abrechnungsjahr der
  // Betriebskostenabrechnung, mit der er verrechnet wurde (deckt deren Nachzahlung).
  datum: z.string().optional(),
  nkJahr: z.coerce.number().int().min(2000).max(2100).optional(),
  pauschal: z.boolean().optional(),
  // Mit einer Forderung aus dem Mieterkonto (Mietrückstand, Gebühren) verrechnet.
  mieterkonto: z.boolean().optional(),
});

// bezugTyp eines KautionEinbehalt, der mit dem Mieterkonto verrechnet wurde (siehe
// MIETERKONTO_VERRECHNUNG_BEZUG für die zugehörige Buchung).
const MIETERKONTO_BEZUG = "Mieterkonto";

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
  erstelltVon: string | null,
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
        // Mit einer BK-Abrechnung verrechnet: das Abrechnungsjahr steht in jahr, dann zählt diese
        // Buchung als Begleichung der Position (siehe nk-verrechnung.ts).
        jahr: einbehalt.bezugTyp === NK_VERRECHNUNG_BEZUG && einbehalt.bezugId ? Number(einbehalt.bezugId) : null,
        // Mit dem Mieterkonto verrechnet: eigener bezugTyp, damit die Buchung im Mietsaldo als Zahlung
        // zählt (siehe sonderforderungen.ts); bezugId verweist wie immer auf den Einbehalt.
        bezugTyp: einbehalt.bezugTyp === MIETERKONTO_BEZUG ? MIETERKONTO_VERRECHNUNG_BEZUG : KAUTION_EINBEHALT_BEZUG,
        bezugId: einbehalt.id,
        erstelltVon,
      },
    });
    await tx.kautionEinbehalt.update({ where: { id: einbehalt.id }, data: { buchungId: buchung.id } });
    // Mit einer BK-Abrechnung verrechnet, aber ohne Position dort: Platzhalter-Position anlegen.
    if (buchung.jahr) await stelleNkPositionSicher(tx, kaution.mietvertragId, buchung.jahr);
  } else if (!soll && einbehalt.buchungId) {
    await storniereBuchung(tx, einbehalt.buchungId, erstelltVon);
    await tx.kautionEinbehalt.update({ where: { id: einbehalt.id }, data: { buchungId: null } });
  }
}

// Ein einzelner, begründeter Einbehalt bei Auflösung der Kaution — siehe KautionEinbehalt im
// Schema. Setzt zwingend einen Kaution-Stammdatensatz voraus (kautionId), im Unterschied zu einer
// normalen Kautionsbuchung, die auch ohne einen solchen erfasst werden kann.
export const erfasseKautionEinbehalt = mitMeldung(async function erfasseKautionEinbehalt(_prev: string | null, formData: FormData): Promise<string | null> {
  const user = await requireEditor();

  const parsed = einbehaltSchema.safeParse({
    mietvertragId: formData.get("mietvertragId"),
    positionText: formData.get("positionText"),
    betrag: formData.get("betrag"),
    status: formData.get("status"),
    datum: formData.get("datum") || undefined,
    nkJahr: formData.get("nkJahr") || undefined,
    pauschal: formData.get("pauschal") === "on",
    mieterkonto: formData.get("mieterkonto") === "on",
  });
  if (!parsed.success) {
    return parsed.error.issues.map((i) => i.message).join(", ");
  }
  const { mietvertragId, positionText, betrag, nkJahr } = parsed.data;
  const mieterkonto = parsed.data.mieterkonto ?? false;
  if (mieterkonto && nkJahr) return "Bitte entweder mit dem Mieterkonto oder mit einer BK-Abrechnung verrechnen, nicht beides.";
  const pauschal = parsed.data.pauschal ?? false;
  // Ein pauschaler Einbehalt ist per Definition endgültig — also immer unstrittig (gebucht).
  // Pauschale Einbehalte und Verrechnungen mit dem Mieterkonto sind immer unstrittig (gebucht).
  const status = pauschal || mieterkonto ? "UNSTRITTIG" : parsed.data.status;
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
        bezugTyp: nkJahr ? NK_VERRECHNUNG_BEZUG : mieterkonto ? MIETERKONTO_BEZUG : null,
        bezugId: nkJahr ? String(nkJahr) : null,
        pauschal,
      },
    });
    await synchronisiereKautionEinbehaltBuchung(tx, einbehalt, benutzerLabel(user));
  });

  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/nebenkostenabrechnungen", "layout");
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  return null;
});

// Zurückbehaltungsrecht: ein Wechsel nach STRITTIG_BESTAETIGT/VERWORFEN ist jederzeit erlaubt (der
// Streit wird geklärt), ein Rücksprung auf STRITTIG_OFFEN ebenso (Streit wird neu aufgerollt) — die
// Anwendung verweigert hier nichts auf DB-Ebene, sondern stellt nur sicher (siehe kautionen/page.tsx),
// dass ausschließlich UNSTRITTIG/STRITTIG_BESTAETIGT in die "Einbehalten, bestätigt"-Summe einfließen,
// und sorgt dafür, dass genau für diese beiden Status eine echte Buchung im Journal existiert.
export async function aendereKautionEinbehaltStatus(id: string, status: KautionEinbehaltStatus) {
  const user = await requireEditor();
  if (!EINBEHALT_STATUS_WERTE.includes(status)) return;
  await prisma.$transaction(async (tx) => {
    const einbehalt = await tx.kautionEinbehalt.update({
      where: { id },
      // Pauschal gilt nur für unstrittige Einbehalte — wird der Streit neu aufgerollt, ist er es nicht mehr.
      data: { status, statusGeaendertAm: new Date(), ...(status !== "UNSTRITTIG" ? { pauschal: false } : {}) },
    });
    await synchronisiereKautionEinbehaltBuchung(tx, einbehalt, benutzerLabel(user));
  });
  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
}

// Wechselt zwischen vorläufigem Einbehalt (Rechnung folgt noch) und pauschalem, dem Vermieter
// endgültig gutgeschriebenem Einbehalt. Pauschal heißt immer unstrittig — ein bisher strittiger
// Einbehalt wird dabei also gebucht.
export async function setzeKautionEinbehaltPauschal(id: string, pauschal: boolean) {
  const user = await requireEditor();
  await prisma.$transaction(async (tx) => {
    const bisher = await tx.kautionEinbehalt.findUniqueOrThrow({ where: { id } });
    const einbehalt = await tx.kautionEinbehalt.update({
      where: { id },
      data: {
        pauschal,
        ...(pauschal && bisher.status !== "UNSTRITTIG" ? { status: "UNSTRITTIG" as const, statusGeaendertAm: new Date() } : {}),
      },
    });
    await synchronisiereKautionEinbehaltBuchung(tx, einbehalt, benutzerLabel(user));
  });
  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
}

export async function loescheKautionEinbehalt(id: string) {
  const user = await requireEditor();
  await prisma.$transaction(async (tx) => {
    const einbehalt = await tx.kautionEinbehalt.findUniqueOrThrow({ where: { id } });
    if (einbehalt.buchungId) {
      await storniereBuchung(tx, einbehalt.buchungId, benutzerLabel(user));
    }
    await tx.kautionEinbehalt.delete({ where: { id } });
  });
  revalidatePath("/kautionen");
  revalidatePath("/jahresuebersicht");
}
