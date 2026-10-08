"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { optionalesDatum, pflichtDatum } from "@/lib/zod-datum";
import { ermittleMieteFuerMonat } from "@/lib/soll-ist";
import { AktionsFehler, zodFehler, mitMeldung } from "@/lib/aktion";

const optionalPositiveNumber = z
  .union([z.coerce.number().positive(), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const optionalNonNegativeNumber = z
  .union([z.coerce.number().min(0), z.literal("")])
  .optional()
  .transform((v) => (v === "" || v === undefined ? undefined : v));

const mietvertragSchema = z
  .object({
    einheitId: z.string().min(1, "Einheit ist erforderlich"),
    mieterId1: z.string().min(1, "Mieter ist erforderlich"),
    mieterId2: z.string().optional(),
    beginnUnbekannt: z.coerce.boolean().optional(),
    beginn: optionalesDatum(),
    ende: optionalesDatum(),
    kaltmiete: z.coerce.number().positive("Kaltmiete muss größer als 0 sein"),
    nebenkostenVorauszahlung: z.coerce.number().min(0),
    mehrwertsteuer: optionalNonNegativeNumber,
    status: z.enum(["AKTIV", "BEENDET", "GEPLANT"]),
    kautionBetrag: optionalPositiveNumber,
    kautionAnlageform: z.enum(["SPARBUCH", "KAUTIONSKONTO", "BUERGSCHAFT", "BAR"]).optional(),
    kautionEinzahlungUnbekannt: z.coerce.boolean().optional(),
    saldovortrag: z.coerce.number().optional().default(0),
    buchhaltungAb: optionalesDatum(),
    zahlungsweg: z.enum(["LASTSCHRIFT", "UEBERWEISUNG"]).optional(),
  })
  .refine((d) => !d.mieterId2 || d.mieterId2 !== d.mieterId1, {
    message: "Der zweite Mieter darf nicht mit dem ersten identisch sein",
    path: ["mieterId2"],
  })
  .refine((d) => d.status !== "BEENDET" || d.ende !== undefined, {
    message: "Mietende ist erforderlich, wenn der Vertrag als beendet markiert wird",
    path: ["ende"],
  })
  .refine((d) => d.beginnUnbekannt || d.beginn !== undefined, {
    message: "Mietbeginn ist erforderlich (oder als unbekannt markieren)",
    path: ["beginn"],
  });

async function parseForm(formData: FormData) {
  const parsed = mietvertragSchema.safeParse({
    einheitId: formData.get("einheitId"),
    mieterId1: formData.get("mieterId1"),
    mieterId2: formData.get("mieterId2") || undefined,
    beginnUnbekannt: formData.get("beginnUnbekannt") === "on",
    beginn: formData.get("beginn") || "",
    ende: formData.get("ende") || "",
    kaltmiete: formData.get("kaltmiete"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    mehrwertsteuer: formData.get("mehrwertsteuer") || "",
    status: formData.get("status"),
    kautionBetrag: formData.get("kautionBetrag") || "",
    kautionAnlageform: formData.get("kautionAnlageform") || undefined,
    kautionEinzahlungUnbekannt: formData.get("kautionEinzahlungUnbekannt") === "on",
    saldovortrag: formData.get("saldovortrag") || "0",
    buchhaltungAb: formData.get("buchhaltungAb") || "",
    zahlungsweg: formData.get("zahlungsweg") || undefined,
  });

  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }

  const einheit = await prisma.einheit.findUnique({
    where: { id: parsed.data.einheitId },
    select: { typ: true },
  });
  if (einheit?.typ === "GARAGE" && parsed.data.mehrwertsteuer === undefined) {
    throw new AktionsFehler("Mehrwertsteuer ist bei Garagen/Stellplätzen erforderlich");
  }

  // Eigener Stichtag nur früher als der des Objekts (sonst gäbe es nichts zu überschreiben — Feld leer lassen).
  if (parsed.data.buchhaltungAb) {
    const objekt = await prisma.objekt.findFirst({ select: { buchhaltungAb: true } });
    if (objekt?.buchhaltungAb && parsed.data.buchhaltungAb >= objekt.buchhaltungAb) {
      throw new AktionsFehler(
        `„Buchhaltung ab“ muss früher sein als der Buchhaltungs-Stichtag des Objekts (${new Intl.DateTimeFormat("de-DE", { timeZone: "UTC" }).format(objekt.buchhaltungAb)}). Feld leer lassen, um den Stichtag des Objekts zu verwenden.`,
      );
    }
  }

  return parsed.data;
}

function mieterIds(data: { mieterId1: string; mieterId2?: string }) {
  return data.mieterId2 ? [data.mieterId1, data.mieterId2] : [data.mieterId1];
}

export const createMietvertrag = mitMeldung(async function createMietvertrag(formData: FormData) {
  await requireEditor();
  const data = await parseForm(formData);

  await prisma.mietvertrag.create({
    data: {
      einheit: { connect: { id: data.einheitId } },
      mieter: { connect: mieterIds(data).map((id) => ({ id })) },
      beginn: data.beginnUnbekannt ? null : data.beginn,
      ende: data.ende,
      kaltmiete: data.kaltmiete,
      nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
      mehrwertsteuer: data.mehrwertsteuer,
      status: data.status,
      saldovortrag: data.saldovortrag,
      buchhaltungAb: data.buchhaltungAb ?? null,
      zahlungsweg: data.zahlungsweg ?? null,
      ...(data.kautionBetrag !== undefined
        ? {
            kaution: {
              create: {
                betrag: data.kautionBetrag,
                anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
                einzahlungUnbekannt: data.kautionEinzahlungUnbekannt ?? false,
              },
            },
          }
        : {}),
    },
  });

  revalidatePath("/mietvertraege");
  revalidatePath("/offene-posten");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/miete-monat");
  revalidatePath("/");
  redirect("/mietvertraege");
});

export const updateMietvertrag = mitMeldung(async function updateMietvertrag(id: string, formData: FormData) {
  await requireEditor();
  const data = await parseForm(formData);

  await prisma.$transaction(async (tx) => {
    await tx.mietvertrag.update({
      where: { id },
      data: {
        einheit: { connect: { id: data.einheitId } },
        mieter: { set: mieterIds(data).map((mid) => ({ id: mid })) },
        beginn: data.beginnUnbekannt ? null : data.beginn,
        // Bewusst mit ?? null statt nur data.ende: Prisma behandelt ein undefined-Feld in
        // update() als "unverändert lassen", nicht als "auf null setzen" — ohne diesen Fallback
        // würde ein geleertes Mietende-Feld (z.B. beim Umstellen von Beendet auf Aktiv) beim
        // Speichern stillschweigend ignoriert und das alte Datum bliebe in der Datenbank stehen.
        ende: data.ende ?? null,
        kaltmiete: data.kaltmiete,
        nebenkostenVorauszahlung: data.nebenkostenVorauszahlung,
        mehrwertsteuer: data.mehrwertsteuer ?? null,
        status: data.status,
        saldovortrag: data.saldovortrag,
        // ?? null wie bei ende: ein geleertes Feld setzt den Stichtag zurück auf den des Objekts.
        buchhaltungAb: data.buchhaltungAb ?? null,
        zahlungsweg: data.zahlungsweg ?? null,
      },
    });

    if (data.kautionBetrag !== undefined) {
      await tx.kaution.upsert({
        where: { mietvertragId: id },
        create: {
          mietvertragId: id,
          betrag: data.kautionBetrag,
          anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
          einzahlungUnbekannt: data.kautionEinzahlungUnbekannt ?? false,
        },
        update: {
          betrag: data.kautionBetrag,
          anlageform: data.kautionAnlageform ?? "KAUTIONSKONTO",
          einzahlungUnbekannt: data.kautionEinzahlungUnbekannt ?? false,
        },
      });
    } else {
      // Geleertes Kautionsfeld = Kaution-Stammdatensatz entfernen (z.B. irrtümlich angelegt).
      // Kautionsbuchungen im Journal bleiben davon unberührt; erfasste Einbehalte hängen aber am
      // Datensatz und würden per Cascade mitgelöscht — dann lieber abbrechen.
      const kaution = await tx.kaution.findUnique({
        where: { mietvertragId: id },
        select: { id: true, _count: { select: { einbehalte: true } } },
      });
      if (kaution && kaution._count.einbehalte > 0) {
        throw new AktionsFehler("Kaution hat erfasste Einbehalte und kann nicht entfernt werden — erst die Einbehalte löschen.");
      }
      if (kaution) await tx.kaution.delete({ where: { id: kaution.id } });
    }
  });

  revalidatePath("/mietvertraege");
  revalidatePath(`/mietvertraege/${id}`);
  revalidatePath("/kautionen");
  revalidatePath("/offene-posten");
  revalidatePath("/jahresuebersicht");
  revalidatePath("/miete-monat");
  revalidatePath("/");
  // Zurück auf die Detailseite (nicht mehr die Liste) — passend zum Bearbeiten auf einer eigenen
  // Unterseite: nach dem Speichern soll man das Ergebnis direkt sehen, nicht erst wieder suchen.
  redirect(`/mietvertraege/${id}`);
});

export async function deleteMietvertrag(id: string) {
  await requireEditor();
  await prisma.mietvertrag.delete({ where: { id } });
  revalidatePath("/mietvertraege");
  revalidatePath("/");
  redirect("/mietvertraege");
}

function revalidateNachMieterhoehung(mietvertragId: string) {
  revalidatePath(`/mietvertraege/${mietvertragId}`);
  revalidatePath(`/mietvertraege/${mietvertragId}/nk-anpassung`);
  revalidatePath("/mietvertraege/nk-anpassung");
  revalidatePath("/mietvertraege");
  revalidatePath("/offene-posten");
  revalidatePath("/");
  revalidatePath("/jahresuebersicht");
}

const indexMonatSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Index-Monat im Format JJJJ-MM");

const mieterhoehungSchema = z.object({
  gueltigAb: pflichtDatum("Gültig ab ist erforderlich"),
  kaltmiete: z.coerce.number().min(0, "Kaltmiete darf nicht negativ sein"),
  nebenkostenVorauszahlung: z.coerce.number().min(0, "NK-Vorauszahlung darf nicht negativ sein"),
  indexMonat: indexMonatSchema.optional(),
  notizen: z.string().optional(),
});

export async function erfasseMieterhoehung(mietvertragId: string, formData: FormData) {
  await requireEditor();

  const parsed = mieterhoehungSchema.safeParse({
    gueltigAb: formData.get("gueltigAb"),
    kaltmiete: formData.get("kaltmiete"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    indexMonat: formData.get("indexMonat") || undefined,
    notizen: formData.get("notizen") || undefined,
  });
  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }

  const vertrag = await prisma.mietvertrag.findUniqueOrThrow({
    where: { id: mietvertragId },
    select: { beginn: true },
  });
  if (vertrag.beginn && parsed.data.gueltigAb < vertrag.beginn) {
    throw new AktionsFehler("Gültig ab darf nicht vor dem Mietbeginn liegen");
  }

  await prisma.mieterhoehung.create({
    data: { mietvertragId, ...parsed.data },
  });

  revalidateNachMieterhoehung(mietvertragId);
}

// Einmaliger Nachlass auf die Kaltmiete eines Monats (z.B. späterer Einzug im Einzugsmonat) — mindert
// nur das Soll dieses Monats, die vertragliche Miete bleibt (siehe Mietnachlass im Schema).
const mietnachlassSchema = z.object({
  // <input type="month"> liefert "JJJJ-MM"
  monat: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Monat ist erforderlich"),
  betrag: z.coerce.number().positive("Der Nachlass muss größer als 0 sein"),
  grund: z.string().trim().min(1, "Grund ist erforderlich"),
});

export async function erfasseMietnachlass(mietvertragId: string, formData: FormData) {
  const user = await requireEditor();

  const parsed = mietnachlassSchema.safeParse({
    monat: formData.get("monat"),
    betrag: formData.get("betrag"),
    grund: formData.get("grund"),
  });
  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }
  const jahr = Number(parsed.data.monat.slice(0, 4));
  const monat = Number(parsed.data.monat.slice(5, 7));

  const vertrag = await prisma.mietvertrag.findUniqueOrThrow({
    where: { id: mietvertragId },
    select: {
      beginn: true,
      ende: true,
      kaltmiete: true,
      nebenkostenVorauszahlung: true,
      mieterhoehungen: true,
      mietnachlaesse: { where: { jahr, monat }, select: { betrag: true } },
    },
  });
  const index = jahr * 12 + monat;
  if (vertrag.beginn && index < vertrag.beginn.getFullYear() * 12 + vertrag.beginn.getMonth() + 1) {
    throw new AktionsFehler("Der Monat liegt vor dem Mietbeginn");
  }
  if (vertrag.ende && index > vertrag.ende.getFullYear() * 12 + vertrag.ende.getMonth() + 1) {
    throw new AktionsFehler("Der Monat liegt nach dem Mietende");
  }
  const { kaltmiete } = ermittleMieteFuerMonat(
    {
      kaltmiete: Number(vertrag.kaltmiete),
      nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
      mieterhoehungen: vertrag.mieterhoehungen.map((m) => ({
        gueltigAb: m.gueltigAb,
        kaltmiete: Number(m.kaltmiete),
        nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
      })),
    },
    jahr,
    monat,
  );
  const bisher = vertrag.mietnachlaesse.reduce((sum, n) => sum + Number(n.betrag), 0);
  if (bisher + parsed.data.betrag > kaltmiete + 0.005) {
    throw new AktionsFehler(`Der Nachlass übersteigt die Kaltmiete des Monats (${kaltmiete.toFixed(2).replace(".", ",")} €)`);
  }

  await prisma.mietnachlass.create({
    data: { mietvertragId, jahr, monat, betrag: parsed.data.betrag, grund: parsed.data.grund, erstelltVon: benutzerLabel(user) },
  });

  revalidateNachMieterhoehung(mietvertragId);
  revalidatePath("/miete-monat");
}

export async function loescheMietnachlass(id: string) {
  await requireEditor();
  const nachlass = await prisma.mietnachlass.delete({ where: { id } });
  revalidateNachMieterhoehung(nachlass.mietvertragId);
  revalidatePath("/miete-monat");
}

const vorauszahlungAnpassungSchema = z.object({
  gueltigAb: pflichtDatum("Gültig ab ist erforderlich"),
  nebenkostenVorauszahlung: z.coerce.number().min(0, "NK-Vorauszahlung darf nicht negativ sein"),
  notizen: z.string().optional(),
});

/**
 * Übernimmt eine neue NK-Vorauszahlung nach einer Abrechnung (§ 560 Abs. 4 BGB) als Mieterhöhung
 * mit unveränderter Kaltmiete — die Kaltmiete wird aus dem zum gueltigAb-Monat geltenden Stand
 * übernommen. Gibt es in diesem Monat schon eine Mieterhöhung, wird nur deren NK-Betrag ersetzt.
 */
export const passeNkVorauszahlungAn = mitMeldung(async function passeNkVorauszahlungAn(mietvertragId: string, formData: FormData) {
  await requireEditor();

  const parsed = vorauszahlungAnpassungSchema.safeParse({
    gueltigAb: formData.get("gueltigAb"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    notizen: formData.get("notizen") || undefined,
  });
  if (!parsed.success) {
    throw zodFehler(parsed.error);
  }
  const { gueltigAb, nebenkostenVorauszahlung, notizen } = parsed.data;

  const vertrag = await prisma.mietvertrag.findUniqueOrThrow({
    where: { id: mietvertragId },
    select: { beginn: true, ende: true, kaltmiete: true, nebenkostenVorauszahlung: true, mieterhoehungen: true },
  });
  if (vertrag.beginn && gueltigAb < vertrag.beginn) throw new AktionsFehler("Gültig ab darf nicht vor dem Mietbeginn liegen");
  if (vertrag.ende && gueltigAb > vertrag.ende) throw new AktionsFehler("Gültig ab liegt nach dem Mietende");

  const monatIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const imSelbenMonat = vertrag.mieterhoehungen.find((m) => monatIndex(m.gueltigAb) === monatIndex(gueltigAb));
  if (imSelbenMonat) {
    await prisma.mieterhoehung.update({
      where: { id: imSelbenMonat.id },
      data: {
        nebenkostenVorauszahlung,
        notizen: [imSelbenMonat.notizen, notizen].filter(Boolean).join(" · ") || null,
      },
    });
  } else {
    const { kaltmiete } = ermittleMieteFuerMonat(
      {
        kaltmiete: Number(vertrag.kaltmiete),
        nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
        mieterhoehungen: vertrag.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
      },
      gueltigAb.getFullYear(),
      gueltigAb.getMonth() + 1,
    );
    await prisma.mieterhoehung.create({
      data: { mietvertragId, gueltigAb, kaltmiete, nebenkostenVorauszahlung, notizen },
    });
  }

  revalidateNachMieterhoehung(mietvertragId);
});

const indexerhoehungSchema = z.object({
  gueltigAb: pflichtDatum("Gültig ab ist erforderlich"),
  kaltmiete: z.coerce.number().positive("Die neue Kaltmiete muss größer als 0 sein"),
  indexMonat: indexMonatSchema,
  // Nur im kombinierten Schreiben (Index + NK-Anpassung): neue NK-Vorauszahlung im selben Monat.
  nebenkostenVorauszahlung: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0, "Die NK-Vorauszahlung darf nicht negativ sein").optional(),
  ),
  notizen: z.string().optional(),
});

/**
 * Übernimmt die Indexerhöhung (§ 557b BGB) als Mieterhöhung: neue Kaltmiete ab dem Monat von
 * `gueltigAb`, die NK-Vorauszahlung bleibt wie sie zu diesem Zeitpunkt gilt — außer das Schreiben
 * passt sie zugleich an (§ 560 Abs. 4 BGB, Feld `nebenkostenVorauszahlung`). Gibt es im selben Monat
 * schon eine Mieterhöhung, wird nur deren Kaltmiete (und ggf. NK-Betrag) ersetzt.
 */
export const uebernehmeIndexerhoehung = mitMeldung(async function uebernehmeIndexerhoehung(mietvertragId: string, formData: FormData) {
  await requireEditor();
  const parsed = indexerhoehungSchema.safeParse({
    gueltigAb: formData.get("gueltigAb"),
    kaltmiete: formData.get("kaltmiete"),
    indexMonat: formData.get("indexMonat"),
    nebenkostenVorauszahlung: formData.get("nebenkostenVorauszahlung"),
    notizen: formData.get("notizen") || undefined,
  });
  if (!parsed.success) throw zodFehler(parsed.error);
  const { gueltigAb, kaltmiete, indexMonat, nebenkostenVorauszahlung: neueNk, notizen } = parsed.data;

  const vertrag = await prisma.mietvertrag.findUniqueOrThrow({
    where: { id: mietvertragId },
    select: { beginn: true, ende: true, kaltmiete: true, nebenkostenVorauszahlung: true, mieterhoehungen: true },
  });
  if (vertrag.beginn && gueltigAb < vertrag.beginn) throw new AktionsFehler("Gültig ab darf nicht vor dem Mietbeginn liegen");
  if (vertrag.ende && gueltigAb > vertrag.ende) throw new AktionsFehler("Gültig ab liegt nach dem Mietende");

  const monatIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();
  const imSelbenMonat = vertrag.mieterhoehungen.find((m) => monatIndex(m.gueltigAb) === monatIndex(gueltigAb));
  if (imSelbenMonat) {
    await prisma.mieterhoehung.update({
      where: { id: imSelbenMonat.id },
      data: {
        kaltmiete,
        indexMonat,
        ...(neueNk !== undefined && { nebenkostenVorauszahlung: neueNk }),
        notizen: [imSelbenMonat.notizen, notizen].filter(Boolean).join(" · ") || null,
      },
    });
  } else {
    const { nebenkostenVorauszahlung } = ermittleMieteFuerMonat(
      {
        kaltmiete: Number(vertrag.kaltmiete),
        nebenkostenVorauszahlung: Number(vertrag.nebenkostenVorauszahlung),
        mieterhoehungen: vertrag.mieterhoehungen.map((m) => ({
          gueltigAb: m.gueltigAb,
          kaltmiete: Number(m.kaltmiete),
          nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
        })),
      },
      gueltigAb.getFullYear(),
      gueltigAb.getMonth() + 1,
    );
    await prisma.mieterhoehung.create({
      data: { mietvertragId, gueltigAb, kaltmiete, nebenkostenVorauszahlung: neueNk ?? nebenkostenVorauszahlung, indexMonat, notizen },
    });
  }

  revalidateNachMieterhoehung(mietvertragId);
  revalidatePath("/mietvertraege/moegliche-erhoehungen");
});

/** Zugrunde gelegten Preisindex (Monat "JJJJ-MM") einer bestehenden Mieterhöhung setzen; leer = entfernen. */
export async function setzeIndexMonat(id: string, formData: FormData): Promise<void> {
  await requireEditor();
  const roh = String(formData.get("indexMonat") ?? "").trim();
  // <input type="month"> liefert immer JJJJ-MM oder leer; alles andere wird verworfen.
  const indexMonat = indexMonatSchema.safeParse(roh).success ? roh : null;
  const mieterhoehung = await prisma.mieterhoehung.update({ where: { id }, data: { indexMonat } });
  revalidateNachMieterhoehung(mieterhoehung.mietvertragId);
  revalidatePath("/mietvertraege/moegliche-erhoehungen");
}

export async function loescheMieterhoehung(id: string) {
  await requireEditor();
  const mieterhoehung = await prisma.mieterhoehung.delete({ where: { id } });
  revalidateNachMieterhoehung(mieterhoehung.mietvertragId);
}

// Sonderforderungen (Gebühren, Buchungsart MAHNGEBUEHR) werden seit kurzem unter /zahlungen
// erfasst (siehe createZahlung in zahlungen/actions.ts, Zahlungsart "Gebühr") statt hier separat —
// die frühere erfasseSonderforderung/storniereSonderforderungBuchung sind entfallen, Stornieren
// läuft jetzt über deleteZahlung auf der Zahlungs-Detailseite.
