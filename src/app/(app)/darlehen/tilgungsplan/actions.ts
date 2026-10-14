"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { requireEditor, benutzerLabel } from "@/lib/session";
import { AktionsFehler, mitMeldung } from "@/lib/aktion";
import type { Bankwert, Zinsstufe } from "@/lib/tilgungsplan";

function zahl(text: FormDataEntryValue | null | undefined): number {
  const t = String(text ?? "").trim().replace(/\s/g, "");
  if (!t) return NaN;
  return t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
}

function datum(text: FormDataEntryValue | null, feld: string, pflicht: boolean): Date | null {
  const t = String(text ?? "").trim();
  if (!t) {
    if (pflicht) throw new AktionsFehler(`${feld}: bitte ein Datum angeben.`);
    return null;
  }
  const d = new Date(`${t}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime())) throw new AktionsFehler(`${feld}: ungültiges Datum.`);
  return d;
}

const cent = (n: number) => Math.round(n * 100) / 100;

function leseListe(text: FormDataEntryValue | null, name: string): unknown[] {
  const t = String(text ?? "").trim();
  if (!t) return [];
  try {
    const v = JSON.parse(t);
    if (Array.isArray(v)) return v;
  } catch {
    // fällt in die Fehlermeldung unten
  }
  throw new AktionsFehler(`${name}: ungültige Eingabe.`);
}

function pruefeStufen(roh: unknown[]): Zinsstufe[] {
  return roh.map((r) => {
    const o = r as { ab?: unknown; zinssatz?: unknown; rate?: unknown };
    const ab = String(o.ab ?? "");
    const zinssatz = Number(o.zinssatz);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ab) || Number.isNaN(new Date(`${ab}T00:00:00Z`).getTime())) {
      throw new AktionsFehler("Zinsänderung: bitte ein gültiges Datum „ab“ angeben.");
    }
    if (!Number.isFinite(zinssatz) || zinssatz < 0 || zinssatz > 30) throw new AktionsFehler("Zinsänderung: der Zinssatz muss zwischen 0 und 30 % liegen.");
    const stufe: Zinsstufe = { ab, zinssatz };
    if (o.rate !== undefined && o.rate !== null && o.rate !== "") {
      const rate = Number(o.rate);
      if (!Number.isFinite(rate) || rate < 0) throw new AktionsFehler("Zinsänderung: ungültige Rate.");
      stufe.rate = cent(rate);
    }
    return stufe;
  });
}

function pruefeBankwerte(roh: unknown[]): Bankwert[] {
  const jahre = new Set<number>();
  return roh.map((r) => {
    const o = r as Record<string, unknown>;
    const jahr = Number(o.jahr);
    if (!Number.isInteger(jahr) || jahr < 2000 || jahr > 2100) throw new AktionsFehler("Bankwerte: ungültiges Jahr.");
    if (jahre.has(jahr)) throw new AktionsFehler(`Bankwerte: das Jahr ${jahr} steht doppelt da.`);
    jahre.add(jahr);
    const wert: Bankwert = { jahr };
    for (const feld of ["zinsen", "tilgung", "restschuld"] as const) {
      const v = o[feld];
      if (v === undefined || v === null || v === "") continue;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) throw new AktionsFehler(`Bankwerte ${jahr}: ungültiger Betrag bei „${feld}“.`);
      wert[feld] = cent(n);
    }
    if (wert.zinsen === undefined && wert.tilgung === undefined && wert.restschuld === undefined) {
      throw new AktionsFehler(`Bankwerte ${jahr}: bitte mindestens einen Betrag angeben (oder die Zeile entfernen).`);
    }
    return wert;
  });
}

export const speichereDarlehen = mitMeldung(async function speichereDarlehen(formData: FormData) {
  const user = await requireEditor();
  const id = String(formData.get("id") ?? "");
  const bezeichnung = String(formData.get("bezeichnung") ?? "").trim();
  if (!bezeichnung) throw new AktionsFehler("Bitte eine Bezeichnung angeben.");
  if (bezeichnung.length > 100) throw new AktionsFehler("Die Bezeichnung ist zu lang (höchstens 100 Zeichen).");
  const darlehensnummer = String(formData.get("darlehensnummer") ?? "").trim();
  const bank = String(formData.get("bank") ?? "").trim();
  const bemerkung = String(formData.get("bemerkung") ?? "").trim();
  if (darlehensnummer.length > 50 || bank.length > 100) throw new AktionsFehler("Darlehensnummer oder Bank ist zu lang.");
  if (bemerkung.length > 500) throw new AktionsFehler("Die Bemerkung ist zu lang (höchstens 500 Zeichen).");

  const darlehensbetrag = zahl(formData.get("darlehensbetrag"));
  const startRestschuld = zahl(formData.get("startRestschuld"));
  const rate = zahl(formData.get("rate"));
  const zinssatz = zahl(formData.get("zinssatz"));
  const zahltag = Number(formData.get("zahltag") || 15);
  if (!(darlehensbetrag > 0)) throw new AktionsFehler("Der Darlehensbetrag muss größer als 0 sein.");
  if (!(startRestschuld >= 0)) throw new AktionsFehler("Die Restschuld zum Stichtag darf nicht negativ sein.");
  if (!(rate > 0)) throw new AktionsFehler("Die Rate muss größer als 0 sein.");
  if (!(zinssatz >= 0 && zinssatz <= 30)) throw new AktionsFehler("Der Zinssatz muss zwischen 0 und 30 % liegen.");
  if (!Number.isInteger(zahltag) || zahltag < 1 || zahltag > 28) throw new AktionsFehler("Der Zahltag muss zwischen 1 und 28 liegen.");

  const startDatum = datum(formData.get("startDatum"), "Stichtag der Restschuld", true)!;
  const zinsbindungBis = datum(formData.get("zinsbindungBis"), "Zinsbindung bis", false);
  const laufzeitEnde = datum(formData.get("laufzeitEnde"), "Laufzeitende", false);
  if (laufzeitEnde && laufzeitEnde.getTime() <= startDatum.getTime()) {
    throw new AktionsFehler("Das Laufzeitende muss nach dem Stichtag der Restschuld liegen.");
  }

  const stufen = pruefeStufen(leseListe(formData.get("stufen"), "Zinsänderungen"));
  const bankwerte = pruefeBankwerte(leseListe(formData.get("bankwerte"), "Bankwerte"));

  const data = {
    bezeichnung,
    darlehensnummer: darlehensnummer || null,
    bank: bank || null,
    darlehensbetrag: cent(darlehensbetrag),
    startRestschuld: cent(startRestschuld),
    startDatum,
    rate: cent(rate),
    zinssatz: Math.round(zinssatz * 10000) / 10000,
    zahltag,
    zinsbindungBis,
    laufzeitEnde,
    stufen: stufen.length ? (stufen as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    bankwerte: bankwerte.length ? (bankwerte as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    bemerkung: bemerkung || null,
    aktiv: formData.get("aktiv") === "on",
  };

  let zielId = id;
  if (id) {
    const vorhanden = await prisma.darlehen.findUnique({ where: { id }, select: { id: true } });
    if (!vorhanden) throw new AktionsFehler("Das Darlehen gibt es nicht mehr.");
    await prisma.darlehen.update({ where: { id }, data });
  } else {
    const neu = await prisma.darlehen.create({ data: { ...data, erstelltVon: benutzerLabel(user) } });
    zielId = neu.id;
  }
  revalidatePath("/darlehen/tilgungsplan");
  redirect(`/darlehen/tilgungsplan?darlehen=${zielId}`);
});

export const loescheDarlehen = mitMeldung(async function loescheDarlehen(id: string) {
  await requireEditor();
  await prisma.darlehen.deleteMany({ where: { id } });
  revalidatePath("/darlehen/tilgungsplan");
  redirect("/darlehen/tilgungsplan");
});
