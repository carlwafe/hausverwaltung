"use server";

import { revalidatePath } from "next/cache";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireEditor } from "@/lib/session";
import { gebaeudeOderHausLabel } from "@/lib/gebaeude-gruppen";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import { NK_AUSGLEICH_ODER_VERRECHNUNG, nkBegleichung } from "@/lib/nk-verrechnung";
import {
  berechneNebenkostenabrechnung,
  type EinheitFuerAbrechnung,
  type KostenpositionFuerAbrechnung,
  type MietvertragFuerAbrechnung,
  type VerbrauchswertFuerAbrechnung,
  type VorverteilterKostenanteilFuerAbrechnung,
  type TechemAllgemeinstromAbzugFuerAbrechnung,
} from "@/lib/nebenkostenabrechnung";

// Auch von der Detailseite genutzt (für die live geprüfte "nicht berücksichtigt"-Anzeige und die
// vorverteilten Kostenarten), nicht nur beim eigentlichen Berechnen/Neu-Berechnen.
export async function ladeBerechnungsdaten(jahr: number) {
  const [
    kostenpositionenRaw,
    einheitenRaw,
    mietvertraegeRaw,
    verbrauchswerteRaw,
    vorverteilteAnteileRaw,
    wohnflaecheKorrekturenRaw,
    techemAllgemeinstromAnteileRaw,
    allgemeinstromKostenart,
    mietzahlungenRaw,
  ] = await Promise.all([
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
      // Rückwirkende Wohnfläche-Korrekturen (siehe WohnflaecheKorrektur) — nur die, die für dieses
      // Abrechnungsjahr noch gelten (bisJahr >= jahr); ist für eine Einheit mehr als eine gesetzt,
      // zählt die mit dem kleinsten bisJahr >= jahr (die "näheste" noch gültige historische
      // Korrektur). In der Praxis kommt bislang immer höchstens eine pro Einheit vor.
      prisma.wohnflaecheKorrektur.findMany({ where: { bisJahr: { gte: jahr } }, orderBy: { bisJahr: "asc" } }),
      prisma.techemAllgemeinstromAnteil.findMany({ where: { jahr } }),
      prisma.kostenart.findFirst({ where: { name: "Allgemeinstrom" } }),
      // Mietzahlungen für Monate dieses Jahres (nach Mietperiode; fehlt sie, gilt der Monat des
      // Buchungsdatums) — Grundlage der Vorauszahlung: LEAST(Zahlungseingänge, NK-Soll).
      prisma.buchung.findMany({
        where: {
          buchungsart: { code: "MIETZAHLUNG" },
          mietvertragId: { not: null },
          OR: [
            { periodeJahr: jahr },
            { periodeJahr: null, datum: { gte: new Date(Date.UTC(jahr, 0, 1)), lt: new Date(Date.UTC(jahr + 1, 0, 1)) } },
          ],
          ...AKTIVE_BUCHUNG_FILTER,
        },
        select: { mietvertragId: true, betrag: true, datum: true, periodeJahr: true, periodeMonat: true },
      }),
    ]);
  const zahlungenNachVertrag = new Map<string, { jahr: number; monat: number; betrag: number }[]>();
  for (const z of mietzahlungenRaw) {
    const jahrZ = z.periodeJahr ?? z.datum?.getUTCFullYear();
    const monatZ = z.periodeJahr && z.periodeMonat ? z.periodeMonat : z.datum ? z.datum.getUTCMonth() + 1 : null;
    if (!z.mietvertragId || !jahrZ || !monatZ) continue;
    const liste = zahlungenNachVertrag.get(z.mietvertragId) ?? [];
    liste.push({ jahr: jahrZ, monat: monatZ, betrag: Number(z.betrag) });
    zahlungenNachVertrag.set(z.mietvertragId, liste);
  }
  const wohnflaecheKorrekturNachEinheit = new Map<string, number>();
  for (const k of wohnflaecheKorrekturenRaw) {
    if (!wohnflaecheKorrekturNachEinheit.has(k.einheitId)) {
      wohnflaecheKorrekturNachEinheit.set(k.einheitId, Number(k.wohnflaecheQm));
    }
  }

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
    wohnflaecheQm: wohnflaecheKorrekturNachEinheit.get(e.id) ?? Number(e.wohnflaecheQm),
  }));
  const mietvertraege: MietvertragFuerAbrechnung[] = mietvertraegeRaw.map((m) => ({
    id: m.id,
    einheitId: m.einheitId,
    beginn: m.beginn,
    ende: m.ende,
    nebenkostenVorauszahlung: Number(m.nebenkostenVorauszahlung),
    zahlungen: zahlungenNachVertrag.get(m.id) ?? [],
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

  // Scope der jeweiligen Techem-Kostenart wird — wie bei der Anzeige der vorverteilten
  // Kostenarten (siehe [id]/page.tsx) — aus deren jüngster Kostenposition abgeleitet, nicht neu
  // modelliert. Ohne bekannte Allgemeinstrom-Kostenart oder ohne ermittelbaren Scope bleibt der
  // Eintrag wirkungslos, statt die Berechnung zum Absturz zu bringen.
  const technischerAbzug: TechemAllgemeinstromAbzugFuerAbrechnung[] = allgemeinstromKostenart
    ? (
        await Promise.all(
          techemAllgemeinstromAnteileRaw.map(async (a) => {
            const juengste = await prisma.buchung.findFirst({
              where: { buchungsart: { code: "KOSTENPOSITION" }, kostenartId: a.kostenartId },
              orderBy: { datum: "desc" },
              select: { gebaeudeId: true, hausId: true, kostengruppeId: true },
            });
            if (!juengste) return null;
            return {
              zielKostenartId: allgemeinstromKostenart.id,
              gebaeudeId: juengste.gebaeudeId,
              hausId: juengste.hausId,
              kostengruppeId: juengste.kostengruppeId,
              betrag: Number(a.betrag),
            };
          }),
        )
      ).filter((a): a is TechemAllgemeinstromAbzugFuerAbrechnung => a !== null)
    : [];

  return { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile, technischerAbzug };
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

  const { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile, technischerAbzug } =
    await ladeBerechnungsdaten(jahr);
  const ergebnis = berechneNebenkostenabrechnung(
    jahr,
    kostenpositionen,
    einheiten,
    mietvertraege,
    verbrauchswerte,
    vorverteilteAnteile,
    technischerAbzug,
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
export type NkAusgleichSumme = {
  // Gesamtsumme aller Begleichungen (Auszahlung + Verrechnungen).
  summe: number;
  juengstesDatum: Date;
  // Auf das Mieterkonto verrechneter Anteil (MAHNGEBUEHR) und mit der Kaution verrechneter Anteil
  // (KAUTION_EINBEHALT); der Rest ist tatsächlich ausgezahlt/eingezogen (NEBENKOSTENAUSGLEICH).
  davonVerrechnet: number;
  davonKaution: number;
  // Jüngstes Datum je Art, damit die Anzeige Auszahlung und Verrechnung getrennt datieren kann.
  datumAuszahlung: Date | null;
  datumVerrechnet: Date | null;
  datumKaution: Date | null;
};

export async function ladeNebenkostenausgleichSummen(
  jahr: number,
  mietvertragIds: (string | null)[],
): Promise<Map<string, NkAusgleichSumme>> {
  const ids = [...new Set(mietvertragIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();

  // Echte Ausgleichszahlungen UND als Forderung aufs Mieterkonto verrechnete Nachzahlungen (siehe
  // nk-verrechnung.ts) — beide begleichen die Position, davonVerrechnet macht den Anteil sichtbar.
  const zahlungen = await prisma.buchung.findMany({
    where: { ...NK_AUSGLEICH_ODER_VERRECHNUNG, jahr, mietvertragId: { in: ids }, ...AKTIVE_BUCHUNG_FILTER },
    select: { mietvertragId: true, datum: true, betrag: true, buchungsart: { select: { code: true } } },
  });

  const spaeter = (a: Date | null, b: Date) => (a && a > b ? a : b);
  const ergebnis = new Map<string, NkAusgleichSumme>();
  for (const z of zahlungen) {
    if (!z.datum) continue;
    const mietvertragId = z.mietvertragId as string;
    const eintrag =
      ergebnis.get(mietvertragId) ??
      {
        summe: 0,
        juengstesDatum: z.datum,
        davonVerrechnet: 0,
        davonKaution: 0,
        datumAuszahlung: null,
        datumVerrechnet: null,
        datumKaution: null,
      };
    const betrag = nkBegleichung(z.buchungsart.code, Number(z.betrag));
    eintrag.summe += betrag;
    if (z.datum > eintrag.juengstesDatum) eintrag.juengstesDatum = z.datum;
    if (z.buchungsart.code === "MAHNGEBUEHR") {
      eintrag.davonVerrechnet += betrag;
      eintrag.datumVerrechnet = spaeter(eintrag.datumVerrechnet, z.datum);
    } else if (z.buchungsart.code === "KAUTION_EINBEHALT") {
      eintrag.davonKaution += betrag;
      eintrag.datumKaution = spaeter(eintrag.datumKaution, z.datum);
    } else {
      eintrag.datumAuszahlung = spaeter(eintrag.datumAuszahlung, z.datum);
    }
    ergebnis.set(mietvertragId, eintrag);
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
  const { kostenpositionen, einheiten, mietvertraege, verbrauchswerte, vorverteilteAnteile, technischerAbzug } =
    await ladeBerechnungsdaten(abrechnung.jahr);
  const ergebnis = berechneNebenkostenabrechnung(
    abrechnung.jahr,
    kostenpositionen,
    einheiten,
    mietvertraege,
    verbrauchswerte,
    vorverteilteAnteile,
    technischerAbzug,
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
  const datumWert = parseStrengesDatum(datum);
  if (!datumWert) throw new Error("Ungültiges Datum.");
  const betrag = typeof betragRaw === "string" ? Number(betragRaw.replace(",", ".")) : NaN;
  if (!Number.isFinite(betrag)) throw new Error("Ungültiger Betrag.");

  const buchungsart = await prisma.buchungsart.findUniqueOrThrow({ where: { code: "NEBENKOSTENAUSGLEICH" } });
  await prisma.buchung.create({
    data: {
      mietvertragId,
      buchungsartId: buchungsart.id,
      jahr: Number(jahr),
      datum: datumWert,
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

// Erfasst, wie viel einer Techem-Gesamtabrechnung (VORVERTEILT-Kostenart, z.B. "Heizkosten Haus
// 2-12") tatsächlich bereits verrechneter Allgemeinstrom ist — wird bei der Berechnung vom
// gleich-scopeten Allgemeinstrom-Pool abgezogen (siehe TechemAllgemeinstromAnteil im Schema und
// berechneEinheitAnteile). Wirkt wie die anderen Vorverteilt-Eingaben erst nach "Neu berechnen".
export async function speichereTechemAllgemeinstromAnteil(formData: FormData) {
  await requireEditor();

  const jahr = Number(formData.get("jahr"));
  if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) {
    throw new Error("Ungültiges Jahr.");
  }
  const kostenartId = String(formData.get("kostenartId") ?? "");
  if (!kostenartId) {
    throw new Error("Bitte eine Kostenart auswählen.");
  }

  const roh = formData.get("betrag");
  const text = typeof roh === "string" ? roh.trim().replace(",", ".") : "";

  if (text === "") {
    await prisma.techemAllgemeinstromAnteil.deleteMany({ where: { kostenartId, jahr } });
  } else {
    const betrag = Number(text);
    if (!Number.isFinite(betrag) || betrag < 0) {
      throw new Error(`Ungültiger Betrag: "${text}".`);
    }
    await prisma.techemAllgemeinstromAnteil.upsert({
      where: { kostenartId_jahr: { kostenartId, jahr } },
      create: { kostenartId, jahr, betrag },
      update: { betrag },
    });
  }

  const abrechnung = await prisma.nebenkostenabrechnung.findUnique({ where: { jahr }, select: { id: true } });
  if (abrechnung) revalidatePath(`/nebenkostenabrechnungen/${abrechnung.id}`);
}

// Stern "Berechnung stimmt mit der des Verwalters überein" pro Mietvertrag einer Abrechnung.
export async function toggleNkVerwalterAbgleich(abrechnungId: string, mietvertragId: string) {
  await requireEditor();
  const bestehend = await prisma.nebenkostenabrechnungPruefung.findUnique({
    where: { abrechnungId_mietvertragId: { abrechnungId, mietvertragId } },
  });
  await prisma.nebenkostenabrechnungPruefung.upsert({
    where: { abrechnungId_mietvertragId: { abrechnungId, mietvertragId } },
    create: { abrechnungId, mietvertragId, stimmtMitVerwalter: true },
    update: { stimmtMitVerwalter: !(bestehend?.stimmtMitVerwalter ?? false) },
  });
  revalidatePath(`/nebenkostenabrechnungen/${abrechnungId}`);
}

// Kurzer, frei eingegebener Kommentar pro Mietvertrag einer Abrechnung (leer = entfernt).
export async function speichereNkKommentar(abrechnungId: string, mietvertragId: string, kommentar: string) {
  await requireEditor();
  const text = kommentar.trim() || null;
  await prisma.nebenkostenabrechnungPruefung.upsert({
    where: { abrechnungId_mietvertragId: { abrechnungId, mietvertragId } },
    create: { abrechnungId, mietvertragId, kommentar: text },
    update: { kommentar: text },
  });
  revalidatePath(`/nebenkostenabrechnungen/${abrechnungId}`);
}

// Vergleichsrechnung "wie der Verwalter": abweichende Gesamtwohnfläche eines Kostenkreises. Wirkt nur
// auf die Simulation auf der Abrechnungsseite, nicht auf die gespeicherten Positionen.
export async function speichereQmAbweichung(abrechnungId: string, formData: FormData) {
  await requireEditor();
  const kreis = String(formData.get("kostenkreis") ?? "");
  const trenner = kreis.indexOf("|");
  if (trenner < 1) throw new Error("Bitte einen Kostenkreis wählen.");
  const kostenartId = kreis.slice(0, trenner);
  const scopeLabel = kreis.slice(trenner + 1);
  const qmGesamt = Number(String(formData.get("qmGesamt") ?? "").replace(",", "."));
  if (!Number.isFinite(qmGesamt) || qmGesamt <= 0) throw new Error("Bitte eine Fläche größer als 0 eintragen.");
  await prisma.nebenkostenQmAbweichung.upsert({
    where: { abrechnungId_kostenartId_scopeLabel: { abrechnungId, kostenartId, scopeLabel } },
    create: { abrechnungId, kostenartId, scopeLabel, qmGesamt },
    update: { qmGesamt },
  });
  revalidatePath(`/nebenkostenabrechnungen/${abrechnungId}`);
}

export async function loescheQmAbweichung(id: string, abrechnungId: string) {
  await requireEditor();
  await prisma.nebenkostenQmAbweichung.delete({ where: { id } });
  revalidatePath(`/nebenkostenabrechnungen/${abrechnungId}`);
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
