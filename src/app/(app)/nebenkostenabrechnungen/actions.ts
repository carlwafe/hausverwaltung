"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import {
  berechneNebenkostenabrechnung,
  type EinheitFuerAbrechnung,
  type KostenpositionFuerAbrechnung,
  type MietvertragFuerAbrechnung,
  type VerbrauchswertFuerAbrechnung,
  type VorverteilterKostenanteilFuerAbrechnung,
} from "@/lib/nebenkostenabrechnung";

async function ladeBerechnungsdaten(jahr: number) {
  const [kostenpositionenRaw, einheitenRaw, mietvertraegeRaw, verbrauchswerteRaw, vorverteilteAnteileRaw] =
    await Promise.all([
      prisma.kostenposition.findMany({
        where: { jahr, kostenart: { umlagefaehig: true } },
        include: { kostenart: true },
      }),
      prisma.einheit.findMany({ include: { gebaeude: { include: { kostengruppen: { select: { id: true } } } } } }),
      prisma.mietvertrag.findMany(),
      prisma.verbrauchswert.findMany({ where: { jahr } }),
      prisma.vorverteilterKostenanteil.findMany({ where: { jahr } }),
    ]);

  const kostenpositionen: KostenpositionFuerAbrechnung[] = kostenpositionenRaw.map((k) => ({
    betrag: Number(k.betrag),
    gebaeudeId: k.gebaeudeId,
    hausId: k.hausId,
    kostengruppeId: k.kostengruppeId,
    kostenartId: k.kostenartId,
    verteilerschluessel: k.kostenart.standardVerteilerschluessel,
    kostenartName: k.kostenart.name,
  }));
  const einheiten: EinheitFuerAbrechnung[] = einheitenRaw.map((e) => ({
    id: e.id,
    bezeichnung: e.bezeichnung,
    typ: e.typ,
    gebaeudeId: e.gebaeudeId,
    hausId: e.gebaeude.hausId,
    kostengruppenIds: e.gebaeude.kostengruppen.map((kg) => kg.id),
    wohnflaecheQm: Number(e.wohnflaecheQm),
  }));
  const mietvertraege: MietvertragFuerAbrechnung[] = mietvertraegeRaw.map((m) => ({
    id: m.id,
    einheitId: m.einheitId,
    beginn: m.beginn,
    ende: m.ende,
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
  }));
  const verbrauchswerte: VerbrauchswertFuerAbrechnung[] = verbrauchswerteRaw.map((v) => ({
    einheitId: v.einheitId,
    kostenartId: v.kostenartId,
    jahr: v.jahr,
    wert: Number(v.wert),
  }));
  const vorverteilteAnteile: VorverteilterKostenanteilFuerAbrechnung[] = vorverteilteAnteileRaw.map((v) => ({
    mietvertragId: v.mietvertragId,
    kostenartId: v.kostenartId,
    jahr: v.jahr,
    betrag: Number(v.betrag),
  }));

  return { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile };
}

export async function createAbrechnung(formData: FormData) {
  await requireEditor();
  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }

  const bestehend = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr } });
  if (bestehend) {
    throw new Error(`Für ${jahr} existiert bereits eine Abrechnung.`);
  }

  const { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile } =
    await ladeBerechnungsdaten(jahr);
  const ergebnis = berechneNebenkostenabrechnung(
    jahr,
    kostenpositionen,
    einheiten,
    mietvertraege,
    verbrauchswerte,
    vorverteilteAnteile,
  );

  const abrechnung = await prisma.nebenkostenabrechnung.create({
    data: {
      jahr,
      positionen: {
        create: ergebnis.positionen.map((p) => ({
          einheitId: p.einheitId,
          mietvertragId: p.mietvertragId,
          zeitraumVon: p.zeitraumVon,
          zeitraumBis: p.zeitraumBis,
          kostenanteilGesamt: p.kostenanteilGesamt,
          vorauszahlungGesamt: p.vorauszahlungGesamt,
          saldo: p.saldo,
        })),
      },
    },
  });

  revalidatePath("/nebenkostenabrechnungen");
  redirect(`/nebenkostenabrechnungen/${abrechnung.id}`);
}

// Legt eine Abrechnung ohne jede Position an, statt sie über berechneNebenkostenabrechnung aus
// den erfassten Kostenpositionen abzuleiten — für Jahre, deren zugrundeliegende Kostendaten
// unvollständig/unzuverlässig sind (z.B. 2024, siehe Kommentar in nebenkostenabrechnung.ts). Die
// einzelnen Positionen (Guthaben/Nachzahlung) werden danach manuell über
// fuegePositionManuellHinzu eingetragen.
export async function erstelleLeereAbrechnung(formData: FormData) {
  await requireEditor();
  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }

  const bestehend = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr } });
  if (bestehend) {
    throw new Error(`Für ${jahr} existiert bereits eine Abrechnung.`);
  }

  const abrechnung = await prisma.nebenkostenabrechnung.create({ data: { jahr } });

  revalidatePath("/nebenkostenabrechnungen");
  redirect(`/nebenkostenabrechnungen/${abrechnung.id}`);
}

// Trägt eine einzelne Position von Hand ein, ohne dass kostenanteilGesamt/vorauszahlungGesamt
// unabhängig korrekt sein müssen — für eine Abrechnung, deren zugrundeliegende Kostendaten zu
// unvollständig sind, um die eigentliche Berechnung (berechneNebenkostenabrechnung) sinnvoll
// laufen zu lassen. saldo ist hier die einzige verlässliche, direkt vom Nutzer eingegebene
// Zahl — kostenanteilGesamt/vorauszahlungGesamt werden nur so gesetzt, dass ihre Differenz
// rechnerisch zu saldo passt (0 bzw. -saldo), nicht weil sie echte Kostenanteile darstellen.
export async function fuegePositionManuellHinzu(
  abrechnungId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const mietvertragId = formData.get("mietvertragId");
  const zeitraumVon = formData.get("zeitraumVon");
  const zeitraumBis = formData.get("zeitraumBis");
  const saldoRaw = formData.get("saldo");

  if (typeof mietvertragId !== "string" || !mietvertragId) return "Bitte einen Mietvertrag wählen.";
  if (typeof zeitraumVon !== "string" || !zeitraumVon || typeof zeitraumBis !== "string" || !zeitraumBis) {
    return "Zeitraum ist erforderlich.";
  }
  const saldo = typeof saldoRaw === "string" ? Number(saldoRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(saldo)) return "Ungültiger Saldo.";

  const mietvertrag = await prisma.mietvertrag.findUnique({
    where: { id: mietvertragId },
    select: { einheitId: true },
  });
  if (!mietvertrag) return "Mietvertrag nicht gefunden.";

  try {
    await prisma.nebenkostenabrechnungPosition.create({
      data: {
        abrechnungId,
        einheitId: mietvertrag.einheitId,
        mietvertragId,
        zeitraumVon: new Date(zeitraumVon),
        zeitraumBis: new Date(zeitraumBis),
        kostenanteilGesamt: -saldo,
        vorauszahlungGesamt: 0,
        saldo,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message.includes("Unique constraint")) {
      return "Für diesen Mietvertrag existiert in dieser Abrechnung bereits eine Position.";
    }
    throw err;
  }

  revalidatePath(`/nebenkostenabrechnungen/${abrechnungId}`);
  return null;
}

// Schlüssel zum Wiederfinden einer Position über ein Neu-Berechnen hinweg — die Positions-ID
// selbst wechselt (Positionen werden komplett gelöscht und neu angelegt), Einheit+Mietvertrag
// bleiben aber stabil.
function beglichenSchluessel(einheitId: string, mietvertragId: string | null) {
  return `${einheitId}|${mietvertragId ?? ""}`;
}

// Löscht alle Positionen und erzeugt sie mit dem aktuellen Kostenstand neu — z.B. wenn nach dem
// ersten Entwurf noch eine Rechnung für dasselbe Jahr nachträglich importiert wurde. Die
// Abrechnung selbst (id, Jahr, Status) bleibt erhalten. Bereits erfasste Beglichen-Markierungen
// (beglichenAm/beglichenBetrag) werden vor dem Löschen gesichert und auf die passende neue
// Position zurückgeschrieben — sonst würde jedes "Neu berechnen" jede bereits eingetragene
// Zahlung stillschweigend verwerfen.
export async function neuBerechnen(id: string) {
  await requireEditor();
  const abrechnung = await prisma.nebenkostenabrechnung.findUniqueOrThrow({ where: { id } });
  const { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile } =
    await ladeBerechnungsdaten(abrechnung.jahr);
  const ergebnis = berechneNebenkostenabrechnung(
    abrechnung.jahr,
    kostenpositionen,
    einheiten,
    mietvertraege,
    verbrauchswerte,
    vorverteilteAnteile,
  );

  const bestehendeBeglichen = await prisma.nebenkostenabrechnungPosition.findMany({
    where: { abrechnungId: id, beglichenAm: { not: null } },
    select: { einheitId: true, mietvertragId: true, beglichenAm: true, beglichenBetrag: true },
  });
  const beglichenMap = new Map(
    bestehendeBeglichen.map((p) => [beglichenSchluessel(p.einheitId, p.mietvertragId), p]),
  );

  await prisma.$transaction(async (tx) => {
    await tx.nebenkostenabrechnungPosition.deleteMany({ where: { abrechnungId: id } });
    await tx.nebenkostenabrechnungPosition.createMany({
      data: ergebnis.positionen.map((p) => ({
        abrechnungId: id,
        einheitId: p.einheitId,
        mietvertragId: p.mietvertragId,
        zeitraumVon: p.zeitraumVon,
        zeitraumBis: p.zeitraumBis,
        kostenanteilGesamt: p.kostenanteilGesamt,
        vorauszahlungGesamt: p.vorauszahlungGesamt,
        saldo: p.saldo,
      })),
    });

    if (beglichenMap.size === 0) return;
    const neuePositionen = await tx.nebenkostenabrechnungPosition.findMany({
      where: { abrechnungId: id },
      select: { id: true, einheitId: true, mietvertragId: true },
    });
    for (const p of neuePositionen) {
      const beglichen = beglichenMap.get(beglichenSchluessel(p.einheitId, p.mietvertragId));
      if (!beglichen) continue;
      await tx.nebenkostenabrechnungPosition.update({
        where: { id: p.id },
        data: { beglichenAm: beglichen.beglichenAm, beglichenBetrag: beglichen.beglichenBetrag },
      });
    }
  });

  revalidatePath(`/nebenkostenabrechnungen/${id}`);
}

// Manuelles Markieren für Fälle außerhalb des Kontoauszug-Imports (z.B. Barzahlung, oder eine
// Buchung aus einem bereits vor diesem Feature importierten Monat). Default-Betrag = saldo
// (volle, unveränderte Begleichung), abweichender Betrag kann per Formularfeld überschrieben werden.
export async function markiereBeglichen(formData: FormData) {
  await requireEditor();
  const positionId = formData.get("positionId");
  const datum = formData.get("datum");
  const betragRaw = formData.get("betrag");
  if (typeof positionId !== "string" || !positionId || typeof datum !== "string" || !datum) {
    throw new Error("Ungültige Eingabe.");
  }

  const position = await prisma.nebenkostenabrechnungPosition.findUniqueOrThrow({ where: { id: positionId } });
  const betrag =
    typeof betragRaw === "string" && betragRaw.trim() !== "" ? Number(betragRaw) : Number(position.saldo);
  if (!Number.isFinite(betrag)) throw new Error("Ungültiger Betrag.");

  await prisma.nebenkostenabrechnungPosition.update({
    where: { id: positionId },
    data: { beglichenAm: new Date(datum), beglichenBetrag: betrag },
  });
  revalidatePath(`/nebenkostenabrechnungen/${position.abrechnungId}`);
}

// Zurücksetzen, falls versehentlich markiert.
export async function entferneBeglichen(positionId: string) {
  await requireEditor();
  const position = await prisma.nebenkostenabrechnungPosition.update({
    where: { id: positionId },
    data: { beglichenAm: null, beglichenBetrag: null },
  });
  revalidatePath(`/nebenkostenabrechnungen/${position.abrechnungId}`);
}

// Speichert die von Techem (o.ä.) schon fertig pro Mieter berechneten Beträge für eine
// VORVERTEILT-Kostenart — analog zu speichereVerbrauchswerte, nur pro Mietvertrag statt pro
// Einheit (siehe VorverteilterKostenanteil in schema.prisma). Wirkt erst nach einem "Neu
// berechnen" auf die Positionen, genau wie neu erfasste Verbrauchswerte.
export async function speichereVorverteilteKostenanteile(formData: FormData) {
  await requireEditor();

  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }
  const kostenartId = String(formData.get("kostenartId") ?? "");
  if (!kostenartId) {
    throw new Error("Bitte eine Kostenart auswählen.");
  }

  const mietvertragIds = formData.getAll("mietvertragId").map(String);
  const eintraege: { mietvertragId: string; betrag: number | null }[] = [];
  for (const mietvertragId of mietvertragIds) {
    const roh = formData.get(`betrag_${mietvertragId}`);
    const text = typeof roh === "string" ? roh.trim().replace(",", ".") : "";
    if (text === "") {
      eintraege.push({ mietvertragId, betrag: null });
      continue;
    }
    const betrag = Number(text);
    if (!Number.isFinite(betrag) || betrag < 0) {
      throw new Error(`Ungültiger Betrag für einen Mietvertrag: "${text}".`);
    }
    eintraege.push({ mietvertragId, betrag });
  }

  await prisma.$transaction(
    eintraege.map(({ mietvertragId, betrag }) =>
      betrag === null
        ? prisma.vorverteilterKostenanteil.deleteMany({ where: { mietvertragId, kostenartId, jahr } })
        : prisma.vorverteilterKostenanteil.upsert({
            where: { mietvertragId_kostenartId_jahr: { mietvertragId, kostenartId, jahr } },
            create: { mietvertragId, kostenartId, jahr, betrag },
            update: { betrag },
          }),
    ),
  );

  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr }, select: { id: true } });
  if (abrechnung) revalidatePath(`/nebenkostenabrechnungen/${abrechnung.id}`);
}

export async function setAbrechnungStatus(id: string, status: "ENTWURF" | "FINAL") {
  await requireEditor();
  await prisma.nebenkostenabrechnung.update({ where: { id }, data: { status } });
  revalidatePath(`/nebenkostenabrechnungen/${id}`);
  revalidatePath("/nebenkostenabrechnungen");
}

export async function deleteAbrechnung(id: string) {
  await requireEditor();
  await prisma.nebenkostenabrechnung.delete({ where: { id } });
  revalidatePath("/nebenkostenabrechnungen");
  redirect("/nebenkostenabrechnungen");
}
