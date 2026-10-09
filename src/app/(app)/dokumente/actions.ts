"use server";

import { revalidatePath } from "next/cache";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { prisma } from "@/lib/prisma";
import { benutzerLabel, requireEditor } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { ERKENNUNG_ARTEN, istGueltigeArt } from "@/lib/dokumente-anzeige";
import { erkenneDokumentInhalt, istErkennbar, istGueltigeIban } from "@/lib/dokument-erkennung";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";
import { speichereDatei, loescheDatei, leseDatei } from "@/lib/storage";
import { ladeBezugOptionen } from "@/lib/dokumente-uebersicht";
import { ladeBuchungVorschlaege } from "@/lib/dokument-zuordnung";

type UploadZiel =
  | { buchungId: string; revalidatePath: string }
  | { mietvertragId: string; revalidatePath: string }
  | { einheitId: string; revalidatePath: string }
  | { dienstleisterId: string; revalidatePath: string }
  | { ticketId: string; revalidatePath: string }
  // Eingang: noch ohne Bezug, wird später zugeordnet (Seite /dokumente/[id]).
  | { eingang: true; revalidatePath: string }
  // Allgemeines Dokument ohne Bezug, nur über einen frei benannten Ordner einsortiert.
  | { ordner: string | null; revalidatePath: string };

// "YYYY-MM-DD" aus einem Datumsfeld als UTC-Mitternacht (wie alle Datumswerte der App); leer/ungültig
// = kein Belegdatum.
function parseBelegDatum(wert: FormDataEntryValue | string | null): Date | null {
  if (typeof wert !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(wert)) return null;
  return parseStrengesDatum(wert);
}

function datumOderNull(iso: string | null | undefined): Date | null {
  return iso ? parseBelegDatum(iso) : null;
}

// Liest den Inhalt per Claude und trägt die Ergebnisse in die noch leeren Labels ein (vorhandene Angaben
// des Nutzers werden nie überschrieben); das Rohergebnis bleibt als Vorschlag am Dokument stehen.
async function fuehreErkennungAus(id: string, inhalt: Buffer, mimeType: string): Promise<void> {
  const kostenarten = await prisma.kostenart.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  const e = await erkenneDokumentInhalt(inhalt, mimeType, { kostenarten });
  const d = await prisma.dokument.findUniqueOrThrow({ where: { id } });
  await prisma.dokument.update({
    where: { id },
    data: {
      erkennung: e as unknown as Prisma.InputJsonValue,
      erkanntAm: new Date(),
      art: d.art ?? e.typ ?? undefined,
      belegDatum: d.belegDatum ?? datumOderNull(e.rechnungsdatum) ?? undefined,
      aussteller: d.aussteller ?? e.aussteller ?? undefined,
      rechnungsnummer: d.rechnungsnummer ?? e.rechnungsnummer ?? undefined,
      betrag: d.betrag ?? e.betrag ?? undefined,
      leistungVon: d.leistungVon ?? datumOderNull(e.leistungVon) ?? undefined,
      leistungBis: d.leistungBis ?? datumOderNull(e.leistungBis) ?? undefined,
      kostenjahr: d.kostenjahr ?? e.kostenjahr ?? undefined,
      iban: d.iban ?? e.iban ?? undefined,
      kostenartId: d.kostenartId ?? e.kostenartId ?? undefined,
      adressat: d.adressat ?? e.adressat ?? undefined,
      objektHinweis: d.objektHinweis ?? e.objekt ?? undefined,
    },
  });
}

function erkennungsMeldung(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.includes("ANTHROPIC_API_KEY") ? "ANTHROPIC_API_KEY fehlt in der Umgebung." : text.slice(0, 200);
}

// Das "file"-Feld kann mehrfach vorkommen (z.B. mehrere Einheit-Fotos auf einmal, siehe
// FotosSektion) — hier bewusst per getAll statt get, damit ein- und mehrteilige Uploads
// dieselbe Action nutzen können.
export const uploadDokument = mitMeldung(async function uploadDokument(
  ziel: UploadZiel,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  const user = await requireEditor();

  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) {
    return "Bitte eine Datei auswählen.";
  }

  // Optionales Belegdatum (Datum des Belegs selbst), gilt für alle Dateien dieses Uploads.
  const belegDatum = parseBelegDatum(formData.get("belegDatum"));
  // Optionale Dokumentart (leer = nicht angegeben), gilt für alle Dateien dieses Uploads.
  const artWert = formData.get("art");
  const art = istGueltigeArt(artWert) ? artWert : null;

  // Texterkennung beim Hochladen nur für Rechnungen/Bescheide/Abrechnungen und nur auf Wunsch (Häkchen);
  // schlägt sie fehl, bleibt das Dokument trotzdem gespeichert.
  const erkennen = formData.get("erkennen") === "1" && art !== null && ERKENNUNG_ARTEN.includes(art);
  let erkennungsFehler: string | null = null;

  for (const file of files) {
    const inhalt = Buffer.from(await file.arrayBuffer());
    const speicherpfad = await speichereDatei(inhalt, file.name);
    const angelegt = await prisma.dokument.create({
      data: {
        dateiname: file.name,
        speicherpfad,
        mimeType: file.type || null,
        groesseBytes: file.size,
        buchungId: "buchungId" in ziel ? ziel.buchungId : undefined,
        mietvertragId: "mietvertragId" in ziel ? ziel.mietvertragId : undefined,
        einheitId: "einheitId" in ziel ? ziel.einheitId : undefined,
        dienstleisterId: "dienstleisterId" in ziel ? ziel.dienstleisterId : undefined,
        ticketId: "ticketId" in ziel ? ziel.ticketId : undefined,
        ordner: "ordner" in ziel ? ziel.ordner : undefined,
        eingang: "eingang" in ziel ? true : undefined,
        art,
        hochgeladenVon: user.email ?? user.name ?? null,
        belegDatum,
      },
    });
    if (erkennen && istErkennbar(file.type)) {
      try {
        await fuehreErkennungAus(angelegt.id, inhalt, file.type);
      } catch (err) {
        console.error("Texterkennung fehlgeschlagen", err);
        erkennungsFehler = erkennungsMeldung(err);
      }
    }
  }

  revalidatePath(ziel.revalidatePath);
  revalidatePath("/dokumente");
  return erkennungsFehler
    ? `Hochgeladen, aber die Texterkennung ist fehlgeschlagen (${erkennungsFehler}). Auf der Detailseite lässt sie sich erneut starten.`
    : null;
});

export async function deleteDokument(id: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();

  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) return;
  // Löschsperre: Belege an Kostenbuchungen (Nachweis für Finanzamt und Nebenkostenabrechnung) werden nur
  // ausgeblendet. Die Oberfläche bietet dort kein „Löschen“ an; das hier schützt vor direkten Aufrufen.
  if (dokument.buchungId) throw new Error("Kostenbelege können nicht gelöscht, nur ausgeblendet werden.");

  await prisma.dokument.delete({ where: { id } });
  await loescheDatei(dokument.speicherpfad);
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

// Kostenbelege ausblenden statt löschen (und wiederherstellen); wer wann, bleibt am Dokument stehen.
export async function blendeDokumentAus(id: string, revalidatePathValue: string): Promise<void> {
  const user = await requireEditor();
  await prisma.dokument.updateMany({
    where: { id, buchungId: { not: null }, ausgeblendetAm: null },
    data: { ausgeblendetAm: new Date(), ausgeblendetVon: benutzerLabel(user) },
  });
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

export async function stelleDokumentWiederHer(id: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();
  await prisma.dokument.updateMany({
    where: { id, buchungId: { not: null } },
    data: { ausgeblendetAm: null, ausgeblendetVon: null },
  });
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

export async function aendereBelegDatum(id: string, datum: string, revalidatePathValue: string): Promise<void> {
  await requireEditor();
  await prisma.dokument.update({ where: { id }, data: { belegDatum: parseBelegDatum(datum) } });
  revalidatePath(revalidatePathValue);
  revalidatePath("/dokumente");
}

// Auswahllisten des Upload-Formulars (Mietverträge, Einheiten, Dienstleister, Tickets): erst beim
// Bedarf nachgeladen, statt bei jedem Seitenaufruf vier Abfragen zu fahren.
export async function ladeUploadOptionen() {
  await requireEditor();
  return ladeBezugOptionen();
}

const ZENTRAL_BEREICHE = ["eingang", "mietvertraege", "einheiten", "dienstleister", "tickets", "allgemein"] as const;

// Upload von der Seite /dokumente: Bereich + Bezug kommen aus dem Formular. Je Upload nur eine
// Datei (4-MB-Limit wegen Vercels Request-Größe, siehe upload-limits.ts).
export const uploadDokumentZentral = mitMeldung(async function uploadDokumentZentral(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const bereich = formData.get("bereich");
  const bezugId = String(formData.get("bezugId") ?? "");
  const ordner = String(formData.get("ordner") ?? "").trim();
  if (!ZENTRAL_BEREICHE.some((b) => b === bereich)) throw new AktionsFehler("Bitte einen Bereich wählen.");

  const datei = formData.get("file");
  if (datei instanceof File && datei.size > MAX_DOKUMENT_GROESSE_BYTES) {
    throw new AktionsFehler(`Die Datei darf maximal ${MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024)} MB groß sein.`);
  }

  let ziel: UploadZiel;
  if (bereich === "eingang") {
    // Nur der Dokumenttyp ist Pflicht (steuert u.a., ob die Texterkennung läuft).
    if (!istGueltigeArt(formData.get("art"))) throw new AktionsFehler("Bitte den Dokumenttyp wählen.");
    ziel = { eingang: true, revalidatePath: "/dokumente" };
  } else if (bereich === "allgemein") {
    if (ordner.length > 80) throw new AktionsFehler("Der Ordnername darf höchstens 80 Zeichen lang sein.");
    ziel = { ordner: ordner || null, revalidatePath: "/dokumente" };
  } else {
    if (!bezugId) throw new AktionsFehler("Bitte auswählen, wo das Dokument abgelegt werden soll.");
    // Existenz prüfen, damit kein Dokument mit ungültigem Fremdschlüssel (generische Fehlermeldung) entsteht.
    const vorhanden =
      bereich === "mietvertraege"
        ? await prisma.mietvertrag.findUnique({ where: { id: bezugId }, select: { id: true } })
        : bereich === "einheiten"
          ? await prisma.einheit.findUnique({ where: { id: bezugId }, select: { id: true } })
          : bereich === "dienstleister"
            ? await prisma.dienstleister.findUnique({ where: { id: bezugId }, select: { id: true } })
            : await prisma.ticket.findUnique({ where: { id: bezugId }, select: { id: true } });
    if (!vorhanden) throw new AktionsFehler("Die Auswahl existiert nicht mehr.");
    ziel =
      bereich === "mietvertraege"
        ? { mietvertragId: bezugId, revalidatePath: "/dokumente" }
        : bereich === "einheiten"
          ? { einheitId: bezugId, revalidatePath: "/dokumente" }
          : bereich === "dienstleister"
            ? { dienstleisterId: bezugId, revalidatePath: "/dokumente" }
            : { ticketId: bezugId, revalidatePath: "/dokumente" };
  }

  const fehler = await uploadDokument(ziel, null, formData);
  if (fehler) throw new AktionsFehler(fehler);
  // Die Detailseite des Bezugs zeigt das Dokument ebenfalls.
  if (bereich !== "allgemein" && bereich !== "eingang") {
    const pfad = { mietvertraege: "mietvertraege", einheiten: "einheiten", dienstleister: "dienstleister", tickets: "tickets" }[
      bereich as "mietvertraege" | "einheiten" | "dienstleister" | "tickets"
    ];
    revalidatePath(`/${pfad}/${bezugId}`);
  }
  return null;
});

// Ordner eines allgemeinen Dokuments ändern (leer = „Ohne Ordner“). Mit Bezug gibt es keinen Ordner.
export async function aendereOrdner(id: string, ordner: string): Promise<void> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument || dokument.eingang || dokument.buchungId || dokument.mietvertragId || dokument.einheitId || dokument.dienstleisterId || dokument.ticketId) return;
  await prisma.dokument.update({ where: { id }, data: { ordner: ordner.trim().slice(0, 80) || null } });
  revalidatePath("/dokumente");
}

// Dokumentart nachträglich ändern (leer = keine Angabe).
export async function aendereArt(id: string, art: string): Promise<void> {
  await requireEditor();
  await prisma.dokument.update({ where: { id }, data: { art: istGueltigeArt(art) ? art : null } });
  revalidatePath("/dokumente");
}

// ---- Labels, Texterkennung und Zuordnung (Detailseite /dokumente/[id]) ----

function textFeld(wert: FormDataEntryValue | null, max: number): string | null {
  if (typeof wert !== "string") return null;
  const t = wert.trim().replace(/\s+/g, " ");
  return t ? t.slice(0, max) : null;
}

// "1.234,56" / "1234,56" / "1234.56" / "−12,5 €" → Zahl; leer → null; Unsinn → Fehler.
function parseBetrag(wert: FormDataEntryValue | null): number | null {
  if (typeof wert !== "string" || !wert.trim()) return null;
  let t = wert.replace(/[€\s]/g, "").replace("−", "-");
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  const zahl = Number(t);
  if (!/^-?\d+(\.\d+)?$/.test(t) || !Number.isFinite(zahl) || Math.abs(zahl) > 99999999) throw new AktionsFehler("Der Betrag ist keine gültige Zahl.");
  return Math.round(zahl * 100) / 100;
}

export const speichereDokumentLabels = mitMeldung(async function speichereDokumentLabels(
  id: string,
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const artWert = formData.get("art");
  const jahrText = textFeld(formData.get("kostenjahr"), 4);
  if (jahrText && !/^(20\d{2}|19\d{2})$/.test(jahrText)) throw new AktionsFehler("Das Kostenjahr muss eine vierstellige Jahreszahl sein.");
  const iban = textFeld(formData.get("iban"), 40)?.replace(/\s/g, "").toUpperCase() ?? null;
  if (iban && !istGueltigeIban(iban)) throw new AktionsFehler("Die IBAN ist ungültig (Aufbau oder Prüfziffer).");
  const kostenartId = textFeld(formData.get("kostenartId"), 40);
  if (kostenartId && !(await prisma.kostenart.findUnique({ where: { id: kostenartId }, select: { id: true } }))) {
    throw new AktionsFehler("Die Kostenart existiert nicht mehr.");
  }

  await prisma.dokument.update({
    where: { id },
    data: {
      art: istGueltigeArt(artWert) ? artWert : null,
      belegDatum: parseBelegDatum(formData.get("belegDatum")),
      aussteller: textFeld(formData.get("aussteller"), 200),
      rechnungsnummer: textFeld(formData.get("rechnungsnummer"), 60),
      betrag: parseBetrag(formData.get("betrag")),
      leistungVon: parseBelegDatum(formData.get("leistungVon")),
      leistungBis: parseBelegDatum(formData.get("leistungBis")),
      kostenjahr: jahrText ? Number(jahrText) : null,
      iban,
      kostenartId,
      adressat: textFeld(formData.get("adressat"), 200),
      objektHinweis: textFeld(formData.get("objektHinweis"), 300),
    },
  });
  revalidatePath(`/dokumente/${id}`);
  revalidatePath("/dokumente");
  return null;
});

// Texterkennung auf Knopfdruck (auch für Dokumente, die beim Hochladen nicht erkannt wurden). Füllt nur
// leere Labels; mit „überschreiben“ ersetzt sie auch bereits gesetzte durch das neue Ergebnis.
export const erkenneDokument = mitMeldung(async function erkenneDokument(id: string, ueberschreiben: boolean): Promise<string | null> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) throw new AktionsFehler("Das Dokument existiert nicht mehr.");
  if (!istErkennbar(dokument.mimeType)) throw new AktionsFehler("Nur PDF-Dateien und Bilder (PNG, JPG, WebP) lassen sich erkennen.");
  if (ueberschreiben) {
    await prisma.dokument.update({
      where: { id },
      data: {
        aussteller: null, rechnungsnummer: null, betrag: null, leistungVon: null, leistungBis: null, kostenjahr: null,
        iban: null, kostenartId: null, adressat: null, objektHinweis: null, belegDatum: null,
      },
    });
  }
  let inhalt: Buffer;
  try {
    inhalt = await leseDatei(dokument.speicherpfad);
  } catch {
    throw new AktionsFehler("Die Datei ist nicht mehr verfügbar.");
  }
  try {
    await fuehreErkennungAus(id, inhalt, dokument.mimeType!);
  } catch (err) {
    console.error("Texterkennung fehlgeschlagen", err);
    throw new AktionsFehler(`Die Texterkennung ist fehlgeschlagen: ${erkennungsMeldung(err)}`);
  }
  revalidatePath(`/dokumente/${id}`);
  revalidatePath("/dokumente");
  return null;
});

export type ZuordnungsZiel = "buchung" | "mietvertrag" | "einheit" | "dienstleister" | "ticket";

// Ordnet ein Dokument aus dem Eingang einmalig einem Bezug zu; danach ist der Bezug fest.
export const ordneDokumentZu = mitMeldung(async function ordneDokumentZu(
  id: string,
  ziel: ZuordnungsZiel,
  zielId: string,
): Promise<string | null> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) throw new AktionsFehler("Das Dokument existiert nicht mehr.");
  if (!dokument.eingang) throw new AktionsFehler("Das Dokument ist schon zugeordnet.");
  if (!zielId) throw new AktionsFehler("Bitte ein Ziel wählen.");

  let data: Prisma.DokumentUncheckedUpdateInput;
  let pfad: string;
  if (ziel === "buchung") {
    const b = await prisma.buchung.findFirst({
      where: { id: zielId, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER },
      select: { id: true },
    });
    if (!b) throw new AktionsFehler("Die Kostenposition existiert nicht mehr oder ist storniert.");
    data = { buchungId: zielId };
    pfad = `/kosten/${zielId}`;
  } else if (ziel === "mietvertrag") {
    if (!(await prisma.mietvertrag.findUnique({ where: { id: zielId }, select: { id: true } }))) throw new AktionsFehler("Der Mietvertrag existiert nicht mehr.");
    data = { mietvertragId: zielId };
    pfad = `/mietvertraege/${zielId}`;
  } else if (ziel === "einheit") {
    if (!(await prisma.einheit.findUnique({ where: { id: zielId }, select: { id: true } }))) throw new AktionsFehler("Die Einheit existiert nicht mehr.");
    data = { einheitId: zielId };
    pfad = `/einheiten/${zielId}`;
  } else if (ziel === "dienstleister") {
    if (!(await prisma.dienstleister.findUnique({ where: { id: zielId }, select: { id: true } }))) throw new AktionsFehler("Der Dienstleister existiert nicht mehr.");
    data = { dienstleisterId: zielId };
    pfad = `/dienstleister/${zielId}`;
  } else {
    if (!(await prisma.ticket.findUnique({ where: { id: zielId }, select: { id: true } }))) throw new AktionsFehler("Das Ticket existiert nicht mehr.");
    data = { ticketId: zielId };
    pfad = `/tickets/${zielId}`;
  }

  await prisma.dokument.update({ where: { id }, data: { ...data, eingang: false } });
  revalidatePath(pfad);
  revalidatePath(`/dokumente/${id}`);
  revalidatePath("/dokumente");
  return null;
});

// Alle „sicheren“ Vorschläge auf einmal übernehmen (Betrag stimmt und Rechnungsnummer bzw. Empfänger+Datum
// passen, siehe bewerteBuchung) — als Sammelbestätigung auf der Eingang-Liste; nie ohne Klick.
export const uebernehmeSichereVorschlaege = mitMeldung(async function uebernehmeSichereVorschlaege(): Promise<string | null> {
  await requireEditor();
  const eingang = await prisma.dokument.findMany({
    where: { eingang: true, ausgeblendetAm: null },
    select: {
      id: true, aussteller: true, rechnungsnummer: true, betrag: true, belegDatum: true, kostenjahr: true,
      iban: true, adressat: true, objektHinweis: true,
    },
  });
  const vergeben = new Set<string>();
  let anzahl = 0;
  for (const d of eingang) {
    if (d.betrag === null) continue;
    const vorschlaege = await ladeBuchungVorschlaege({
      aussteller: d.aussteller, rechnungsnummer: d.rechnungsnummer, betrag: Number(d.betrag), belegDatum: d.belegDatum,
      kostenjahr: d.kostenjahr, iban: d.iban, adressat: d.adressat, objektHinweis: d.objektHinweis,
    });
    const sichere = vorschlaege.filter((v) => v.bewertung.sicher && v.belege === 0 && !vergeben.has(v.buchungId));
    // Nur bei genau einem sicheren Treffer — sonst bleibt die Entscheidung beim Nutzer.
    if (sichere.length !== 1) continue;
    vergeben.add(sichere[0].buchungId);
    await prisma.dokument.update({ where: { id: d.id }, data: { buchungId: sichere[0].buchungId, eingang: false } });
    anzahl += 1;
  }
  revalidatePath("/dokumente");
  revalidatePath("/kosten");
  return anzahl === 0 ? "Keine eindeutigen Treffer gefunden." : null;
});
