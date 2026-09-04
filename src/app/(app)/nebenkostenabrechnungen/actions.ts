"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import {
  berechneNebenkostenabrechnung,
  type EinheitFuerAbrechnung,
  type KostenpositionFuerAbrechnung,
  type MietvertragFuerAbrechnung,
} from "@/lib/nebenkostenabrechnung";

async function ladeBerechnungsdaten(jahr: number) {
  const [kostenpositionenRaw, einheitenRaw, mietvertraegeRaw] = await Promise.all([
    prisma.kostenposition.findMany({
      where: { jahr, kostenart: { umlagefaehig: true } },
      include: { kostenart: true },
    }),
    prisma.einheit.findMany({ include: { gebaeude: true } }),
    prisma.mietvertrag.findMany(),
  ]);

  const kostenpositionen: KostenpositionFuerAbrechnung[] = kostenpositionenRaw.map((k) => ({
    betrag: Number(k.betrag),
    gebaeudeId: k.gebaeudeId,
    hausId: k.hausId,
    verteilerschluessel: k.kostenart.standardVerteilerschluessel,
    kostenartName: k.kostenart.name,
  }));
  const einheiten: EinheitFuerAbrechnung[] = einheitenRaw.map((e) => ({
    id: e.id,
    bezeichnung: e.bezeichnung,
    typ: e.typ,
    gebaeudeId: e.gebaeudeId,
    hausId: e.gebaeude.hausId,
    wohnflaecheQm: Number(e.wohnflaecheQm),
  }));
  const mietvertraege: MietvertragFuerAbrechnung[] = mietvertraegeRaw.map((m) => ({
    id: m.id,
    einheitId: m.einheitId,
    beginn: m.beginn,
    ende: m.ende,
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
  }));

  return { kostenpositionen, einheiten, mietvertraege };
}

export async function createAbrechnung(formData: FormData) {
  await requireUser();
  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }

  const bestehend = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr } });
  if (bestehend) {
    throw new Error(`Für ${jahr} existiert bereits eine Abrechnung.`);
  }

  const { kostenpositionen, einheiten, mietvertraege } = await ladeBerechnungsdaten(jahr);
  const ergebnis = berechneNebenkostenabrechnung(jahr, kostenpositionen, einheiten, mietvertraege);

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

// Löscht alle Positionen und erzeugt sie mit dem aktuellen Kostenstand neu — z.B. wenn nach dem
// ersten Entwurf noch eine Rechnung für dasselbe Jahr nachträglich importiert wurde. Die
// Abrechnung selbst (id, Jahr, Status) bleibt erhalten.
export async function neuBerechnen(id: string) {
  await requireUser();
  const abrechnung = await prisma.nebenkostenabrechnung.findUniqueOrThrow({ where: { id } });
  const { kostenpositionen, einheiten, mietvertraege } = await ladeBerechnungsdaten(abrechnung.jahr);
  const ergebnis = berechneNebenkostenabrechnung(abrechnung.jahr, kostenpositionen, einheiten, mietvertraege);

  await prisma.$transaction([
    prisma.nebenkostenabrechnungPosition.deleteMany({ where: { abrechnungId: id } }),
    prisma.nebenkostenabrechnungPosition.createMany({
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
    }),
  ]);

  revalidatePath(`/nebenkostenabrechnungen/${id}`);
}

export async function setAbrechnungStatus(id: string, status: "ENTWURF" | "FINAL") {
  await requireUser();
  await prisma.nebenkostenabrechnung.update({ where: { id }, data: { status } });
  revalidatePath(`/nebenkostenabrechnungen/${id}`);
  revalidatePath("/nebenkostenabrechnungen");
}

export async function deleteAbrechnung(id: string) {
  await requireUser();
  await prisma.nebenkostenabrechnung.delete({ where: { id } });
  revalidatePath("/nebenkostenabrechnungen");
  redirect("/nebenkostenabrechnungen");
}
