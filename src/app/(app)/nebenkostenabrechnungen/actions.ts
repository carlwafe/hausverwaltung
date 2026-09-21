"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import {
  berechneNebenkostenabrechnung,
  type EinheitFuerAbrechnung,
  type KostenpositionFuerAbrechnung,
  type MietvertragFuerAbrechnung,
  type VerbrauchswertFuerAbrechnung,
  type VorverteilterKostenanteilFuerAbrechnung,
} from "@/lib/nebenkostenabrechnung";

// Auch von der Detailseite genutzt (für die live geprüfte "nicht berücksichtigt"-Anzeige und die
// vorverteilten Kostenarten), nicht nur beim eigentlichen Berechnen/Neu-Berechnen.
export async function ladeBerechnungsdaten(jahr: number) {
  const [kostenpositionenRaw, einheitenRaw, mietvertraegeRaw, verbrauchswerteRaw, vorverteilteAnteileRaw] =
    await Promise.all([
      prisma.buchung.findMany({
        where: { buchungsart: { code: "KOSTENPOSITION" }, jahr, kostenart: { umlagefaehig: true }, ...AKTIVE_BUCHUNG_FILTER },
        include: {
          kostenart: true,
          gebaeude: true,
          haus: { include: { gebaeude: true } },
          kostengruppe: true,
          einheit: { include: { gebaeude: true } },
        },
      }),
      prisma.einheit.findMany({ include: { gebaeude: { include: { kostengruppen: { select: { id: true } } } } } }),
      prisma.mietvertrag.findMany({
        include: { mieterhoehungen: { select: { gueltigAb: true, kaltmiete: true, nebenkostenVorauszahlung: true } } },
      }),
      prisma.verbrauchswert.findMany({ where: { jahr } }),
      prisma.vorverteilterKostenanteil.findMany({ where: { jahr }, include: { kostenart: true } }),
    ]);

  // Die where-Klausel oben filtert bereits auf kostenart: { umlagefaehig: true } — kostenart ist
  // für jede zurückgegebene Zeile also real vorhanden, auch wenn die Relation im Schema (anders
  // als bei der alten Kostenposition.kostenartId, einem Pflichtfeld) jetzt optional ist.
  const kostenpositionen: KostenpositionFuerAbrechnung[] = kostenpositionenRaw
    .filter((k) => k.kostenart !== null)
    .map((k) => ({
      betrag: Number(k.betrag),
      gebaeudeId: k.gebaeudeId,
      hausId: k.hausId,
      kostengruppeId: k.kostengruppeId,
      einheitId: k.einheitId,
      kostenartId: k.kostenartId!,
      verteilerschluessel: k.kostenart!.standardVerteilerschluessel,
      kostenartName: k.kostenart!.name,
      scopeLabel: gebaeudeOderHausLabel(k.gebaeude, k.haus, k.kostengruppe, k.einheit),
      masseinheit: k.kostenart!.masseinheit,
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
    mieterhoehungen: m.mieterhoehungen.map((mh) => ({
      gueltigAb: mh.gueltigAb,
      kaltmiete: Number(mh.kaltmiete),
      nebenkostenVorauszahlung: Number(mh.nebenkostenVorauszahlung),
    })),
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
    kostenartName: v.kostenart.name,
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
          details: p.details,
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

// Trägt eine einzelne Position von Hand ein — für eine Abrechnung, deren zugrundeliegende
// Kostendaten zu unvollständig sind, um die eigentliche Berechnung
// (berechneNebenkostenabrechnung) sinnvoll laufen zu lassen. kostenanteilGesamt und
// vorauszahlungGesamt werden direkt vom Nutzer eingegeben, saldo wird daraus berechnet
// (vorauszahlungGesamt - kostenanteilGesamt), genau wie bei einer normal berechneten Position.
export async function fuegePositionManuellHinzu(
  abrechnungId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const mietvertragId = formData.get("mietvertragId");
  const zeitraumVon = formData.get("zeitraumVon");
  const zeitraumBis = formData.get("zeitraumBis");
  const kostenanteilRaw = formData.get("kostenanteil");
  const vorauszahlungRaw = formData.get("vorauszahlung");

  if (typeof mietvertragId !== "string" || !mietvertragId) return "Bitte einen Mietvertrag wählen.";
  if (typeof zeitraumVon !== "string" || !zeitraumVon || typeof zeitraumBis !== "string" || !zeitraumBis) {
    return "Zeitraum ist erforderlich.";
  }
  const kostenanteil = typeof kostenanteilRaw === "string" ? Number(kostenanteilRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(kostenanteil)) return "Ungültiger Kostenanteil.";
  const vorauszahlung = typeof vorauszahlungRaw === "string" ? Number(vorauszahlungRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(vorauszahlung)) return "Ungültige Vorauszahlung.";
  const saldo = vorauszahlung - kostenanteil;

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
        kostenanteilGesamt: kostenanteil,
        vorauszahlungGesamt: vorauszahlung,
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

// Bearbeitet eine einzelne, bereits bestehende Position — egal ob ursprünglich manuell erfasst
// oder berechnet (ein erneutes "Neu berechnen" würde eine berechnete Position ohnehin wieder
// überschreiben, ein manueller Zwischen-Edit stört das nicht). Gleiches Eingabeschema wie
// fuegePositionManuellHinzu: kostenanteilGesamt/vorauszahlungGesamt direkt, saldo daraus berechnet.
export async function bearbeitePosition(
  positionId: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();

  const zeitraumVon = formData.get("zeitraumVon");
  const zeitraumBis = formData.get("zeitraumBis");
  const kostenanteilRaw = formData.get("kostenanteil");
  const vorauszahlungRaw = formData.get("vorauszahlung");

  if (typeof zeitraumVon !== "string" || !zeitraumVon || typeof zeitraumBis !== "string" || !zeitraumBis) {
    return "Zeitraum ist erforderlich.";
  }
  const kostenanteil = typeof kostenanteilRaw === "string" ? Number(kostenanteilRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(kostenanteil)) return "Ungültiger Kostenanteil.";
  const vorauszahlung = typeof vorauszahlungRaw === "string" ? Number(vorauszahlungRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(vorauszahlung)) return "Ungültige Vorauszahlung.";
  const saldo = vorauszahlung - kostenanteil;

  const position = await prisma.nebenkostenabrechnungPosition.update({
    where: { id: positionId },
    data: {
      zeitraumVon: new Date(zeitraumVon),
      zeitraumBis: new Date(zeitraumBis),
      kostenanteilGesamt: kostenanteil,
      vorauszahlungGesamt: vorauszahlung,
      saldo,
    },
  });

  revalidatePath(`/nebenkostenabrechnungen/${position.abrechnungId}`);
  return null;
}

// Löscht eine einzelne Position (z.B. eine versehentlich manuell angelegte) — im Unterschied zu
// deleteAbrechnung, das die ganze Abrechnung samt aller Positionen löscht.
export async function loeschePosition(positionId: string) {
  await requireEditor();
  const position = await prisma.nebenkostenabrechnungPosition.delete({ where: { id: positionId } });
  revalidatePath(`/nebenkostenabrechnungen/${position.abrechnungId}`);
}

// Gebündelte Summe je Mietvertrag für ein Abrechnungsjahr aus dem NebenkostenausgleichZahlung-
// Archiv — die einzige Quelle für den "Rückzahlung/Gutschrift"-Status auf der Detailseite, statt
// eines separat gepflegten Felds auf der Position. Vorzeichen gedreht (wie überall in diesem
// Modul): eine ausgehende Guthaben-Auszahlung (negativer Rohbetrag) wird zu einem positiven, mit
// saldo direkt vergleichbaren Wert, eine eingehende Nachzahlung zu einem negativen.
export async function ladeNebenkostenausgleichSummen(
  jahr: number,
  mietvertragIds: (string | null)[],
): Promise<Map<string, { summe: number; juengstesDatum: Date }>> {
  const ids = [...new Set(mietvertragIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();

  const zahlungen = await prisma.buchung.findMany({
    where: { buchungsart: { code: "NEBENKOSTENAUSGLEICH" }, jahr, mietvertragId: { in: ids }, ...AKTIVE_BUCHUNG_FILTER },
    select: { mietvertragId: true, datum: true, betrag: true },
  });

  const ergebnis = new Map<string, { summe: number; juengstesDatum: Date }>();
  for (const z of zahlungen) {
    if (!z.datum) continue;
    const mietvertragId = z.mietvertragId as string;
    const bisher = ergebnis.get(mietvertragId);
    const betrag = -Number(z.betrag);
    if (!bisher) {
      ergebnis.set(mietvertragId, { summe: betrag, juengstesDatum: z.datum });
    } else {
      bisher.summe += betrag;
      if (z.datum > bisher.juengstesDatum) bisher.juengstesDatum = z.datum;
    }
  }
  return ergebnis;
}

// Löscht alle Positionen und erzeugt sie mit dem aktuellen Kostenstand neu — z.B. wenn nach dem
// ersten Entwurf noch eine Rechnung für dasselbe Jahr nachträglich importiert wurde. Die
// Abrechnung selbst (id, Jahr, Status) bleibt erhalten. Anders als früher muss hier nichts mehr
// gesichert/zurückgeschrieben werden: der Rückzahlung/Gutschrift-Status hängt nur noch an
// Mietvertrag+Jahr (ladeNebenkostenausgleichSummen), nicht an der (bei jedem Neu-Berechnen
// wechselnden) Position-ID.
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
        details: p.details,
      })),
    });
  });

  revalidatePath(`/nebenkostenabrechnungen/${id}`);
}

// Manuelle Erfassung für Fälle außerhalb des Kontoauszug-Imports (z.B. Barzahlung, oder eine
// Buchung aus einem bereits vor diesem Feature importierten Monat) — legt wie der Import eine
// NebenkostenausgleichZahlung an, statt ein Feld auf der Position zu setzen. Betrag wird in
// derselben Vorzeichenlogik wie saldo entgegengenommen (positiv = ausgezahltes Guthaben, negativ =
// eingezogene Nachzahlung), intern aber im rohen Bank-Vorzeichen gespeichert wie beim Import.
export async function erfasseNebenkostenausgleichZahlungManuell(formData: FormData) {
  await requireEditor();
  const mietvertragId = formData.get("mietvertragId");
  const jahr = formData.get("jahr");
  const datum = formData.get("datum");
  const betragRaw = formData.get("betrag");
  if (
    typeof mietvertragId !== "string" ||
    !mietvertragId ||
    typeof jahr !== "string" ||
    !jahr ||
    typeof datum !== "string" ||
    !datum
  ) {
    throw new Error("Ungültige Eingabe.");
  }
  const betrag = typeof betragRaw === "string" ? Number(betragRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(betrag)) throw new Error("Ungültiger Betrag.");

  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "NEBENKOSTENAUSGLEICH" } });
  await prisma.buchung.create({
    data: {
      mietvertragId,
      buchungsartId: buchungsart.id,
      jahr: Number(jahr),
      datum: new Date(datum),
      betrag: -betrag,
      verwendungszweck: "Manuell erfasst",
    },
  });

  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr: Number(jahr) }, select: { id: true } });
  if (abrechnung) revalidatePath(`/nebenkostenabrechnungen/${abrechnung.id}`);
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

  // Leerstand-Zeilen (Beträge, die nicht auf einen Mieter umgelegt werden): der übermittelte Stand
  // ersetzt die bisherigen Zeilen dieser Kostenart und dieses Jahres komplett.
  const leerstand: { einheitId: string | null; betrag: number; notiz: string | null }[] = [];
  const leerstandRoh = formData.get("leerstand");
  if (typeof leerstandRoh === "string" && leerstandRoh.trim() !== "") {
    let geparst: unknown;
    try {
      geparst = JSON.parse(leerstandRoh);
    } catch {
      throw new Error("Leerstand-Angaben konnten nicht gelesen werden.");
    }
    if (!Array.isArray(geparst)) throw new Error("Leerstand-Angaben konnten nicht gelesen werden.");
    for (const z of geparst as { einheitId?: string | null; betrag?: string | number; notiz?: string }[]) {
      const text = String(z.betrag ?? "").trim().replace(",", ".");
      if (text === "") continue;
      const betrag = Number(text);
      if (!Number.isFinite(betrag) || betrag < 0) throw new Error(`Ungültiger Leerstand-Betrag: "${text}".`);
      leerstand.push({ einheitId: z.einheitId || null, betrag, notiz: z.notiz?.trim() || null });
    }
  }

  await prisma.$transaction([
    ...eintraege.map(({ mietvertragId, betrag }) =>
      betrag === null
        ? prisma.vorverteilterKostenanteil.deleteMany({ where: { mietvertragId, kostenartId, jahr } })
        : prisma.vorverteilterKostenanteil.upsert({
            where: { mietvertragId_kostenartId_jahr: { mietvertragId, kostenartId, jahr } },
            create: { mietvertragId, kostenartId, jahr, betrag },
            update: { betrag },
          }),
    ),
    prisma.vorverteilterLeerstand.deleteMany({ where: { kostenartId, jahr } }),
    prisma.vorverteilterLeerstand.createMany({
      data: leerstand.map((l) => ({ kostenartId, jahr, einheitId: l.einheitId, betrag: l.betrag, notiz: l.notiz })),
    }),
  ]);

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
