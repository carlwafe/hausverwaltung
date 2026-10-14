"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { AKTIVE_BUCHUNG_FILTER, storniereBuchung } from "@/lib/buchung-storno";
import { DARLEHEN_BEZUG, DARLEHEN_BUCHUNGSART, legeDarlehensrateAn } from "@/lib/darlehen";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";

const cent = (n: number) => Math.round(n * 100) / 100;

function pruefeMonat(jahr: number, monat: number) {
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100 || !Number.isInteger(monat) || monat < 1 || monat > 12) {
    throw new AktionsFehler("Bitte einen gültigen Monat wählen.");
  }
}

function revalidiere() {
  revalidatePath("/darlehen");
  revalidatePath("/darlehen/tilgungsplan");
  revalidatePath("/kosten");
  revalidatePath("/kontostand");
  revalidatePath("/jahresuebersicht");
}

// Monat, für den die Rate gezahlt wurde (Soll/Ist im Darlehenskonto). Die Zuordnung ist kein Journal und lässt sich
// deshalb ohne Storno ändern.
export const aendereRateMonat = mitMeldung(async function aendereRateMonat(ankerId: string, jahr: number, monat: number) {
  const user = await requireEditor();
  pruefeMonat(jahr, monat);
  const z = await prisma.darlehenZuordnung.findUnique({ where: { buchungId: ankerId } });
  if (!z) throw new AktionsFehler("Die Rate gehört noch zu keinem Darlehen — erst das Darlehen zuordnen.");
  if (z.sonder) throw new AktionsFehler("Eine Sonderbuchung hat keinen Monat.");
  await prisma.darlehenZuordnung.update({ where: { buchungId: ankerId }, data: { periodeJahr: jahr, periodeMonat: monat, erstelltVon: benutzerLabel(user) } });
  revalidiere();
});

export type RateTeil = { jahr: number; monat: number; rate: number; zins: number };

type Anker = Awaited<ReturnType<typeof ladeAnker>>;

// Die Rate (Tilgung oder reine Zinsbuchung) mit Zinsanteil, Darlehen und Monat.
async function ladeAnker(tx: Prisma.TransactionClient, ankerId: string) {
  const anker = await tx.buchung.findFirst({
    where: { id: ankerId, ...AKTIVE_BUCHUNG_FILTER },
    include: { buchungsart: { select: { code: true } }, darlehenZuordnung: true },
  });
  if (!anker) throw new AktionsFehler("Die Darlehensrate gibt es nicht (mehr) oder sie wurde storniert.");
  const istTilgung = anker.buchungsart.code === DARLEHEN_BUCHUNGSART;
  const zinsBuchung = istTilgung
    ? await tx.buchung.findFirst({ where: { bezugTyp: DARLEHEN_BEZUG, bezugId: ankerId, ...AKTIVE_BUCHUNG_FILTER } })
    : null;
  const zins = istTilgung ? (zinsBuchung ? Number(zinsBuchung.betrag) : 0) : Number(anker.betrag);
  const tilgung = istTilgung ? -Number(anker.betrag) : 0;
  const kostenartId = (istTilgung ? zinsBuchung?.kostenartId : anker.kostenartId) ?? null;
  return { anker, zins, tilgung, kostenartId, rate: cent(zins + tilgung) };
}

async function legeTeileAn(tx: Prisma.TransactionClient, a: Anker, teile: RateTeil[], gruppeId: string | null, erstelltVon: string | null, arten: { tilgung: string; kosten: string }) {
  const z = a.anker.darlehenZuordnung;
  if (!a.anker.datum) throw new AktionsFehler("Die Rate hat kein Datum.");
  for (const t of teile) {
    await legeDarlehensrateAn(
      tx,
      {
        datum: a.anker.datum,
        bankBetrag: -cent(t.rate),
        zinsanteil: cent(t.zins),
        kostenartId: a.kostenartId,
        empfaenger: a.anker.empfaenger,
        verwendungszweck: a.anker.verwendungszweck,
        rohdaten: (a.anker.rohdaten as Prisma.InputJsonValue | null) ?? undefined,
        importBatchId: a.anker.importBatchId,
        erstelltVon,
        darlehenId: z?.darlehenId ?? null,
        periodeJahr: t.jahr,
        periodeMonat: t.monat,
        aufteilungGruppeId: gruppeId,
      },
      arten,
    );
  }
}

async function ladeArten(tx: Prisma.TransactionClient) {
  const arten = await tx.buchungsart.findMany({ where: { code: { in: [DARLEHEN_BUCHUNGSART, "KOSTENPOSITION"] } }, select: { id: true, code: true } });
  const tilgung = arten.find((x) => x.code === DARLEHEN_BUCHUNGSART)?.id;
  const kosten = arten.find((x) => x.code === "KOSTENPOSITION")?.id;
  if (!tilgung || !kosten) throw new AktionsFehler("Die Buchungsarten für Darlehensraten fehlen.");
  return { tilgung, kosten };
}

/**
 * Teilt eine Zahlung, die für mehrere Monate galt, in je eine Rate pro Monat (Storno der Zahlung + Neuanlage der
 * Teile mit denselben Bankdaten und gemeinsamer Aufteilungsgruppe). Die Summe der Teile muss genau der Zahlung entsprechen.
 */
export const teileRateAufMonate = mitMeldung(async function teileRateAufMonate(ankerId: string, teile: RateTeil[], kostenartId?: string | null) {
  const user = await requireEditor();
  if (teile.length < 2) throw new AktionsFehler("Zum Aufteilen mindestens zwei Monate angeben.");
  if (teile.length > 24) throw new AktionsFehler("Höchstens 24 Monate.");
  const monate = new Set<number>();
  for (const t of teile) {
    pruefeMonat(t.jahr, t.monat);
    if (!(t.rate > 0)) throw new AktionsFehler("Jeder Teil braucht eine Rate größer als 0.");
    if (!(t.zins >= 0) || t.zins > t.rate + 0.005) throw new AktionsFehler("Der Zinsanteil muss zwischen 0 und der Rate liegen.");
    monate.add(t.jahr * 12 + t.monat);
  }
  if (monate.size !== teile.length) throw new AktionsFehler("Jeder Monat darf nur einmal vorkommen.");

  await prisma.$transaction(async (tx) => {
    const a = await ladeAnker(tx, ankerId);
    if (a.anker.aufteilungGruppeId) throw new AktionsFehler("Diese Zahlung ist schon aufgeteilt — erst die Aufteilung rückgängig machen.");
    if (!a.anker.darlehenZuordnung) throw new AktionsFehler("Die Rate gehört noch zu keinem Darlehen — erst das Darlehen zuordnen.");
    if (a.anker.darlehenZuordnung.sonder) throw new AktionsFehler("Eine Sonderbuchung lässt sich nicht auf Monate aufteilen.");
    if (a.tilgung < 0) throw new AktionsFehler("Diese Zahlung ist eine Rückzahlung und lässt sich nicht aufteilen.");
    const summe = cent(teile.reduce((s, t) => s + t.rate, 0));
    if (Math.abs(summe - a.rate) >= 0.005) {
      throw new AktionsFehler(`Die Teile ergeben ${summe.toFixed(2).replace(".", ",")} €, die Zahlung beträgt ${a.rate.toFixed(2).replace(".", ",")} €.`);
    }
    const mitZins = teile.some((t) => t.zins > 0);
    const kostenart = a.kostenartId ?? kostenartId ?? null;
    if (mitZins && !kostenart) throw new AktionsFehler("Für den Zinsanteil fehlt die Kostenart (Schuldzinsen).");
    if (mitZins && !a.kostenartId) {
      const k = await tx.kostenart.findUnique({ where: { id: kostenart! }, select: { anlageVZeile: true } });
      if (k?.anlageVZeile !== "SCHULDZINSEN") throw new AktionsFehler("Die Kostenart muss die Einordnung „Schuldzinsen“ haben.");
    }
    const erstelltVon = benutzerLabel(user);
    const arten = await ladeArten(tx);
    await storniereBuchung(tx, ankerId, erstelltVon);
    await legeTeileAn(tx, { ...a, kostenartId: kostenart }, [...teile].sort((x, y) => x.jahr * 12 + x.monat - (y.jahr * 12 + y.monat)), randomUUID(), erstelltVon, arten);
  });
  revalidiere();
});

/** Macht eine Aufteilung rückgängig: alle Teile der Gruppe werden storniert und als eine Rate (erster Monat) neu gebucht. */
export const fasseRatenZusammen = mitMeldung(async function fasseRatenZusammen(ankerId: string) {
  const user = await requireEditor();
  await prisma.$transaction(async (tx) => {
    const a = await ladeAnker(tx, ankerId);
    const gruppeId = a.anker.aufteilungGruppeId;
    if (!gruppeId) throw new AktionsFehler("Diese Zahlung ist nicht aufgeteilt.");
    const teile = await tx.buchung.findMany({
      where: { aufteilungGruppeId: gruppeId, ...AKTIVE_BUCHUNG_FILTER, OR: [{ buchungsart: { code: DARLEHEN_BUCHUNGSART } }, { bezugTyp: null, kostenart: { anlageVZeile: "SCHULDZINSEN" } }] },
      select: { id: true },
    });
    const anker = await Promise.all(teile.map((t) => ladeAnker(tx, t.id)));
    // Nur die Anker (Tilgungen bzw. Zinsbuchungen ohne Tilgung) zählen; die Zinsbuchung einer Tilgung hängt an ihr.
    const ankerListe = anker.filter((x) => x.anker.darlehenZuordnung);
    if (ankerListe.length === 0) throw new AktionsFehler("Die Teile der Aufteilung wurden nicht gefunden.");
    const sortiert = [...ankerListe].sort((x, y) => (x.anker.darlehenZuordnung!.periodeJahr ?? 0) * 12 + (x.anker.darlehenZuordnung!.periodeMonat ?? 0) - ((y.anker.darlehenZuordnung!.periodeJahr ?? 0) * 12 + (y.anker.darlehenZuordnung!.periodeMonat ?? 0)));
    const erster = sortiert[0];
    const summeRate = cent(ankerListe.reduce((s, x) => s + x.rate, 0));
    const summeZins = cent(ankerListe.reduce((s, x) => s + x.zins, 0));
    const erstelltVon = benutzerLabel(user);
    const arten = await ladeArten(tx);
    const zuordnung = erster.anker.darlehenZuordnung!;
    for (const x of ankerListe) await storniereBuchung(tx, x.anker.id, erstelltVon);
    await legeTeileAn(
      tx,
      { ...erster, kostenartId: erster.kostenartId ?? ankerListe.find((x) => x.kostenartId)?.kostenartId ?? null },
      [{ jahr: zuordnung.periodeJahr ?? erster.anker.datum!.getUTCFullYear(), monat: zuordnung.periodeMonat ?? erster.anker.datum!.getUTCMonth() + 1, rate: summeRate, zins: summeZins }],
      null,
      erstelltVon,
      arten,
    );
  });
  revalidiere();
});
