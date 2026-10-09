"use server";

import { revalidatePath } from "next/cache";
import { parseStrengesDatum } from "@/lib/zod-datum";
import { prisma } from "@/lib/prisma";
import { benutzerLabel, requireEditor } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import { MAX_DOKUMENT_GROESSE_BYTES } from "@/lib/upload-limits";
import { AUTOMATISCH_NICHT_LESEN, istGueltigeArt } from "@/lib/dokumente-anzeige";
import { erkenneDokumentInhalt, istErkennbar, istGueltigeIban } from "@/lib/dokument-erkennung";
import { AKTIVE_BUCHUNG_FILTER } from "@/lib/buchung-storno";
import type { Prisma } from "@/generated/prisma/client";
import { speichereDatei, loescheDatei, leseDatei } from "@/lib/storage";
import { ladeBezugOptionen } from "@/lib/dokumente-uebersicht";
import { ladeBuchungAuswahl, ladeBuchungVorschlaege, type DokumentLabels } from "@/lib/dokument-zuordnung";

type UploadZiel =
  | { buchungId: string; revalidatePath: string }
  | { mietvertragId: string; revalidatePath: string }
  | { einheitId: string; revalidatePath: string }
  | { gebaeudeId: string; revalidatePath: string }
  | { dienstleisterId: string; revalidatePath: string }
  | { ticketId: string; revalidatePath: string }
  // Eingang: noch ohne Bezug und nicht abgelegt (Seite /dokumente/[id]).
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
      titel: d.titel ?? e.titel ?? undefined,
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
  // Optionaler Titel (z.B. beim Upload eines Vertrags), gilt für alle Dateien dieses Uploads.
  const titel = textFeld(formData.get("titel"), 200);

  // Texterkennung beim Hochladen mit gesetztem Häkchen; Mieterunterlagen (Vertrag, Schreiben, Protokoll) und
  // Fotos werden nie automatisch gelesen (siehe AUTOMATISCH_NICHT_LESEN). Schlägt sie fehl, bleibt das
  // Dokument trotzdem gespeichert.
  const erkennen = formData.get("erkennen") === "1" && !(art !== null && AUTOMATISCH_NICHT_LESEN.includes(art));

  const angelegt: { id: string; inhalt: Buffer; mimeType: string }[] = [];
  for (const file of files) {
    const inhalt = Buffer.from(await file.arrayBuffer());
    const speicherpfad = await speichereDatei(inhalt, file.name);
    const dokument = await prisma.dokument.create({
      data: {
        dateiname: file.name,
        speicherpfad,
        mimeType: file.type || null,
        groesseBytes: file.size,
        buchungId: "buchungId" in ziel ? ziel.buchungId : undefined,
        mietvertragId: "mietvertragId" in ziel ? ziel.mietvertragId : undefined,
        einheitId: "einheitId" in ziel ? ziel.einheitId : undefined,
        gebaeudeId: "gebaeudeId" in ziel ? ziel.gebaeudeId : undefined,
        dienstleisterId: "dienstleisterId" in ziel ? ziel.dienstleisterId : undefined,
        ticketId: "ticketId" in ziel ? ziel.ticketId : undefined,
        ordner: "ordner" in ziel ? ziel.ordner : undefined,
        eingang: "eingang" in ziel ? true : undefined,
        art,
        titel,
        hochgeladenVon: user.email ?? user.name ?? null,
        belegDatum,
      },
    });
    if (erkennen && istErkennbar(file.type)) angelegt.push({ id: dokument.id, inhalt, mimeType: file.type });
  }

  // Erkennung der (höchstens ein paar) Dateien parallel — jede dauert einige Sekunden.
  let erkennungsFehler: string | null = null;
  await Promise.all(
    angelegt.map(async (d) => {
      try {
        await fuehreErkennungAus(d.id, d.inhalt, d.mimeType);
      } catch (err) {
        console.error("Texterkennung fehlgeschlagen", err);
        erkennungsFehler = erkennungsMeldung(err);
      }
    }),
  );

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

const MAX_DATEIEN_JE_UPLOAD = 4;
// Vercel begrenzt den Request-Body auf 4,5 MB (siehe upload-limits.ts) — mehrere Dateien müssen zusammen darunter bleiben.
const MAX_GESAMTGROESSE_BYTES = 4 * 1024 * 1024;

// Upload von der Seite /dokumente: nur Datei(en) — alles Weitere (Typ, Bezüge) kommt aus der Texterkennung bzw.
// wird im Eingang bestätigt. Ist ein Ordner geöffnet, legt „ablegen=direkt“ die Dateien gleich dort ab
// (Bezug aus bereich/bezugId bzw. Ordnername für „Unkategorisiert“), sonst landen sie im Eingang.
export const uploadDokumentZentral = mitMeldung(async function uploadDokumentZentral(
  _prev: string | null,
  formData: FormData,
): Promise<string | null> {
  await requireEditor();
  const files = formData.getAll("file").filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) throw new AktionsFehler("Bitte eine Datei auswählen.");
  if (files.length > MAX_DATEIEN_JE_UPLOAD) throw new AktionsFehler(`Bitte höchstens ${MAX_DATEIEN_JE_UPLOAD} Dateien auf einmal hochladen.`);
  for (const f of files) {
    if (f.size > MAX_DOKUMENT_GROESSE_BYTES) throw new AktionsFehler(`„${f.name}“ ist größer als ${MAX_DOKUMENT_GROESSE_BYTES / (1024 * 1024)} MB.`);
  }
  if (files.reduce((s, f) => s + f.size, 0) > MAX_GESAMTGROESSE_BYTES) throw new AktionsFehler("Die Dateien sind zusammen größer als 4 MB — bitte in zwei Uploads aufteilen.");

  const bereich = String(formData.get("bereich") ?? "");
  const bezugId = String(formData.get("bezugId") ?? "");
  const ordner = String(formData.get("ordner") ?? "").trim();
  const direkt = formData.get("ablegen") === "direkt";

  let ziel: UploadZiel = { eingang: true, revalidatePath: "/dokumente" };
  let bezugPfad: string | null = null;
  if (direkt && bereich === "allgemein") {
    if (ordner.length > 80) throw new AktionsFehler("Der Ordnername darf höchstens 80 Zeichen lang sein.");
    ziel = { ordner: ordner || null, revalidatePath: "/dokumente" };
  } else if (direkt && (bereich in DIREKT_BEREICHE)) {
    const z = DIREKT_BEREICHE[bereich as keyof typeof DIREKT_BEREICHE];
    if (!bezugId) throw new AktionsFehler("Bitte auswählen, wo das Dokument abgelegt werden soll.");
    await pruefeZiel(z, bezugId);
    ziel = { [BEZUG_FELD[z]]: bezugId, revalidatePath: "/dokumente" } as UploadZiel;
    bezugPfad = ZIEL_PFAD[z](bezugId);
  }

  const fehler = await uploadDokument(ziel, null, formData);
  // Die Detailseite des Bezugs zeigt das Dokument ebenfalls.
  if (bezugPfad) revalidatePath(bezugPfad);
  if (fehler) throw new AktionsFehler(fehler);
  return null;
});

// Ordner eines allgemeinen Dokuments ändern (leer = „Ohne Ordner“). Mit Bezug gibt es keinen Ordner.
export async function aendereOrdner(id: string, ordner: string): Promise<void> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument || dokument.eingang || hatBezug(dokument)) return;
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
  // Das Formular zeigt je Dokumenttyp nur passende Felder: geändert wird nur, was mitgeschickt wurde
  // (ein leeres Feld leert den Wert, ein fehlendes lässt ihn unverändert).
  const data: Prisma.DokumentUncheckedUpdateInput = {};
  const artWert = formData.get("art");
  if (formData.has("art")) data.art = istGueltigeArt(artWert) ? artWert : null;
  if (formData.has("titel")) data.titel = textFeld(formData.get("titel"), 200);
  if (formData.has("belegDatum")) data.belegDatum = parseBelegDatum(formData.get("belegDatum"));
  if (formData.has("aussteller")) data.aussteller = textFeld(formData.get("aussteller"), 200);
  if (formData.has("rechnungsnummer")) data.rechnungsnummer = textFeld(formData.get("rechnungsnummer"), 60);
  if (formData.has("betrag")) data.betrag = parseBetrag(formData.get("betrag"));
  if (formData.has("leistungVon")) data.leistungVon = parseBelegDatum(formData.get("leistungVon"));
  if (formData.has("leistungBis")) data.leistungBis = parseBelegDatum(formData.get("leistungBis"));
  if (formData.has("kostenjahr")) {
    const jahrText = textFeld(formData.get("kostenjahr"), 4);
    if (jahrText && !/^(20\d{2}|19\d{2})$/.test(jahrText)) throw new AktionsFehler("Das Jahr muss eine vierstellige Jahreszahl sein.");
    data.kostenjahr = jahrText ? Number(jahrText) : null;
  }
  if (formData.has("iban")) {
    const iban = textFeld(formData.get("iban"), 40)?.replace(/\s/g, "").toUpperCase() ?? null;
    if (iban && !istGueltigeIban(iban)) throw new AktionsFehler("Die IBAN ist ungültig (Aufbau oder Prüfziffer).");
    data.iban = iban;
  }
  if (formData.has("kostenartId")) {
    const kostenartId = textFeld(formData.get("kostenartId"), 40);
    if (kostenartId && !(await prisma.kostenart.findUnique({ where: { id: kostenartId }, select: { id: true } }))) {
      throw new AktionsFehler("Die Kostenart existiert nicht mehr.");
    }
    data.kostenartId = kostenartId;
  }
  if (formData.has("adressat")) data.adressat = textFeld(formData.get("adressat"), 200);
  if (formData.has("objektHinweis")) data.objektHinweis = textFeld(formData.get("objektHinweis"), 300);

  await prisma.dokument.update({ where: { id }, data });
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
        iban: null, kostenartId: null, adressat: null, objektHinweis: null, belegDatum: null, titel: null,
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

export type ZuordnungsZiel = "buchung" | "mietvertrag" | "einheit" | "gebaeude" | "dienstleister" | "ticket";

// Zuordnung von Bereich (Ordneransicht) bzw. Ziel zum Fremdschlüsselfeld und zur Detailseite des Bezugs.
const BEZUG_FELD = {
  buchung: "buchungId",
  mietvertrag: "mietvertragId",
  einheit: "einheitId",
  gebaeude: "gebaeudeId",
  dienstleister: "dienstleisterId",
  ticket: "ticketId",
} as const satisfies Record<ZuordnungsZiel, string>;

const ZIEL_PFAD: Record<ZuordnungsZiel, (id: string) => string> = {
  buchung: (id) => `/kosten/${id}`,
  mietvertrag: (id) => `/mietvertraege/${id}`,
  einheit: (id) => `/einheiten/${id}`,
  gebaeude: (id) => `/gebaeude/${id}`,
  dienstleister: (id) => `/dienstleister/${id}`,
  ticket: (id) => `/tickets/${id}`,
};

const ZIEL_NAME: Record<ZuordnungsZiel, string> = {
  buchung: "Kostenposition",
  mietvertrag: "Mietvertrag",
  einheit: "Einheit",
  gebaeude: "Gebäude",
  dienstleister: "Dienstleister",
  ticket: "Ticket",
};

// Bereiche der Ordneransicht, in denen „direkt ablegen“ einen Bezug setzt (Kosten brauchen eine konkrete Buchung).
const DIREKT_BEREICHE = {
  mietvertraege: "mietvertrag",
  einheiten: "einheit",
  gebaeude: "gebaeude",
  dienstleister: "dienstleister",
  tickets: "ticket",
} as const satisfies Record<string, ZuordnungsZiel>;

type DokumentMitBezug = Pick<Prisma.DokumentUncheckedCreateInput, "buchungId" | "mietvertragId" | "einheitId" | "gebaeudeId" | "dienstleisterId" | "ticketId">;

function hatBezug(d: DokumentMitBezug): boolean {
  return (Object.values(BEZUG_FELD) as (keyof DokumentMitBezug)[]).some((f) => !!d[f]);
}

// Existenz prüfen, damit kein Dokument mit ungültigem Fremdschlüssel (generische Fehlermeldung) entsteht.
async function pruefeZiel(ziel: ZuordnungsZiel, id: string): Promise<void> {
  const select = { id: true } as const;
  const vorhanden =
    ziel === "buchung"
      ? await prisma.buchung.findFirst({ where: { id, buchungsart: { code: "KOSTENPOSITION" }, ...AKTIVE_BUCHUNG_FILTER }, select })
      : ziel === "mietvertrag"
        ? await prisma.mietvertrag.findUnique({ where: { id }, select })
        : ziel === "einheit"
          ? await prisma.einheit.findUnique({ where: { id }, select })
          : ziel === "gebaeude"
            ? await prisma.gebaeude.findUnique({ where: { id }, select })
            : ziel === "dienstleister"
              ? await prisma.dienstleister.findUnique({ where: { id }, select })
              : await prisma.ticket.findUnique({ where: { id }, select });
  if (!vorhanden) {
    throw new AktionsFehler(ziel === "buchung" ? "Die Kostenposition existiert nicht mehr oder ist storniert." : `${ZIEL_NAME[ziel]}: Die Auswahl existiert nicht mehr.`);
  }
}

function revalidiereDokument(id: string, d: DokumentMitBezug) {
  revalidatePath(`/dokumente/${id}`);
  revalidatePath("/dokumente");
  for (const z of Object.keys(BEZUG_FELD) as ZuordnungsZiel[]) {
    const wert = d[BEZUG_FELD[z]];
    if (wert) revalidatePath(ZIEL_PFAD[z](wert));
  }
}

// Fügt einen Bezug hinzu (ein Dokument darf mehrere haben, je Art aber nur einen). Damit gilt es als abgelegt
// und verlässt den Eingang. Eine Kostenposition ist ein fester Nachweis und lässt sich später nicht ersetzen.
export const ordneDokumentZu = mitMeldung(async function ordneDokumentZu(
  id: string,
  ziel: ZuordnungsZiel,
  zielId: string,
): Promise<string | null> {
  await requireEditor();
  const dokument = await prisma.dokument.findUnique({ where: { id } });
  if (!dokument) throw new AktionsFehler("Das Dokument existiert nicht mehr.");
  if (!zielId) throw new AktionsFehler("Bitte ein Ziel wählen.");
  const feld = BEZUG_FELD[ziel];
  const aktuell = dokument[feld];
  if (aktuell === zielId) return null;
  if (aktuell) {
    throw new AktionsFehler(
      ziel === "buchung"
        ? "Der Beleg gehört schon zu einer Kostenposition und lässt sich nicht umhängen."
        : `Es ist schon ein Bezug „${ZIEL_NAME[ziel]}“ gesetzt — bitte zuerst entfernen.`,
    );
  }
  await pruefeZiel(ziel, zielId);
  const neu = await prisma.dokument.update({ where: { id }, data: { [feld]: zielId, eingang: false } });
  revalidiereDokument(id, neu);
  return null;
});

// Entfernt einen Bezug. Die Kostenposition bleibt (Löschsperre: der Beleg ist der Nachweis zur Buchung).
export const entferneBezug = mitMeldung(async function entferneBezug(id: string, ziel: ZuordnungsZiel): Promise<string | null> {
  await requireEditor();
  if (ziel === "buchung") throw new AktionsFehler("Ein Kostenbeleg behält seine Kostenposition (Löschsperre).");
  const alt = await prisma.dokument.findUnique({ where: { id } });
  if (!alt) throw new AktionsFehler("Das Dokument existiert nicht mehr.");
  const neu = await prisma.dokument.update({ where: { id }, data: { [BEZUG_FELD[ziel]]: null } });
  revalidiereDokument(id, alt);
  revalidiereDokument(id, neu);
  return null;
});

// Legt ein Dokument aus dem Eingang ab, auch ohne Bezug (z.B. Versicherungspolice); der optionale Ordnername gilt nur ohne Bezug.
export const legeDokumentAb = mitMeldung(async function legeDokumentAb(id: string, ordner: string): Promise<string | null> {
  await requireEditor();
  const name = ordner.trim();
  if (name.length > 80) throw new AktionsFehler("Der Ordnername darf höchstens 80 Zeichen lang sein.");
  const d = await prisma.dokument.findUnique({ where: { id } });
  if (!d) throw new AktionsFehler("Das Dokument existiert nicht mehr.");
  await prisma.dokument.update({ where: { id }, data: { eingang: false, ...(hatBezug(d) ? {} : { ordner: name || null }) } });
  revalidiereDokument(id, d);
  return null;
});

// Auswahl für den direkten Upload (Mietvertrag, Einheit oder Gebäude je nach Typ) — erst beim Wählen des Typs nachgeladen.
export async function ladeDirektAuswahl(bereich: "mietvertraege" | "einheiten" | "gebaeude") {
  await requireEditor();
  const optionen = await ladeBezugOptionen();
  return optionen[bereich];
}

// Auswahllisten für „Bezug hinzufügen“ auf der Detailseite — erst beim Öffnen nachgeladen (Vercel-CPU).
export async function ladeBezugAuswahl(id: string) {
  await requireEditor();
  const d = await prisma.dokument.findUnique({ where: { id } });
  if (!d) return null;
  const labels: DokumentLabels = {
    aussteller: d.aussteller, rechnungsnummer: d.rechnungsnummer, betrag: d.betrag === null ? null : Number(d.betrag),
    belegDatum: d.belegDatum, kostenjahr: d.kostenjahr, iban: d.iban, adressat: d.adressat, objektHinweis: d.objektHinweis,
  };
  const [bezug, buchungen] = await Promise.all([ladeBezugOptionen(), ladeBuchungAuswahl(labels)]);
  return {
    buchung: buchungen,
    mietvertrag: bezug.mietvertraege,
    einheit: bezug.einheiten,
    gebaeude: bezug.gebaeude,
    dienstleister: bezug.dienstleister,
    ticket: bezug.tickets,
  };
}

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
